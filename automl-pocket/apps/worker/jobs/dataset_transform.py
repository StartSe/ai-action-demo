"""Job dataset:transform (US-036): aplica transformação e versiona o dataset.

Fluxo: lê o parquet da versão ativa (COALESCE com o original), aplica a
transformação (type_change ou clean), grava um NOVO parquet (uuid, nunca
sobrescreve o anterior), re-perfila com a lógica do dataset:profile e registra
dataset_versions com columns_snapshot; datasets aponta para a nova versão.

Durante o processamento datasets.status = 'profiling'; ao final volta SEMPRE
a 'ready' — falha de transformação não derruba o dataset (B10a): a mensagem em
português vai para datasets.last_transform_error (o Prepare mostra em banner
com a grade intacta) e nenhuma versão é criada. Transformação que não altera
nada (B6) também não cria versão — a UI detecta pelo par (status ready, mesma
versão) e avisa "sem mudanças".
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from uuid import uuid4

import pandas as pd

from jobs import db
from jobs.dataset_parse import SAMPLE_MAX_ROWS, upload_dir
from jobs.inference import ColumnInfo
from jobs.profiling import profile_dataframe
from jobs.transform import (
    TYPE_LABELS,
    TransformError,
    apply_clean,
    apply_type_change,
)

logger = logging.getLogger("worker.dataset_transform")

GENERIC_ERROR_MESSAGE = (
    "Não foi possível aplicar a transformação. Tente novamente em instantes."
)
CLEAN_LABEL = "Limpeza de dados"


def write_version_parquet(df: pd.DataFrame, directory: Path) -> str:
    """Grava o DataFrame num parquet novo (nome uuid) sem tocar nos anteriores."""
    parquet_name = f"{uuid4()}.parquet"
    df.to_parquet(directory / parquet_name, index=False)
    return parquet_name


def is_noop_transform(
    original_df: pd.DataFrame,
    original_columns: list[ColumnInfo],
    df: pd.DataFrame,
    columns: list[ColumnInfo],
) -> bool:
    """Transformação sem efeito (B6): dados E metadados de coluna idênticos.

    Mudança só de tipo lógico (ex.: text → category, mesmo dado) NÃO é no-op —
    o badge da grade muda. df.equals cobre valores, dtypes e forma.
    """
    if [(c.name, c.type) for c in columns] != [
        (c.name, c.type) for c in original_columns
    ]:
        return False
    return df.equals(original_df)


def run_transform_job(dataset_id: str, kind: str, params: dict) -> None:
    """Processa um job dataset:transform. Lança exceção em falha (job vira failed)."""
    with db.connect() as conn:
        row = conn.execute(
            "SELECT d.org_id, d.current_version_id, "
            "COALESCE(v.parquet_path, d.parquet_path) "
            "FROM datasets d "
            "LEFT JOIN dataset_versions v ON v.id = d.current_version_id "
            "WHERE d.id = ?",
            (dataset_id,),
        ).fetchone()
        if row is None:
            logger.warning(
                "dataset:transform ignorado: dataset %s não existe mais", dataset_id
            )
            return
        org_id, current_version_id, parquet_path = row
        conn.execute(
            "UPDATE datasets SET status = 'profiling', error_message = NULL, "
            "last_transform_error = NULL, updated_at = ? WHERE id = ?",
            (db.now_ms(), dataset_id),
        )
        conn.commit()
        try:
            _transform_and_persist(
                conn,
                dataset_id,
                str(org_id),
                str(current_version_id) if current_version_id else None,
                parquet_path,
                kind,
                params,
            )
        except Exception as error:
            message = (
                str(error) if isinstance(error, TransformError) else GENERIC_ERROR_MESSAGE
            )
            logger.exception(
                "dataset:transform falhou para o dataset %s", dataset_id
            )
            conn.rollback()
            # B10a: falha de transformação é recuperável — o dataset continua
            # íntegro na versão ativa, então o status volta a 'ready' e a
            # mensagem vai para last_transform_error (banner no Prepare).
            # datasets.status='error' fica reservado para falhas de parse.
            conn.execute(
                "UPDATE datasets SET status = 'ready', last_transform_error = ?, "
                "updated_at = ? WHERE id = ?",
                (message, db.now_ms(), dataset_id),
            )
            conn.commit()
            raise


def _transform_and_persist(
    conn,
    dataset_id: str,
    org_id: str,
    current_version_id: str | None,
    parquet_path: str | None,
    kind: str,
    params: dict,
) -> None:
    if not parquet_path:
        raise RuntimeError(f"dataset {dataset_id} sem parquet_path")
    df = pd.read_parquet(upload_dir() / parquet_path)
    rows = conn.execute(
        "SELECT name, type, position, stats FROM dataset_columns "
        "WHERE dataset_id = ? ORDER BY position",
        (dataset_id,),
    ).fetchall()
    columns = [
        ColumnInfo(
            name=name,
            type=column_type,
            position=position,
            # Datasets antigos sem invalidCount nas stats contam como 0
            invalid_count=int((db.json_load(stats) or {}).get("invalidCount") or 0),
        )
        for name, column_type, position, stats in rows
    ]

    original_df, original_columns = df, list(columns)

    if kind == "type_change":
        column, new_type = params.get("column"), params.get("newType")
        if not column or not new_type:
            raise TransformError("Parâmetros inválidos para a mudança de tipo.")
        df, columns, converted_nulls = apply_type_change(df, columns, column, new_type)
        label = f"Tipo: {column} → {TYPE_LABELS[new_type]}"
        version_params = {
            "column": column,
            "newType": new_type,
            "convertedNulls": converted_nulls,
        }
    elif kind == "clean":
        operations = params.get("operations") or []
        if not operations:
            raise TransformError("Nenhuma operação de limpeza selecionada.")
        df, columns, summary = apply_clean(df, columns, operations)
        label = CLEAN_LABEL
        version_params = {"operations": operations, "summary": summary}
    else:
        raise TransformError(f"Transformação desconhecida: {kind}.")

    # B6: nada mudou — não cria versão nem parquet; o Prepare detecta a
    # conclusão pelo status 'ready' com a MESMA versão e avisa "sem mudanças"
    if is_noop_transform(original_df, original_columns, df, columns):
        conn.execute(
            "UPDATE datasets SET status = 'ready', last_transform_error = NULL, "
            "updated_at = ? WHERE id = ?",
            (db.now_ms(), dataset_id),
        )
        conn.commit()
        logger.info(
            "dataset %s: transformação (%s) sem mudanças — nenhuma versão criada",
            dataset_id,
            kind,
        )
        return

    new_parquet = write_version_parquet(df, upload_dir())
    try:
        _persist_version(
            conn,
            dataset_id,
            org_id,
            current_version_id,
            kind,
            label,
            version_params,
            new_parquet,
            df,
            columns,
        )
    except Exception:
        # B11: o parquet foi escrito antes da transação — remove o órfão
        (upload_dir() / new_parquet).unlink(missing_ok=True)
        raise
    logger.info(
        "dataset %s transformado (%s): %d linhas × %d colunas",
        dataset_id,
        kind,
        len(df),
        len(columns),
    )


def _persist_version(
    conn,
    dataset_id: str,
    org_id: str,
    current_version_id: str | None,
    kind: str,
    label: str,
    version_params: dict,
    new_parquet: str,
    df: pd.DataFrame,
    columns: list[ColumnInfo],
) -> None:
    profiles = profile_dataframe(df, columns)
    # invalidCount acompanha a coluna através das versões (usado pelas
    # operações "ilegíveis" do clean em limpezas subsequentes)
    stats_by_column = {
        c.name: {**profiles[c.name].stats, "invalidCount": c.invalid_count}
        for c in columns
    }
    sample = json.loads(
        df.head(SAMPLE_MAX_ROWS).to_json(orient="records", date_format="iso")
    )
    columns_snapshot = [
        {
            "name": c.name,
            "type": c.type,
            "position": c.position,
            "stats": stats_by_column[c.name],
            "correlations": profiles[c.name].correlations,
        }
        for c in columns
    ]

    now = db.now_ms()
    db.begin_immediate(conn)
    version_id = db.new_id()
    conn.execute(
        "INSERT INTO dataset_versions (id, org_id, dataset_id, parent_version_id, "
        "kind, label, params, parquet_path, row_count, column_count, "
        "columns_snapshot, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            version_id,
            org_id,
            dataset_id,
            current_version_id,
            kind,
            label,
            db.json_dump(version_params),
            new_parquet,
            len(df),
            len(columns),
            db.json_dump(columns_snapshot),
            now,
            now,
        ),
    )

    conn.execute("DELETE FROM dataset_columns WHERE dataset_id = ?", (dataset_id,))
    conn.executemany(
        "INSERT INTO dataset_columns (id, org_id, dataset_id, name, type, position, "
        "stats, correlations, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            (
                db.new_id(),
                org_id,
                dataset_id,
                c.name,
                c.type,
                c.position,
                db.json_dump(stats_by_column[c.name]),
                db.json_dump(profiles[c.name].correlations),
                now,
                now,
            )
            for c in columns
        ],
    )
    # Quota de armazenamento (US-007): o parquet da nova versão soma ao total
    # do dataset (linhas antigas com null contam como 0)
    new_parquet_size = (upload_dir() / new_parquet).stat().st_size
    conn.execute(
        "UPDATE datasets SET current_version_id = ?, row_count = ?, "
        "column_count = ?, sample = ?, "
        "size_bytes = COALESCE(size_bytes, 0) + ?, status = 'ready', "
        "error_message = NULL, last_transform_error = NULL, updated_at = ? "
        "WHERE id = ?",
        (
            version_id,
            len(df),
            len(columns),
            db.json_dump(sample),
            new_parquet_size,
            now,
            dataset_id,
        ),
    )
    conn.commit()

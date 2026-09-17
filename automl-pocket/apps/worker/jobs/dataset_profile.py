"""Job dataset:profile: lê o Parquet, calcula stats/correlações e libera o dataset.

Fluxo: datasets em "profiling" → grava dataset_columns.stats e
dataset_columns.correlations → status "ready". Falhas marcam status "error"
com mensagem em português.

Avisos de estrutura (US-028): depois do profiling, se ≥ 30% das colunas se
chamam "Unnamed…" ou têm ≥ 95% de valores vazios, `layout_warnings` produz
códigos gravados em `datasets.layout_diagnosis.warnings` (sem mudar o status)
— a UI mostra o banner "Parece que a planilha não está no formato esperado"
com o botão "Revisar planilha". A lista é sempre regravada (vazia quando a
estrutura está boa), então um reparse com opções corretas limpa o aviso.
"""

from __future__ import annotations

import logging
import re

import pandas as pd

from jobs import db
from jobs.dataset_parse import upload_dir
from jobs.inference import ColumnInfo
from jobs.profiling import profile_dataframe

logger = logging.getLogger("worker.dataset_profile")

PROFILE_ERROR_MESSAGE = (
    "Não foi possível analisar as colunas do dataset. Tente enviar o arquivo novamente."
)

# Códigos gravados em layout_diagnosis.warnings — espelhados em
# apps/web/src/db/schema.ts (LayoutWarning); manter os dois lados em sincronia.
WARNING_UNNAMED_COLUMNS = "unnamed_columns"
WARNING_MOSTLY_EMPTY_COLUMNS = "mostly_empty_columns"

# Fração de colunas problemáticas (sem nome OU quase vazias) a partir da qual
# o dataset ganha os avisos; e fração de vazios que torna uma coluna "quase vazia".
BAD_COLUMNS_SHARE = 0.30
MOSTLY_EMPTY_SHARE = 0.95


_UNNAMED_PATTERN = re.compile(r"unnamed(\s*:.*)?", re.IGNORECASE)


def is_unnamed_column(name: str) -> bool:
    """Coluna sem nome no cabeçalho: pandas gera "Unnamed: N" (e "Unnamed: N.1")."""
    return _UNNAMED_PATTERN.fullmatch(name.strip()) is not None


def layout_warnings(column_stats: dict[str, dict]) -> list[str]:
    """Códigos de aviso de estrutura a partir das stats do profiling.

    `column_stats` mapeia nome da coluna → stats com `count` e `empty` (as de
    `profiling._base_stats`). Se as colunas sem nome e as com ≥ 95% de vazios,
    juntas, forem ≥ 30% do total, devolve um código por tipo encontrado
    (`unnamed_columns`, `mostly_empty_columns`); abaixo disso, lista vazia.
    Coluna sem linhas (`count` 0) conta como quase vazia.
    """
    if not column_stats:
        return []
    unnamed = [name for name in column_stats if is_unnamed_column(name)]
    mostly_empty = [
        name
        for name, stats in column_stats.items()
        if _empty_share(stats) >= MOSTLY_EMPTY_SHARE
    ]
    bad = set(unnamed) | set(mostly_empty)
    if len(bad) / len(column_stats) < BAD_COLUMNS_SHARE:
        return []
    warnings: list[str] = []
    if unnamed:
        warnings.append(WARNING_UNNAMED_COLUMNS)
    if mostly_empty:
        warnings.append(WARNING_MOSTLY_EMPTY_COLUMNS)
    return warnings


def _empty_share(stats: dict) -> float:
    count = int(stats.get("count") or 0)
    if count == 0:
        return 1.0
    return int(stats.get("empty") or 0) / count


def run_profile_job(dataset_id: str) -> None:
    """Processa um job dataset:profile. Lança exceção em falha (job vira failed)."""
    with db.connect() as conn:
        row = conn.execute(
            "SELECT parquet_path FROM datasets WHERE id = ?", (dataset_id,)
        ).fetchone()
        if row is None:
            logger.warning(
                "dataset:profile ignorado: dataset %s não existe mais", dataset_id
            )
            return
        (parquet_path,) = row
        try:
            _profile_and_persist(conn, dataset_id, parquet_path)
        except Exception:
            logger.exception("dataset:profile falhou para o dataset %s", dataset_id)
            conn.rollback()
            conn.execute(
                "UPDATE datasets SET status = 'error', error_message = ?, "
                "updated_at = ? WHERE id = ?",
                (PROFILE_ERROR_MESSAGE, db.now_ms(), dataset_id),
            )
            conn.commit()
            raise


def _profile_and_persist(conn, dataset_id: str, parquet_path: str | None) -> None:
    if not parquet_path:
        raise RuntimeError(f"dataset {dataset_id} sem parquet_path")
    df = pd.read_parquet(upload_dir() / parquet_path)
    rows = conn.execute(
        "SELECT name, type, position, stats FROM dataset_columns "
        "WHERE dataset_id = ? ORDER BY position",
        (dataset_id,),
    ).fetchall()
    columns = [
        ColumnInfo(name=name, type=column_type, position=position)
        for name, column_type, position, _stats in rows
    ]
    # Preserva o invalidCount gravado pelo dataset:parse (ausente = 0)
    invalid_counts = {
        name: int((db.json_load(stats) or {}).get("invalidCount") or 0)
        for name, _type, _position, stats in rows
    }
    profiles = profile_dataframe(df, columns)

    now = db.now_ms()
    db.begin_immediate(conn)
    conn.executemany(
        "UPDATE dataset_columns SET stats = ?, correlations = ?, "
        "updated_at = ? WHERE dataset_id = ? AND name = ?",
        [
            (
                db.json_dump(
                    {**profile.stats, "invalidCount": invalid_counts.get(name, 0)}
                ),
                db.json_dump(profile.correlations),
                now,
                dataset_id,
                name,
            )
            for name, profile in profiles.items()
        ],
    )
    # Avisos de estrutura ruim (US-028) entram no layout_diagnosis gravado pelo
    # dataset:parse (merge da chave "warnings", sempre regravada, via
    # json_patch — merge raso de dois objetos JSON, chave a chave).
    # Sem diagnóstico (dataset anterior à revisão de layout) não há onde
    # gravar — e a tela "Revisar planilha" não teria o que mostrar mesmo.
    warnings = layout_warnings(
        {name: profile.stats for name, profile in profiles.items()}
    )
    conn.execute(
        "UPDATE datasets SET status = 'ready', error_message = NULL, "
        "layout_diagnosis = CASE WHEN layout_diagnosis IS NULL THEN NULL "
        "ELSE json_patch(layout_diagnosis, ?) END, "
        "updated_at = ? WHERE id = ?",
        (db.json_dump({"warnings": warnings}), now, dataset_id),
    )
    conn.commit()
    logger.info(
        "dataset %s perfilado: %d colunas com stats/correlações", dataset_id, len(columns)
    )
    if warnings:
        logger.info(
            "dataset %s com avisos de estrutura: %s", dataset_id, ", ".join(warnings)
        )

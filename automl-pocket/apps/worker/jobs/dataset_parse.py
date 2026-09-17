"""Job dataset:parse: lê o arquivo enviado, infere tipos e grava o resultado.

Fluxo: datasets.status "parsing" → diagnóstico de layout (sempre gravado em
datasets.layout_diagnosis) → grava Parquet + sample + dataset_columns →
status "profiling" (o job dataset:profile é enfileirado pelo main.py quando
`run_parse_job` devolve PARSED). Falhas marcam status "error" com mensagem
em português.

Revisão de layout (US-024): com LAYOUT_REVIEW_ENABLED, um arquivo cujo
diagnóstico pede revisão e que ainda não tem datasets.parse_options para em
status "needs_review" sem parsear — a tela "Revisar planilha" grava as
opções e reenfileira este job. Datasets de exemplo (is_example) nunca param:
são provisionados pela plataforma, sem usuário para revisar.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from jobs import db
from jobs.inference import infer_and_normalize
from jobs.layout import diagnose_layout
from jobs.parsing import ParseError, ParseOptions, read_dataset_file

logger = logging.getLogger("worker.dataset_parse")

SAMPLE_MAX_ROWS = 500
GENERIC_ERROR_MESSAGE = (
    "Não foi possível processar o arquivo. Verifique o formato e tente enviar novamente."
)

# Resultados de run_parse_job / _parse_and_persist
PARSED = "parsed"
NEEDS_REVIEW = "needs_review"
SKIPPED = "skipped"


def upload_dir() -> Path:
    return Path(os.environ.get("UPLOAD_DIR", "uploads"))


def run_parse_job(dataset_id: str) -> str:
    """Processa um job dataset:parse. Lança exceção em falha (job vira failed).

    Devolve PARSED (seguir para dataset:profile), NEEDS_REVIEW (parado à
    espera do usuário) ou SKIPPED (dataset não existe mais).
    """
    with db.connect() as conn:
        row = conn.execute(
            "SELECT org_id, file_path, format, parse_options, is_example "
            "FROM datasets WHERE id = ?",
            (dataset_id,),
        ).fetchone()
        if row is None:
            logger.warning("dataset:parse ignorado: dataset %s não existe mais", dataset_id)
            return SKIPPED
        org_id, file_path, file_format, parse_options, is_example = row
        parse_options = db.json_load(parse_options)
        try:
            return _parse_and_persist(
                conn,
                dataset_id,
                str(org_id),
                file_path,
                file_format,
                parse_options=parse_options,
                is_example=bool(is_example),
            )
        except Exception as error:
            message = str(error) if isinstance(error, ParseError) else GENERIC_ERROR_MESSAGE
            logger.exception("dataset:parse falhou para o dataset %s", dataset_id)
            conn.rollback()
            conn.execute(
                "UPDATE datasets SET status = 'error', error_message = ?, updated_at = ? "
                "WHERE id = ?",
                (message, db.now_ms(), dataset_id),
            )
            conn.commit()
            raise


def should_pause_for_review(
    diagnosis: dict, parse_options: ParseOptions | None, is_example: bool
) -> bool:
    """Pausa só com a flag ligada, diagnóstico pedindo revisão, sem opções e
    fora dos datasets de exemplo."""
    return (
        db.layout_review_enabled()
        and bool(diagnosis.get("needsReview"))
        and parse_options is None
        and not is_example
    )


def _parse_and_persist(
    conn,
    dataset_id: str,
    org_id: str,
    file_path: str,
    file_format: str,
    parse_options: ParseOptions | None = None,
    is_example: bool = False,
) -> str:
    source = upload_dir() / file_path

    # Diagnóstico gravado (e commitado) antes de qualquer leitura pesada: fica
    # disponível para a tela de revisão mesmo se o parse falhar em seguida.
    diagnosis = diagnose_layout(source, file_format)
    conn.execute(
        "UPDATE datasets SET layout_diagnosis = ?, updated_at = ? WHERE id = ?",
        (db.json_dump(diagnosis), db.now_ms(), dataset_id),
    )
    conn.commit()

    if should_pause_for_review(diagnosis, parse_options, is_example):
        conn.execute(
            "UPDATE datasets SET status = 'needs_review', error_message = NULL, "
            "updated_at = ? WHERE id = ?",
            (db.now_ms(), dataset_id),
        )
        conn.commit()
        logger.info("dataset %s aguardando revisão de layout", dataset_id)
        return NEEDS_REVIEW

    df = read_dataset_file(source, file_format, parse_options)
    df, columns = infer_and_normalize(df)

    # Dados normalizados em Parquet ao lado do arquivo original (mesmo stem UUID)
    parquet_name = f"{Path(file_path).stem}.parquet"
    df.to_parquet(upload_dir() / parquet_name, index=False)

    # Quota de armazenamento (US-007): arquivo original + parquet gerado.
    # SET absoluto (não incremento) para o retry do job não contar em dobro;
    # no parse ainda não existem versões, então nada é perdido.
    size_bytes = source.stat().st_size + (upload_dir() / parquet_name).stat().st_size

    # Amostra das primeiras linhas; to_json converte NaN→null e datas→ISO
    sample = json.loads(
        df.head(SAMPLE_MAX_ROWS).to_json(orient="records", date_format="iso")
    )

    now = db.now_ms()
    db.begin_immediate(conn)
    conn.execute("DELETE FROM dataset_columns WHERE dataset_id = ?", (dataset_id,))
    # stats.invalidCount = valores não vazios que falharam a conversão de
    # tipo; o dataset:profile preserva o campo ao gravar as stats completas
    conn.executemany(
        "INSERT INTO dataset_columns (id, org_id, dataset_id, name, type, position, "
        "stats, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            (
                db.new_id(),
                org_id,
                dataset_id,
                c.name,
                c.type,
                c.position,
                db.json_dump({"invalidCount": c.invalid_count}),
                now,
                now,
            )
            for c in columns
        ],
    )
    conn.execute(
        "UPDATE datasets SET row_count = ?, column_count = ?, sample = ?, "
        "parquet_path = ?, size_bytes = ?, status = 'profiling', "
        "error_message = NULL, updated_at = ? WHERE id = ?",
        (len(df), len(columns), db.json_dump(sample), parquet_name, size_bytes, now, dataset_id),
    )
    conn.commit()
    logger.info(
        "dataset %s parseado: %d linhas × %d colunas", dataset_id, len(df), len(columns)
    )
    return PARSED

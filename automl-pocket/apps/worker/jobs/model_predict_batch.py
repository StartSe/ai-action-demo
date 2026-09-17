"""Job model:predict-batch: predição em lote sobre arquivo enviado (US-045).

A página pública do Web App grava o arquivo (CSV/XLSX/XLS) em
UPLOAD_DIR/batches/ e enfileira {modelId, inputPath, outputPath} na fila
"predictions"; o worker lê o arquivo direto do volume (sem criar registro em
datasets), prevê com o mesmo artefato do model:predict e escreve um CSV com as
colunas originais + "predicao" (+ "probabilidade" na classificação). Os
arquivos de entrada e saída são temporários — o web remove ambos após o
download (e varre os expirados).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from jobs.dataset_parse import upload_dir
from jobs.model_predict import (
    GENERIC_ERROR_MESSAGE,
    PredictionError,
    load_artifact,
    predict_frame,
)
from jobs.parsing import ParseError, read_dataset_file

logger = logging.getLogger("worker.model_predict_batch")

# Limite por ARQUIVO (a quota mensal por usuário é outra régua, no web).
# O texto do lote em apps/web/src/app/app/[slug]/public-web-app.tsx e o
# timeout em apps/web/src/lib/predictions.ts citam este valor — manter em sincronia.
MAX_BATCH_ROWS = 5_000

# Formato do parser por extensão (o web só aceita estes três no lote)
_FORMAT_BY_EXTENSION = {".csv": "csv", ".xlsx": "xlsx", ".xls": "xlsx"}


def _format_int_pt(value: int) -> str:
    """5000 → "5.000" (separador de milhar pt-BR)."""
    return f"{value:,}".replace(",", ".")


def _resolve_batch_path(relative: str) -> Path:
    """Resolve um caminho relativo dentro do UPLOAD_DIR, sem escapar dele."""
    base = upload_dir().resolve()
    path = (base / relative).resolve()
    if not path.is_relative_to(base):
        raise PredictionError(GENERIC_ERROR_MESSAGE)
    return path


def predict_file(
    artifact: dict[str, Any], input_path: Path, output_path: Path
) -> int:
    """Lê o arquivo, prediz e grava o CSV de saída; retorna o nº de linhas.

    Regras da US-045: limite de MAX_BATCH_ROWS linhas; colunas ausentes do
    arquivo viram nulos (regra da US-042, via reindex); arquivo sem nenhuma
    coluna do modelo é erro em português.
    """
    file_format = _FORMAT_BY_EXTENSION.get(input_path.suffix.lower())
    if file_format is None:
        raise PredictionError(
            "Formato não suportado. Envie um arquivo .csv, .xlsx ou .xls."
        )
    try:
        df = read_dataset_file(input_path, file_format)
    except ParseError as error:
        # Mensagens do parser já estão em português
        raise PredictionError(str(error)) from error

    if len(df) > MAX_BATCH_ROWS:
        raise PredictionError(
            f"O arquivo tem {_format_int_pt(len(df))} linhas; o limite é "
            f"{_format_int_pt(MAX_BATCH_ROWS)} linhas por arquivo."
        )

    feature_columns = artifact["feature_columns"]
    if not set(df.columns) & set(feature_columns):
        raise PredictionError(
            "O arquivo não contém nenhuma coluna usada pelo modelo. "
            f"Colunas esperadas: {', '.join(feature_columns)}."
        )

    # Alinha ao modelo: colunas ausentes viram nulos, desconhecidas ficam fora
    frame = df.reindex(columns=feature_columns)
    predictions = predict_frame(artifact, frame)

    out = df.copy()
    out["predicao"] = [p["prediction"] for p in predictions]
    if artifact["problem_type"] == "classification":
        out["probabilidade"] = [p["probability"] for p in predictions]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    # utf-8-sig: Excel pt-BR abre acentos corretamente
    out.to_csv(output_path, index=False, encoding="utf-8-sig")
    return len(out)


def run_predict_batch_job(
    model_id: str, input_path: str, output_path: str
) -> dict[str, Any]:
    """Processa um job model:predict-batch; o retorno vira o returnvalue."""
    try:
        artifact = load_artifact(model_id)
        rows = predict_file(
            artifact,
            _resolve_batch_path(input_path),
            _resolve_batch_path(output_path),
        )
        return {"outputPath": output_path, "rows": rows}
    except PredictionError:
        raise
    except Exception as error:
        logger.exception(
            "model:predict-batch falhou para o modelo %s", model_id
        )
        raise PredictionError(GENERIC_ERROR_MESSAGE) from error

"""Job model:predict: predição síncrona sobre um modelo treinado (US-042).

O web enfileira na fila "predictions" com payload {modelId, rows} e espera o
retorno via QueueEvents.waitUntilFinished. O artefato joblib é carregado de
models.artifact_path com cache em memória por modelId (retreinar gera um model
id novo, então o cache nunca fica stale).

Formato do retorno (returnvalue do job, consumido por src/lib/predictions.ts):
- classificação: [{prediction, probability, probabilities: {classe: p}}]
- regressão: [{prediction}]
"""

from __future__ import annotations

import logging
import uuid
from collections import OrderedDict
from typing import Any

import joblib
import pandas as pd

from jobs import db
from jobs.dataset_parse import upload_dir

logger = logging.getLogger("worker.model_predict")

GENERIC_ERROR_MESSAGE = "Não foi possível calcular a predição. Tente novamente."
MODEL_NOT_FOUND_MESSAGE = (
    "Modelo não encontrado. Treine o modelo novamente antes de prever."
)

# Cache LRU simples de artefatos por modelId (o joblib de um pipeline pequeno
# tem alguns MB; 8 modelos cobrem o uso típico sem crescer sem limite)
CACHE_MAX_ENTRIES = 8
_artifact_cache: OrderedDict[str, dict[str, Any]] = OrderedDict()


class PredictionError(Exception):
    """Erro esperado de predição; a mensagem (em português) vai para a UI."""


def _fetch_artifact_path(model_id: str) -> str:
    try:
        uuid.UUID(model_id)
    except (ValueError, AttributeError, TypeError):
        raise PredictionError(MODEL_NOT_FOUND_MESSAGE) from None
    with db.connect() as conn:
        row = conn.execute(
            "SELECT artifact_path FROM models WHERE id = ?",
            (model_id,),
        ).fetchone()
    if row is None or not row[0]:
        raise PredictionError(MODEL_NOT_FOUND_MESSAGE)
    return str(row[0])


def load_artifact(model_id: str) -> dict[str, Any]:
    """Carrega o artefato do modelo, com cache em memória por modelId."""
    cached = _artifact_cache.get(model_id)
    if cached is not None:
        _artifact_cache.move_to_end(model_id)
        return cached

    artifact_path = _fetch_artifact_path(model_id)
    path = upload_dir() / artifact_path
    if not path.exists():
        raise PredictionError(MODEL_NOT_FOUND_MESSAGE)
    artifact = joblib.load(path)

    _artifact_cache[model_id] = artifact
    while len(_artifact_cache) > CACHE_MAX_ENTRIES:
        _artifact_cache.popitem(last=False)
    return artifact


def predict_rows(
    artifact: dict[str, Any], rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Prediz linhas cruas {coluna: valor} com o pipeline do artefato.

    Colunas faltantes viram nulos (o pipeline imputa); colunas desconhecidas
    são ignoradas (o frame é montado só com as feature_columns do modelo).
    """
    if not isinstance(rows, list) or not rows:
        raise PredictionError("Envie ao menos uma linha para prever.")
    if not all(isinstance(row, dict) for row in rows):
        raise PredictionError("Cada linha deve ser um objeto {coluna: valor}.")

    feature_columns = artifact["feature_columns"]
    frame = pd.DataFrame(
        [{column: row.get(column) for column in feature_columns} for row in rows],
        columns=feature_columns,
    )
    return predict_frame(artifact, frame)


def predict_frame(
    artifact: dict[str, Any], frame: pd.DataFrame
) -> list[dict[str, Any]]:
    """Prediz um DataFrame já alinhado às feature_columns do artefato.

    Usado por predict_rows (linhas do formulário) e pelo lote da US-045
    (frame reindexado do arquivo enviado).
    """
    pipeline = artifact["pipeline"]
    problem_type = artifact["problem_type"]

    if problem_type == "classification":
        classes = artifact["classes"]
        # predict() devolve índices do LabelEncoder → mapear com classes
        predicted = pipeline.predict(frame)
        probabilities = pipeline.predict_proba(frame)
        return [
            {
                "prediction": classes[int(index)],
                "probability": float(proba[int(index)]),
                "probabilities": {
                    classes[i]: float(p) for i, p in enumerate(proba)
                },
            }
            for index, proba in zip(predicted, probabilities)
        ]

    if problem_type == "regression":
        predicted = pipeline.predict(frame)
        return [{"prediction": float(value)} for value in predicted]

    raise PredictionError(
        "Predição disponível apenas para classificação e regressão."
    )


def run_predict_job(model_id: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Processa um job model:predict; o retorno vira o returnvalue do job."""
    try:
        artifact = load_artifact(model_id)
        return predict_rows(artifact, rows)
    except PredictionError:
        raise
    except Exception as error:
        logger.exception("model:predict falhou para o modelo %s", model_id)
        raise PredictionError(GENERIC_ERROR_MESSAGE) from error

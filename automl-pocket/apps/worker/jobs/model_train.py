"""Job model:train: treina o modelo AutoML e persiste métricas e artefato.

Fluxo: training_jobs "queued" → "running" (com progress/progress_step atualizados
ao longo do treino) → grava artefato joblib no volume + linha em models →
"succeeded". Falhas marcam o job "failed" com mensagem em português. O desfecho
(training.succeeded/training.failed) também vira evento durável em audit_logs,
na mesma transação do status — métricas de uso sobrevivem à exclusão do projeto
(US-002 de métricas duráveis).
"""

from __future__ import annotations

import logging
from typing import Any

import joblib
import pandas as pd

from jobs import db
from jobs.automl import TrainingError, train_classification, train_regression
from jobs.dataset_parse import upload_dir
from jobs.forecasting import train_forecasting

logger = logging.getLogger("worker.model_train")

GENERIC_ERROR_MESSAGE = (
    "Não foi possível treinar o modelo. Verifique os dados e tente novamente."
)

# Métrica durável (US-002): tamanho máximo da errorMessage no training.failed
ERROR_MESSAGE_LIMIT = 500

# Random Forests sem compressão chegam a centenas de MB por artefato; nível 3
# do zlib corta a maior parte disso com custo de CPU pequeno frente ao treino
ARTIFACT_COMPRESS = 3

TRAINERS = {
    "classification": train_classification,
    "regression": train_regression,
    "forecasting": train_forecasting,
}


def run_train_job(training_job_id: str) -> None:
    """Processa um job model:train. Lança exceção em falha (job vira failed)."""
    with db.connect() as conn:
        row = conn.execute(
            # Treina sempre sobre a versão ativa das transformações do Prepare
            # (datasets.current_version_id); nulo = parquet original (US-035)
            "SELECT tj.org_id, tj.project_id, tj.dataset_id, tj.config, "
            "COALESCE(v.parquet_path, d.parquet_path), p.name "
            "FROM training_jobs tj JOIN datasets d ON d.id = tj.dataset_id "
            "JOIN projects p ON p.id = tj.project_id "
            "LEFT JOIN dataset_versions v ON v.id = d.current_version_id "
            "WHERE tj.id = ?",
            (training_job_id,),
        ).fetchone()
        if row is None:
            logger.warning(
                "model:train ignorado: training_job %s não existe mais",
                training_job_id,
            )
            return
        org_id, project_id, dataset_id, config, parquet_path, project_name = row
        config = db.json_load(config)
        try:
            _train_and_persist(
                conn,
                training_job_id,
                str(org_id),
                str(project_id),
                str(dataset_id),
                config,
                parquet_path,
                project_name,
            )
        except Exception as error:
            message = (
                str(error) if isinstance(error, TrainingError) else GENERIC_ERROR_MESSAGE
            )
            logger.exception(
                "model:train falhou para o training_job %s", training_job_id
            )
            conn.rollback()
            # Evento durável na MESMA transação do status (US-002): a falha do
            # treino sobrevive à exclusão do projeto via audit_logs
            conn.execute(
                "UPDATE training_jobs SET status = 'failed', error_message = ?, "
                "updated_at = ? WHERE id = ?",
                (message, db.now_ms(), training_job_id),
            )
            _log_training_event(
                conn,
                action="training.failed",
                org_id=str(org_id),
                training_job_id=training_job_id,
                metadata=_failure_event_metadata(
                    project_id=str(project_id),
                    project_name=project_name,
                    config=config,
                    message=message,
                ),
            )
            conn.commit()
            raise


def _set_progress(conn, training_job_id: str, pct: int, step: str) -> None:
    # Commit imediato: o polling da UI (US-019) lê o progresso durante o
    # treino, competindo com o web pelo mesmo arquivo — retry/backoff cobre um
    # eventual "database is locked" além do busy_timeout do próprio SQLite.
    def _write():
        conn.execute(
            "UPDATE training_jobs SET progress = ?, progress_step = ?, "
            "updated_at = ? WHERE id = ?",
            (max(0, min(100, pct)), step, db.now_ms(), training_job_id),
        )
        conn.commit()

    db.retry_on_locked(_write)


def _set_candidates(conn, training_job_id: str, payload: dict[str, Any]) -> None:
    # Estado por candidato (waiting/running/done + métrica parcial) lido pela
    # visão de progresso da US-019; commit imediato como no _set_progress
    def _write():
        conn.execute(
            "UPDATE training_jobs SET candidates = ?, updated_at = ? "
            "WHERE id = ?",
            (db.json_dump(payload), db.now_ms(), training_job_id),
        )
        conn.commit()

    db.retry_on_locked(_write)


def _replace_project_models(conn, project_id: str, new_model_id: str) -> list[str]:
    """Aponta os deployments do projeto para o modelo novo e remove os antigos.

    Só o modelo mais recente é usado pela UI; sem isso cada retreino deixaria
    uma linha em models e um artefato .joblib órfãos no volume (US-004 beta).
    O UPDATE dos deployments vem ANTES do DELETE: deployments.model_id tem
    ON DELETE CASCADE e o cascade apagaria o deployment publicado (slug
    público, chave de API) a cada retreino. Retorna os artifact_paths órfãos
    para remoção best-effort após o commit.
    """
    conn.execute(
        "UPDATE deployments SET model_id = ?, updated_at = ? "
        "WHERE project_id = ? AND model_id != ?",
        (new_model_id, db.now_ms(), project_id, new_model_id),
    )
    rows = conn.execute(
        "DELETE FROM models WHERE project_id = ? AND id != ? "
        "RETURNING artifact_path",
        (project_id, new_model_id),
    ).fetchall()
    return [row[0] for row in rows if row[0]]


def _remove_artifact_files(paths) -> None:
    # Best-effort: artefato já ausente no volume não falha o treino
    for path in paths:
        (upload_dir() / path).unlink(missing_ok=True)


def _forecasting_kwargs(config: dict[str, Any]) -> dict[str, Any]:
    """Kwargs extras do train_forecasting a partir do training_jobs.config.

    Chave ausente/nula = automático (eixo temporal, horizonte, agregação,
    algoritmo) ou série única (idColumn); os valores já vêm validados pelo web
    em startTraining, então aqui é só tradução de nomes camelCase → snake_case.
    """
    horizon = config.get("forecastHorizon")
    return {
        "time_column": config.get("timeColumn"),
        "forecast_horizon": int(horizon) if horizon else None,
        "aggregation": config.get("aggregation") or "auto",
        "forecast_model": config.get("forecastModel") or "auto",
        "id_column": config.get("idColumn") or None,
    }


def _primary_metric(metrics: dict[str, Any]) -> dict[str, Any]:
    """primaryMetric {name, value} do candidato vencedor (US-002).

    name = selectionMetric do resultado; value = a métrica do vencedor. No
    multiclasse o selectionMetric é "f1_macro", mas os candidatos reportam a
    métrica sob a chave "f1" — o fallback cobre esse caso.
    """
    name = metrics.get("selectionMetric")
    winner = next((c for c in metrics.get("candidates", []) if c.get("best")), None)
    if winner is None or not name:
        return {"name": name, "value": None}
    key = "f1" if name == "f1_macro" else name
    return {"name": name, "value": winner.get(key)}


def _success_event_metadata(
    *,
    project_id: str,
    project_name: str,
    dataset_id: str,
    result,
    duration_seconds: int | None,
) -> dict[str, Any]:
    """Metadata do training.succeeded: identificadores e métricas, nunca dados
    das linhas do dataset. metrics tem o mesmo shape de models.metrics."""
    metrics = result.metrics()
    return {
        "projectId": project_id,
        "projectName": project_name,
        "datasetId": dataset_id,
        "problemType": result.problem_type,
        "winningAlgorithm": result.winning_algorithm,
        "durationSeconds": duration_seconds,
        "primaryMetric": _primary_metric(metrics),
        "metrics": metrics,
    }


def _failure_event_metadata(
    *,
    project_id: str,
    project_name: str,
    config: dict[str, Any] | None,
    message: str,
) -> dict[str, Any]:
    """Metadata do training.failed com a mensagem truncada (sem stack trace)."""
    return {
        "projectId": project_id,
        "projectName": project_name,
        "problemType": (config or {}).get("problemType"),
        "errorMessage": message[:ERROR_MESSAGE_LIMIT],
    }


def _log_training_event(
    conn,
    *,
    action: str,
    org_id: str,
    training_job_id: str,
    metadata: dict[str, Any],
) -> None:
    """INSERT em audit_logs SEM commit: participa da transação do chamador.

    user_id fica NULL (o worker não conhece o usuário; o join com o
    training.start pelo resource_id recupera a atribuição — US-005). Retry do
    mesmo job insere um novo evento de propósito (sem deduplicação).
    """
    now = db.now_ms()
    conn.execute(
        "INSERT INTO audit_logs (org_id, action, resource_type, resource_id, "
        "metadata, id, created_at, updated_at) "
        "VALUES (?, ?, 'training_job', ?, ?, ?, ?, ?)",
        (org_id, action, training_job_id, db.json_dump(metadata), db.new_id(), now, now),
    )


def _train_and_persist(
    conn,
    training_job_id: str,
    org_id: str,
    project_id: str,
    dataset_id: str,
    config: dict[str, Any],
    parquet_path: str | None,
    project_name: str,
) -> None:
    conn.execute(
        "UPDATE training_jobs SET status = 'running', progress = 0, "
        "progress_step = 'Carregando os dados', error_message = NULL, "
        "candidates = NULL, updated_at = ? WHERE id = ?",
        (db.now_ms(), training_job_id),
    )
    conn.commit()

    problem_type = config.get("problemType")
    trainer = TRAINERS.get(str(problem_type))
    if trainer is None:
        raise TrainingError("Tipo de problema de treinamento desconhecido.")
    if not parquet_path:
        raise TrainingError(
            "Os dados do dataset não foram encontrados. Envie o arquivo novamente."
        )

    df = pd.read_parquet(upload_dir() / parquet_path)
    column_types = dict(
        conn.execute(
            "SELECT name, type FROM dataset_columns WHERE dataset_id = ?",
            (dataset_id,),
        ).fetchall()
    )

    # Só o forecasting recebe o eixo temporal, o horizonte, a agregação, o
    # algoritmo fixado e a coluna de identificação
    extra_kwargs: dict[str, Any] = {}
    if problem_type == "forecasting":
        extra_kwargs = _forecasting_kwargs(config)

    result = trainer(
        df,
        target=config["target"],
        ignored_columns=config.get("ignoredColumns") or [],
        mode=config.get("mode", "high_quality"),
        column_types=column_types,
        on_progress=lambda pct, step: _set_progress(conn, training_job_id, pct, step),
        on_candidates=lambda payload: _set_candidates(conn, training_job_id, payload),
        **extra_kwargs,
    )

    _set_progress(conn, training_job_id, 95, "Salvando o modelo")
    (upload_dir() / "models").mkdir(parents=True, exist_ok=True)
    artifact_path = f"models/{training_job_id}.joblib"
    joblib.dump(
        {
            "pipeline": result.pipeline,
            "problem_type": result.problem_type,
            "target": result.target,
            "feature_columns": result.feature_columns,
            "classes": result.classes,
            "winning_algorithm": result.winning_algorithm,
        },
        upload_dir() / artifact_path,
        compress=ARTIFACT_COMPRESS,
    )
    # Quota de armazenamento (US-007): tamanho do artefato comprimido no volume
    artifact_size = (upload_dir() / artifact_path).stat().st_size

    # Retry do mesmo job substitui o modelo anterior em vez de duplicar; o
    # DELETE precisa vir antes do INSERT p/ a linha antiga não aparecer no
    # RETURNING de _replace_project_models (o artefato dela é o recém-gravado)
    conn.execute("DELETE FROM models WHERE training_job_id = ?", (training_job_id,))
    now = db.now_ms()
    model_id = db.new_id()
    (new_model_id,) = conn.execute(
        "INSERT INTO models (id, org_id, project_id, training_job_id, problem_type, "
        "target, ignored_columns, winning_algorithm, metrics, insights, "
        "artifact_path, size_bytes, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        (
            model_id,
            org_id,
            project_id,
            training_job_id,
            result.problem_type,
            config["target"],
            db.json_dump(config.get("ignoredColumns") or []),
            result.winning_algorithm,
            db.json_dump(result.metrics()),
            db.json_dump(result.insights) if result.insights is not None else None,
            artifact_path,
            artifact_size,
            now,
            now,
        ),
    ).fetchone()
    stale_artifacts = _replace_project_models(conn, project_id, str(new_model_id))
    # RETURNING devolve a duração calculada a partir dos dois epoch ms
    # (updated_at final − created_at), convertida para segundos.
    succeeded_at = db.now_ms()
    (duration_seconds,) = conn.execute(
        "UPDATE training_jobs SET status = 'succeeded', progress = 100, "
        "progress_step = 'Concluído', updated_at = ? WHERE id = ? "
        "RETURNING CAST(ROUND((? - created_at) / 1000.0) AS INTEGER)",
        (succeeded_at, training_job_id, succeeded_at),
    ).fetchone()
    # Evento durável na MESMA transação do status succeeded (US-002)
    _log_training_event(
        conn,
        action="training.succeeded",
        org_id=org_id,
        training_job_id=training_job_id,
        metadata=_success_event_metadata(
            project_id=project_id,
            project_name=project_name,
            dataset_id=dataset_id,
            result=result,
            duration_seconds=duration_seconds,
        ),
    )
    conn.commit()
    # Só depois do commit: se a transação falhasse, os arquivos já estariam
    # perdidos com as linhas ainda no banco
    _remove_artifact_files(p for p in stale_artifacts if p != artifact_path)
    logger.info(
        "training_job %s concluído: %s venceu (%s)",
        training_job_id,
        result.winning_algorithm,
        result.selection_metric,
    )

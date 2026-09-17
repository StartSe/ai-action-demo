"""Worker da plataforma AutoML: consome jobs BullMQ das filas "datasets" e "training".

Jobs suportados:
- dataset:parse (US-009): diagnostica o layout, parseia o arquivo, infere
  tipos e, em sucesso, enfileira dataset:profile; com LAYOUT_REVIEW_ENABLED
  pode parar em needs_review (US-024) sem enfileirar nada
- dataset:profile (US-010): calcula stats/distribuições/correlações por coluna
  e transiciona o dataset para "ready"
- model:train (US-014/015/016): treina o pipeline AutoML (classificação,
  regressão ou forecasting) e persiste métricas + artefato
- dataset:transform (US-036): aplica type_change/clean sobre o parquet ativo,
  gera novo parquet e registra a versão em dataset_versions
- model:predict (US-042): predição síncrona; o web espera o returnvalue via
  QueueEvents.waitUntilFinished (fila "predictions", separada para não ficar
  atrás de treinos longos)
- model:predict-batch (US-045): predição em lote sobre arquivo do Web App
  público; lê CSV/XLSX do volume e grava o CSV de saída com as predições

Contrato de boot (Pocket US-016, vale para o start.sh de US-018 no container
único web+worker do Render): este processo NUNCA cria nem migra o SQLite —
`db.connect()` (jobs/db.py) só abre `SQLITE_PATH`, assumindo o schema já
aplicado. Quem migra é o web, sequencialmente antes de subir (`node
scripts/migrate.mjs && node server.js`, ver apps/web/Dockerfile); a conta única
é criada depois, pela tela de primeiro acesso (/setup) na primeira visita. O
worker só deve ser iniciado DEPOIS do migrate.mjs terminar — iniciá-lo antes
arrisca `sqlite3.OperationalError: no such table` no primeiro job que chegar
antes de as tabelas existirem.
"""

import asyncio
import logging
import os
import signal
import time

import redis
from bullmq import Queue, Worker

from jobs import db
from jobs.dataset_parse import NEEDS_REVIEW, PARSED, run_parse_job
from jobs.dataset_profile import run_profile_job
from jobs.dataset_transform import run_transform_job
from jobs.model_predict import run_predict_job
from jobs.model_predict_batch import run_predict_batch_job
from jobs.model_train import run_train_job

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("worker")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CONNECT_RETRY_SECONDS = 2
MAX_CONNECT_ATTEMPTS = 30

# Mesmos limites do defaultJobOptions da fila no web (src/lib/queue.ts)
JOB_OPTIONS = {"removeOnComplete": 100, "removeOnFail": 500}

# Ociosidade (Pocket US-016) até truncar o WAL do SQLite compartilhado com o
# web (ver _checkpoint_when_idle) e intervalo de checagem.
IDLE_CHECKPOINT_SECONDS = 5 * 60
CHECKPOINT_POLL_SECONDS = 60


def training_concurrency() -> int:
    """Nº de treinos simultâneos na fila "training" (env TRAINING_CONCURRENCY).

    Default 2 (Pocket US-016): a VM de 1 clique do Render roda web+worker no
    MESMO container, sem réplicas — 2 treinos em paralelo com MODEL_N_JOBS=2
    cabem em 4 vCPUs sem sufocar o SQLite compartilhado nem o processo web.
    """
    return int(os.environ.get("TRAINING_CONCURRENCY", "2"))


async def _checkpoint_when_idle(activity: dict[str, float], stop: asyncio.Event) -> None:
    """Trunca o WAL do SQLite quando o worker fica sem processar nenhum job
    por IDLE_CHECKPOINT_SECONDS.

    O SQLite faz checkpoint automático a cada ~1000 páginas do WAL; um pico de
    escrita (progresso de treino, que grava a cada poucos % via
    `retry_on_locked`) pode deixar o .db-wal grande até o próximo automático.
    Como o Pocket roda um único web + um único worker (sem réplica disputando
    o arquivo), truncar explicitamente depois de um período ocioso é seguro e
    mantém o arquivo enxuto para backup/disco do Render — sem impacto na
    concorrência, já que não há escrita nenhuma acontecendo nesse momento.
    """
    while True:
        try:
            await asyncio.wait_for(stop.wait(), timeout=CHECKPOINT_POLL_SECONDS)
            return  # stop foi sinalizado: worker está encerrando
        except asyncio.TimeoutError:
            pass
        if time.monotonic() - activity["last"] >= IDLE_CHECKPOINT_SECONDS:
            await asyncio.to_thread(db.wal_checkpoint_truncate)
            logger.info(
                "WAL truncado (worker ocioso há %ds ou mais)", IDLE_CHECKPOINT_SECONDS
            )


def wait_for_redis(url: str) -> None:
    """Aguarda o Redis responder, pois o container pode subir antes do Redis."""
    last_error: Exception | None = None
    for attempt in range(1, MAX_CONNECT_ATTEMPTS + 1):
        try:
            client = redis.Redis.from_url(url)
            client.ping()
            client.close()
            return
        except (redis.ConnectionError, redis.TimeoutError) as error:
            last_error = error
            logger.warning(
                "Redis indisponível (tentativa %d/%d): %s",
                attempt,
                MAX_CONNECT_ATTEMPTS,
                error,
            )
            time.sleep(CONNECT_RETRY_SECONDS)
    raise SystemExit(f"Não foi possível conectar no Redis em {url}: {last_error}")


async def run_worker() -> None:
    logger.info(
        "Revisão de layout (LAYOUT_REVIEW_ENABLED): %s",
        "ligada" if db.layout_review_enabled() else "desligada",
    )
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    queue = Queue("datasets", {"connection": REDIS_URL})

    # Timestamp (monotônico) do último job recebido em qualquer fila; lido
    # por _checkpoint_when_idle para decidir quando truncar o WAL.
    activity = {"last": time.monotonic()}

    async def process(job, _token):
        activity["last"] = time.monotonic()
        if job.name == "dataset:parse":
            dataset_id = job.data["datasetId"]
            logger.info("dataset:parse recebido (dataset %s)", dataset_id)
            # run_parse_job é síncrono (pandas/sqlite3); roda em thread para
            # não bloquear o event loop do BullMQ
            outcome = await asyncio.to_thread(run_parse_job, dataset_id)
            if outcome == PARSED:
                await queue.add("dataset:profile", {"datasetId": dataset_id}, JOB_OPTIONS)
                logger.info(
                    "dataset %s parseado; dataset:profile enfileirado", dataset_id
                )
            elif outcome == NEEDS_REVIEW:
                # Parado em needs_review: a tela "Revisar planilha" reenfileira
                # o dataset:parse com parse_options preenchido
                logger.info("dataset %s aguardando revisão de layout", dataset_id)
            return True
        if job.name == "dataset:transform":
            dataset_id = job.data["datasetId"]
            kind = job.data["kind"]
            logger.info("dataset:transform recebido (dataset %s, %s)", dataset_id, kind)
            await asyncio.to_thread(
                run_transform_job, dataset_id, kind, job.data.get("params") or {}
            )
            logger.info("dataset %s transformado (%s)", dataset_id, kind)
            return True
        if job.name == "dataset:profile":
            dataset_id = job.data["datasetId"]
            logger.info("dataset:profile recebido (dataset %s)", dataset_id)
            await asyncio.to_thread(run_profile_job, dataset_id)
            logger.info("dataset %s perfilado e pronto (status ready)", dataset_id)
            return True
        logger.warning("Job desconhecido ignorado: %s", job.name)
        return True

    async def process_training(job, _token):
        activity["last"] = time.monotonic()
        if job.name == "model:train":
            training_job_id = job.data["trainingJobId"]
            logger.info("model:train recebido (training_job %s)", training_job_id)
            await asyncio.to_thread(run_train_job, training_job_id)
            logger.info("training_job %s treinado com sucesso", training_job_id)
            return True
        logger.warning("Job desconhecido ignorado na fila training: %s", job.name)
        return True

    async def process_predictions(job, _token):
        activity["last"] = time.monotonic()
        if job.name == "model:predict":
            model_id = job.data["modelId"]
            logger.info("model:predict recebido (modelo %s)", model_id)
            # O retorno vira o returnvalue do job, lido pelo web via
            # QueueEvents.waitUntilFinished (src/lib/predictions.ts)
            predictions = await asyncio.to_thread(
                run_predict_job, model_id, job.data.get("rows") or []
            )
            logger.info(
                "modelo %s: %d linha(s) prevista(s)", model_id, len(predictions)
            )
            return predictions
        if job.name == "model:predict-batch":
            model_id = job.data["modelId"]
            logger.info("model:predict-batch recebido (modelo %s)", model_id)
            result = await asyncio.to_thread(
                run_predict_batch_job,
                model_id,
                job.data["inputPath"],
                job.data["outputPath"],
            )
            logger.info(
                "modelo %s: lote de %d linha(s) previsto", model_id, result["rows"]
            )
            return result
        logger.warning("Job desconhecido ignorado na fila predictions: %s", job.name)
        return True

    worker = Worker("datasets", process, {"connection": REDIS_URL})
    training_worker = Worker(
        "training",
        process_training,
        {"connection": REDIS_URL, "concurrency": training_concurrency()},
    )
    predictions_worker = Worker(
        "predictions", process_predictions, {"connection": REDIS_URL}
    )
    checkpoint_task = asyncio.create_task(_checkpoint_when_idle(activity, stop))
    logger.info("worker ready")

    await stop.wait()
    logger.info("Sinal recebido, encerrando worker...")
    await worker.close()
    await training_worker.close()
    await predictions_worker.close()
    await queue.close()
    await checkpoint_task


def main() -> int:
    wait_for_redis(REDIS_URL)
    asyncio.run(run_worker())
    logger.info("Worker encerrado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

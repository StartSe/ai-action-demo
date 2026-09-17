import { QueueEvents, type Job } from "bullmq";
import { getPredictionsQueue, getRedisConnection } from "@/lib/queue";

/** Shape do returnvalue do job model:predict (worker: jobs/model_predict.py). */
export type ClassificationPrediction = {
  prediction: string;
  probability: number;
  probabilities: Record<string, number>;
};

type RegressionPrediction = {
  prediction: number;
};

export type Prediction = ClassificationPrediction | RegressionPrediction;

/** Valores crus de uma linha {coluna: valor}, como preenchidos no formulário. */
export type PredictionRow = Record<string, unknown>;

const PREDICTION_TIMEOUT_MS = 30_000;

export const PREDICTION_TIMEOUT_MESSAGE =
  "A predição demorou mais do que o esperado. Tente novamente.";
const PREDICTION_GENERIC_MESSAGE =
  "Não foi possível calcular a predição. Tente novamente.";

const globalForPredictions = globalThis as unknown as {
  __predictionsQueueEvents?: QueueEvents;
};

function getPredictionsQueueEvents(): QueueEvents {
  if (!globalForPredictions.__predictionsQueueEvents) {
    // QueueEvents usa comandos bloqueantes (XREAD): precisa de uma conexão
    // própria, duplicada da compartilhada — nunca reusar a da Queue
    globalForPredictions.__predictionsQueueEvents = new QueueEvents(
      "predictions",
      { connection: getRedisConnection().duplicate() },
    );
  }
  return globalForPredictions.__predictionsQueueEvents;
}

/**
 * Predição síncrona (US-042): enfileira model:predict na fila "predictions" e
 * espera o retorno do worker via QueueEvents.waitUntilFinished (timeout 30s).
 *
 * Linhas com colunas faltantes são aceitas (viram nulos para o pipeline) e
 * colunas desconhecidas são ignoradas — regras aplicadas no worker.
 * Timeout ou falha viram Error com mensagem em português (as mensagens de
 * PredictionError do worker já chegam em português).
 */
export async function runPrediction(
  modelId: string,
  rows: PredictionRow[],
): Promise<Prediction[]> {
  const job = await getPredictionsQueue().add("model:predict", {
    modelId,
    rows,
  });
  return (await waitForJob(job, PREDICTION_TIMEOUT_MS)) as Prediction[];
}

/** Returnvalue do job model:predict-batch (worker: jobs/model_predict_batch.py). */
export type BatchPrediction = {
  /** Caminho do CSV de saída, relativo ao UPLOAD_DIR */
  outputPath: string;
  rows: number;
};

// Lote lê o arquivo e prevê até 5.000 linhas (MAX_BATCH_ROWS no worker,
// jobs/model_predict_batch.py — manter em sincronia) — folga sobre os 30s do unitário
const BATCH_PREDICTION_TIMEOUT_MS = 120_000;

/**
 * Predição em lote (US-045): o arquivo enviado já está no volume de uploads;
 * o worker lê inputPath, prevê e grava o CSV de saída em outputPath (ambos
 * relativos ao UPLOAD_DIR). Mesma fila e semântica de erro do runPrediction.
 */
export async function runBatchPrediction(
  modelId: string,
  inputPath: string,
  outputPath: string,
): Promise<BatchPrediction> {
  const job = await getPredictionsQueue().add("model:predict-batch", {
    modelId,
    inputPath,
    outputPath,
  });
  return (await waitForJob(
    job,
    BATCH_PREDICTION_TIMEOUT_MS,
  )) as BatchPrediction;
}

/**
 * O bullmq Python grava o failedReason como string JSON-serializada
 * ("O arquivo não..."); decodifica para exibir o texto limpo em pt.
 */
function decodeFailedReason(message: string): string {
  if (message.startsWith('"') && message.endsWith('"')) {
    try {
      const parsed = JSON.parse(message) as unknown;
      if (typeof parsed === "string") return parsed;
    } catch {
      // Não era JSON — usa a mensagem como veio
    }
  }
  return message;
}

async function waitForJob(job: Job, timeoutMs: number): Promise<unknown> {
  try {
    return await job.waitUntilFinished(getPredictionsQueueEvents(), timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/timed out/i.test(message)) {
      throw new Error(PREDICTION_TIMEOUT_MESSAGE);
    }
    // Job que falhou no worker rejeita com o failedReason, que o
    // model_predict(_batch).py garante em português (PredictionError);
    // qualquer outra rejeição (ex.: infraestrutura) vira a mensagem genérica
    const failedInWorker = await job.isFailed().catch(() => false);
    throw new Error(
      failedInWorker && message
        ? decodeFailedReason(message)
        : PREDICTION_GENERIC_MESSAGE,
    );
  }
}

import { Queue } from "bullmq";
import IORedis from "ioredis";

// Singletons em globalThis: sobrevivem ao hot reload do next dev e evitam
// abrir uma conexão Redis por request (mesmo padrão do getDb)
const globalForQueue = globalThis as unknown as {
  __redisConnection?: IORedis;
  __datasetsQueue?: Queue;
  __trainingQueue?: Queue;
  __predictionsQueue?: Queue;
};

export function getRedisConnection(): IORedis {
  if (!globalForQueue.__redisConnection) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    globalForQueue.__redisConnection = new IORedis(url, {
      // Exigido pelo BullMQ para comandos bloqueantes
      maxRetriesPerRequest: null,
    });
  }
  return globalForQueue.__redisConnection;
}

/** Fila de processamento de datasets (jobs dataset:parse e dataset:profile). */
function getDatasetsQueue(): Queue {
  if (!globalForQueue.__datasetsQueue) {
    globalForQueue.__datasetsQueue = new Queue("datasets", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return globalForQueue.__datasetsQueue;
}

/** Enfileira o parsing de um dataset recém-enviado (consumido pelo worker Python). */
export async function enqueueDatasetParse(datasetId: string): Promise<void> {
  await getDatasetsQueue().add("dataset:parse", { datasetId });
}

/** Parâmetros do job dataset:transform (US-036), espelhados no worker Python. */
export type DatasetTransformParams =
  | { column: string; newType: "number" | "text" | "category" | "date" | "id" }
  | { operations: string[] };

/** Enfileira uma transformação do Prepare (type_change ou clean) sobre a versão ativa. */
export async function enqueueDatasetTransform(
  datasetId: string,
  kind: "clean" | "type_change",
  params: DatasetTransformParams,
): Promise<void> {
  await getDatasetsQueue().add("dataset:transform", {
    datasetId,
    kind,
    params,
  });
}

/** Fila de treinamento de modelos (job model:train), separada para não bloquear o parsing. */
function getTrainingQueue(): Queue {
  if (!globalForQueue.__trainingQueue) {
    globalForQueue.__trainingQueue = new Queue("training", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return globalForQueue.__trainingQueue;
}

/** Enfileira o treinamento de um modelo (consumido pelo worker Python na US-014). */
export async function enqueueModelTrain(trainingJobId: string): Promise<void> {
  await getTrainingQueue().add("model:train", { trainingJobId });
}

/**
 * Nº de treinos simultâneos do worker (env `TRAINING_CONCURRENCY`). Espelha
 * `training_concurrency()` em apps/worker/main.py — o web só lê o valor para
 * estimar a espera na fila (US-014), quem consome a fila é o worker. Os dois
 * precisam do mesmo default e, em produção, da mesma variável (o compose passa
 * o mesmo `${TRAINING_CONCURRENCY:-2}` para ambos). Default 2 (Pocket US-016):
 * a VM de 1 clique do Render é bem menor que a prática antiga (sem réplicas,
 * um único container web+worker) — 2 treinos simultâneos com MODEL_N_JOBS=2
 * cobre até 4 vCPUs sem sufocar o próprio processo web no mesmo host.
 */
export const DEFAULT_TRAINING_CONCURRENCY = 2;

let warnedInvalidConcurrency = false;

export function trainingConcurrency(): number {
  const raw = (process.env.TRAINING_CONCURRENCY ?? "").trim();
  if (raw === "") return DEFAULT_TRAINING_CONCURRENCY;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 1) return parsed;
  if (!warnedInvalidConcurrency) {
    warnedInvalidConcurrency = true;
    console.warn(
      `[queue] TRAINING_CONCURRENCY inválido (${JSON.stringify(raw)}); usando ${DEFAULT_TRAINING_CONCURRENCY}`,
    );
  }
  return DEFAULT_TRAINING_CONCURRENCY;
}

/** Só para testes: volta a avisar sobre TRAINING_CONCURRENCY inválido. */
export function resetTrainingConcurrencyWarning(): void {
  warnedInvalidConcurrency = false;
}

/** Um job model:train que o worker já pegou. */
type ActiveTrainingJob = {
  trainingJobId: string;
  /** Epoch em ms em que o worker começou a processar; null se o BullMQ não gravou. */
  processedOn: number | null;
};

/** Foto da fila "training" do ponto de vista de um training_job. */
export type TrainingQueueSnapshot = {
  /** Jobs em execução no worker (getActive), em qualquer ordem. */
  active: ActiveTrainingJob[];
  /** Todos os training_jobs em waiting, na ordem FIFO em que serão consumidos. */
  waiting: string[];
  /** training_jobs em waiting antes do nosso, na ordem FIFO em que serão consumidos. */
  ahead: string[];
  /** Posição 1-based em waiting; null se o job não está esperando (ativo ou finalizado). */
  position: number | null;
  /** Tamanho da fila waiting. */
  total: number;
};

function trainingJobIdOf(job: { data: unknown }): string | null {
  const id = (job.data as { trainingJobId?: unknown } | undefined)
    ?.trainingJobId;
  return typeof id === "string" ? id : null;
}

/**
 * Foto da fila "training" para estimar a espera (US-014): jobs ativos com
 * `processedOn` (para descontar o que já rodou) e a posição do nosso job em
 * waiting com quem está à frente. Retorna null se o Redis falhar — a tela de
 * progresso omite a estimativa em vez de quebrar.
 */
export async function getTrainingQueueSnapshot(
  trainingJobId: string,
): Promise<TrainingQueueSnapshot | null> {
  try {
    const queue = getTrainingQueue();
    // FIFO: getWaiting() devolve os jobs na ordem em que serão consumidos
    const [activeJobs, waiting] = await Promise.all([
      queue.getActive(),
      queue.getWaiting(),
    ]);
    const active = activeJobs.flatMap((job) => {
      const id = trainingJobIdOf(job);
      return id
        ? [{ trainingJobId: id, processedOn: job.processedOn ?? null }]
        : [];
    });
    const waitingIds = waiting.map(trainingJobIdOf);
    const index = waitingIds.indexOf(trainingJobId);
    const onlyIds = (ids: (string | null)[]) =>
      ids.filter((id): id is string => id !== null);
    return {
      active,
      waiting: onlyIds(waitingIds),
      ahead: index === -1 ? [] : onlyIds(waitingIds.slice(0, index)),
      position: index === -1 ? null : index + 1,
      total: waiting.length,
    };
  } catch {
    return null;
  }
}

/**
 * Posição de um training_job na fila "training" enquanto ele espera um slot
 * do worker. Retorna null se o job não está mais em waiting (já ativo ou
 * finalizado) ou se o Redis falhar — a tela de progresso apenas omite a
 * linha de posição nesses casos, sem quebrar a página.
 */
export async function getTrainingQueuePosition(
  trainingJobId: string,
): Promise<{ position: number; total: number } | null> {
  try {
    // FIFO: getWaiting() devolve os jobs na ordem em que serão consumidos
    const waiting = await getTrainingQueue().getWaiting();
    const index = waiting.findIndex(
      (job) =>
        (job.data as { trainingJobId?: string } | undefined)?.trainingJobId ===
        trainingJobId,
    );
    if (index === -1) return null;
    return { position: index + 1, total: waiting.length };
  } catch {
    return null;
  }
}

/**
 * Fila de predição síncrona (job model:predict, US-042), separada do
 * treinamento para uma predição de segundos não esperar um treino longo.
 * O caminho de espera do resultado vive em src/lib/predictions.ts.
 */
export function getPredictionsQueue(): Queue {
  if (!globalForQueue.__predictionsQueue) {
    globalForQueue.__predictionsQueue = new Queue("predictions", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return globalForQueue.__predictionsQueue;
}

import "server-only";

import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, datasets, trainingJobs } from "@/db/schema";
import {
  getTrainingQueueSnapshot,
  trainingConcurrency,
  type TrainingQueueSnapshot,
} from "@/lib/queue";
import {
  durationRange,
  FALLBACK_DURATION_SECONDS,
} from "@/lib/training-eta-format";

/**
 * Estimativas de duração do treino (US-027 + US-014). Os helpers puros
 * (tabela fixa, faixa 0,7x/1,5x, formatação) vivem em `training-eta-format.ts`
 * e são re-exportados aqui; Client Components importam de lá, porque este
 * módulo consulta o banco.
 */
export * from "@/lib/training-eta-format";

/* -------------------------------------------------------------------------- */
/* Mediana real por tipo e faixa de linhas (US-014 da PRD)                     */
/* -------------------------------------------------------------------------- */

/**
 * A duração histórica vem dos eventos `training.succeeded` em audit_logs
 * (metadata.durationSeconds gravado pelo worker na mesma transação do
 * status). O evento não carrega o tamanho do dataset, então a faixa de linhas
 * sai de um LEFT JOIN com datasets pelo metadata.datasetId — dataset apagado
 * (cascade do projeto) deixa rowCount null e a amostra só entra na mediana
 * do tipo. Retries inflam a duração (updated_at − created_at do job
 * original), por isso mediana e não média.
 */

/** Janela do histórico consultado. */
export const DURATION_HISTORY_DAYS = 30;

/** Abaixo disso a célula (ou o tipo) não tem amostras suficientes. */
export const MIN_DURATION_SAMPLES = 5;

/** Validade do cache em memória das medianas, por processo. */
export const DURATION_MEDIANS_CACHE_TTL_MS = 5 * 60_000;

export type RowBucket = "lt_1k" | "1k_10k" | "10k_100k" | "gte_100k";

/** Faixa de linhas: <1k, 1k–10k, 10k–100k, >=100k. */
export function rowBucket(rowCount: number): RowBucket {
  if (rowCount < 1_000) return "lt_1k";
  if (rowCount < 10_000) return "1k_10k";
  if (rowCount < 100_000) return "10k_100k";
  return "gte_100k";
}

/** Uma linha do histórico: um `training.succeeded` com duração conhecida. */
export type DurationSample = {
  problemType: string;
  durationSeconds: number;
  /** null quando o dataset já não existe. */
  rowCount: number | null;
};

/** Leitura do histórico — injetável nos testes. */
export type DurationHistoryStore = {
  /** Amostras de `training.succeeded` criadas a partir de `since`. */
  listSucceededDurations(since: Date): Promise<DurationSample[]>;
};

/** Mediana simples (média dos dois centrais em tamanho par). */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

type MedianEntry = { seconds: number; samples: number };

/** Medianas agregadas: por célula (tipo + faixa) e por tipo. */
export type DurationMedians = {
  byCell: Map<string, MedianEntry>;
  byType: Map<string, MedianEntry>;
};

function cellKey(problemType: string, bucket: RowBucket): string {
  return `${problemType}:${bucket}`;
}

/** Agrupa as amostras em medianas por célula e por tipo. Puro. */
export function computeDurationMedians(
  samples: DurationSample[],
): DurationMedians {
  const cells = new Map<string, number[]>();
  const types = new Map<string, number[]>();
  for (const sample of samples) {
    if (
      !Number.isFinite(sample.durationSeconds) ||
      sample.durationSeconds < 0
    ) {
      continue;
    }
    const byType = types.get(sample.problemType) ?? [];
    byType.push(sample.durationSeconds);
    types.set(sample.problemType, byType);
    if (sample.rowCount !== null && Number.isFinite(sample.rowCount)) {
      const key = cellKey(sample.problemType, rowBucket(sample.rowCount));
      const byCell = cells.get(key) ?? [];
      byCell.push(sample.durationSeconds);
      cells.set(key, byCell);
    }
  }
  const toEntries = (groups: Map<string, number[]>) =>
    new Map(
      [...groups].map(([key, values]) => [
        key,
        { seconds: median(values), samples: values.length },
      ]),
    );
  return { byCell: toEntries(cells), byType: toEntries(types) };
}

type MediansCache = { medians: DurationMedians; expiresAt: number };

let mediansCache: MediansCache | null = null;

/** Só para testes: esquece as medianas cacheadas. */
export function resetTrainingDurationCache(): void {
  mediansCache = null;
}

const EMPTY_MEDIANS: DurationMedians = { byCell: new Map(), byType: new Map() };

/**
 * Medianas dos últimos DURATION_HISTORY_DAYS dias, cacheadas por
 * DURATION_MEDIANS_CACHE_TTL_MS. Nunca lança: se a consulta falhar, mantém o
 * último valor conhecido (ou vazio, que leva ao fallback fixo) pelo mesmo TTL
 * e avisa no console — a tela de progresso faz polling a cada 2 s e não pode
 * martelar um banco indisponível.
 */
async function getDurationMedians(
  store: DurationHistoryStore,
  now: Date,
): Promise<DurationMedians> {
  const cached = mediansCache;
  if (cached && cached.expiresAt > now.getTime()) return cached.medians;

  let medians: DurationMedians;
  try {
    const since = new Date(
      now.getTime() - DURATION_HISTORY_DAYS * 24 * 60 * 60 * 1000,
    );
    medians = computeDurationMedians(await store.listSucceededDurations(since));
  } catch (error) {
    console.warn("[training-eta] falha ao ler o histórico de duração:", error);
    medians = cached?.medians ?? EMPTY_MEDIANS;
  }
  mediansCache = {
    medians,
    expiresAt: now.getTime() + DURATION_MEDIANS_CACHE_TTL_MS,
  };
  return medians;
}

type DurationEstimateSource = "history_cell" | "history_type" | "fallback";

export type TrainingDurationEstimate = {
  seconds: number;
  source: DurationEstimateSource;
  /** Amostras por trás do número (0 no fallback fixo). */
  samples: number;
};

export type EstimateTrainingDurationInput = {
  problemType: string;
  /** null quando o tamanho do dataset é desconhecido (pula a célula). */
  rowCount: number | null;
};

export type EstimateTrainingDurationOptions = {
  store?: DurationHistoryStore;
  now?: Date;
};

/**
 * Estimativa pontual de duração de um treino, em segundos:
 * 1. mediana da célula (problemType + faixa de linhas) com ≥ MIN_DURATION_SAMPLES;
 * 2. senão, mediana do problemType com ≥ MIN_DURATION_SAMPLES;
 * 3. senão, FALLBACK_DURATION_SECONDS; tipo sem fallback → null (a UI omite).
 */
export async function estimateTrainingDuration(
  input: EstimateTrainingDurationInput,
  options: EstimateTrainingDurationOptions = {},
): Promise<TrainingDurationEstimate | null> {
  const now = options.now ?? new Date();
  const medians = await getDurationMedians(
    options.store ?? dbDurationHistoryStore,
    now,
  );

  if (input.rowCount !== null) {
    const cell = medians.byCell.get(
      cellKey(input.problemType, rowBucket(input.rowCount)),
    );
    if (cell && cell.samples >= MIN_DURATION_SAMPLES) {
      return { ...cell, source: "history_cell" };
    }
  }
  const type = medians.byType.get(input.problemType);
  if (type && type.samples >= MIN_DURATION_SAMPLES) {
    return { ...type, source: "history_type" };
  }
  const fallback = FALLBACK_DURATION_SECONDS[input.problemType];
  return fallback === undefined
    ? null
    : { seconds: fallback, source: "fallback", samples: 0 };
}

const dbDurationHistoryStore: DurationHistoryStore = {
  async listSucceededDurations(since) {
    // json_type filtra tanto a chave ausente quanto null/strings; json_extract
    // já devolve o valor numérico direto (sem cast) quando o tipo bate.
    const rows = await getDb()
      .select({
        problemType: sql<
          string | null
        >`json_extract(${auditLogs.metadata}, '$.problemType')`,
        durationSeconds: sql<number>`json_extract(${auditLogs.metadata}, '$.durationSeconds')`,
        rowCount: datasets.rowCount,
      })
      .from(auditLogs)
      .leftJoin(
        datasets,
        sql`${datasets.id} = json_extract(${auditLogs.metadata}, '$.datasetId')`,
      )
      .where(
        and(
          eq(auditLogs.action, "training.succeeded"),
          gte(auditLogs.createdAt, since),
          sql`json_type(${auditLogs.metadata}, '$.durationSeconds') IN ('integer', 'real')`,
        ),
      );
    return rows.flatMap((row) =>
      row.problemType
        ? [
            {
              problemType: row.problemType,
              durationSeconds: row.durationSeconds,
              rowCount: row.rowCount,
            },
          ]
        : [],
    );
  },
};

/* -------------------------------------------------------------------------- */
/* Espera na fila: jobs ativos + jobs à frente + concorrência (US-014)         */
/* -------------------------------------------------------------------------- */

/** Tipo e tamanho de um training_job — o que a estimativa de duração precisa. */
export type TrainingJobInfo = EstimateTrainingDurationInput;

/** Leitura de training_jobs (+ datasets.row_count) — injetável nos testes. */
export type TrainingJobInfoStore = {
  /** Info dos jobs pedidos; ids desconhecidos ficam de fora do Map. */
  listJobInfo(trainingJobIds: string[]): Promise<Map<string, TrainingJobInfo>>;
};

export type QueueWaitEstimate = {
  /** Faixa exibida (totalSeconds × 0,7 / × 1,5). */
  minSeconds: number;
  maxSeconds: number;
  /** Posição 1-based em waiting; null se o job já saiu da fila (rodando/terminado). */
  position: number | null;
  /** Tamanho da fila waiting. */
  total: number;
  /** Até o worker pegar o nosso job (0 quando já está rodando). */
  waitSeconds: number;
  /** waitSeconds + estimativa própria — o "etaSeconds" gravado no enfileiramento. */
  totalSeconds: number;
  /** Estimativa própria de duração do treino (US-019). */
  own: TrainingDurationEstimate;
  /**
   * Epoch em ms em que o worker pegou o job (processedOn do BullMQ) quando
   * ele está ativo; null na fila, depois de terminar ou se o BullMQ não gravou.
   * É o início real do treino — `training_jobs.created_at` inclui a espera.
   */
  startedAt: number | null;
};

export type EstimateQueueWaitOptions = EstimateTrainingDurationOptions & {
  snapshot?: (trainingJobId: string) => Promise<TrainingQueueSnapshot | null>;
  jobInfoStore?: TrainingJobInfoStore;
  /** Nº de slots do worker; default env TRAINING_CONCURRENCY. */
  concurrency?: number;
  /**
   * O job ainda não foi publicado na fila (estimativa gravada no
   * `training.start`, antes do enqueue): trata-o como último de waiting —
   * espera conta todos os ativos e toda a fila, posição = total + 1.
   */
  pending?: boolean;
};

/**
 * Simula os slots do worker: cada slot acumula o tempo até ficar livre.
 * Os jobs ativos entram com o restante estimado (estimativa − decorrido, mínimo
 * 0) e os jobs à frente na fila entram, em ordem FIFO, no slot que libera
 * primeiro. A espera é o menor slot ao final — o momento em que o nosso job
 * seria pego. Puro.
 */
export function simulateQueueWait(
  activeRemaining: number[],
  aheadDurations: number[],
  concurrency: number,
): number {
  const slots = new Array<number>(Math.max(1, Math.floor(concurrency))).fill(0);
  const pickFreestSlot = () => slots.indexOf(Math.min(...slots));
  // Ativos ocupam slots agora: os mais longos primeiro para não empilhar dois
  // ativos num slot enquanto outro fica vazio (só acontece se o worker tiver
  // mais ativos que a concorrência configurada no web).
  for (const remaining of [...activeRemaining].sort((a, b) => b - a)) {
    slots[pickFreestSlot()] += Math.max(0, remaining);
  }
  for (const duration of aheadDurations) {
    slots[pickFreestSlot()] += Math.max(0, duration);
  }
  return Math.min(...slots);
}

/**
 * Faixa de tempo até o treino terminar, contando a fila (US-014):
 * espera (restante dos ativos + jobs à frente distribuídos pela concorrência)
 * + estimativa própria. Devolve null se o Redis falhar (snapshot null) ou se
 * o próprio job não tem estimativa (tipo desconhecido) — a UI omite a linha.
 * Jobs ativos/à frente sem info no banco usam a estimativa própria como proxy.
 */
export async function estimateQueueWait(
  trainingJobId: string,
  own: TrainingJobInfo,
  options: EstimateQueueWaitOptions = {},
): Promise<QueueWaitEstimate | null> {
  const now = options.now ?? new Date();
  const snapshot = await (options.snapshot ?? getTrainingQueueSnapshot)(
    trainingJobId,
  );
  if (!snapshot) return null;

  const durationOptions = { store: options.store, now };
  const ownEstimate = await estimateTrainingDuration(own, durationOptions);
  if (!ownEstimate) return null;

  // Ainda fora da fila (pending) e sem posição: todo mundo em waiting está à
  // frente. Se o snapshot já achou o job (corrida com o enqueue), vale o real.
  const pending = options.pending === true && snapshot.position === null;
  const ahead = pending ? snapshot.waiting : snapshot.ahead;
  const position = pending ? snapshot.total + 1 : snapshot.position;
  const total = pending ? snapshot.total + 1 : snapshot.total;

  const otherIds = [
    ...snapshot.active.map((job) => job.trainingJobId),
    ...ahead,
  ].filter((id) => id !== trainingJobId);
  let infos = new Map<string, TrainingJobInfo>();
  if (otherIds.length > 0) {
    try {
      infos = await (
        options.jobInfoStore ?? dbTrainingJobInfoStore
      ).listJobInfo([...new Set(otherIds)]);
    } catch (error) {
      console.warn("[training-eta] falha ao ler os jobs da fila:", error);
    }
  }
  const durationOf = async (id: string): Promise<number> => {
    const info = infos.get(id);
    if (!info) return ownEstimate.seconds;
    const estimate = await estimateTrainingDuration(info, durationOptions);
    return estimate?.seconds ?? ownEstimate.seconds;
  };

  const activeRemaining: number[] = [];
  let startedAt: number | null = null;
  for (const job of snapshot.active) {
    if (job.trainingJobId === trainingJobId) {
      startedAt = job.processedOn;
      continue;
    }
    const elapsed =
      job.processedOn === null
        ? 0
        : Math.max(0, (now.getTime() - job.processedOn) / 1000);
    activeRemaining.push((await durationOf(job.trainingJobId)) - elapsed);
  }
  const aheadDurations: number[] = [];
  for (const id of ahead) {
    if (id === trainingJobId) continue;
    aheadDurations.push(await durationOf(id));
  }

  // Fora de waiting (já rodando ou terminado) não há espera a somar
  const waitSeconds =
    position === null
      ? 0
      : simulateQueueWait(
          activeRemaining,
          aheadDurations,
          options.concurrency ?? trainingConcurrency(),
        );
  const totalSeconds = waitSeconds + ownEstimate.seconds;
  return {
    ...durationRange(totalSeconds),
    position,
    total,
    waitSeconds,
    totalSeconds,
    own: ownEstimate,
    startedAt,
  };
}

/**
 * Tipo e tamanho de um training_job existente (config.problemType +
 * datasets.row_count), a entrada da estimativa própria. null se o job não
 * existe, não tem problemType ou o banco falhar — quem chama cai no tipo do
 * config sem rowCount.
 */
export async function loadTrainingJobInfo(
  trainingJobId: string,
): Promise<TrainingJobInfo | null> {
  try {
    const infos = await dbTrainingJobInfoStore.listJobInfo([trainingJobId]);
    return infos.get(trainingJobId) ?? null;
  } catch (error) {
    console.warn("[training-eta] falha ao ler o training_job:", error);
    return null;
  }
}

const dbTrainingJobInfoStore: TrainingJobInfoStore = {
  async listJobInfo(trainingJobIds) {
    if (trainingJobIds.length === 0) return new Map();
    const rows = await getDb()
      .select({
        id: trainingJobs.id,
        problemType: sql<
          string | null
        >`json_extract(${trainingJobs.config}, '$.problemType')`,
        rowCount: datasets.rowCount,
      })
      .from(trainingJobs)
      .leftJoin(datasets, eq(datasets.id, trainingJobs.datasetId))
      .where(inArray(trainingJobs.id, trainingJobIds));
    return new Map(
      rows.flatMap((row) =>
        row.problemType
          ? [[row.id, { problemType: row.problemType, rowCount: row.rowCount }]]
          : [],
      ),
    );
  },
};

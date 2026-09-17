"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { datasetColumns, trainingJobs } from "@/db/schema";
import { logAudit, requestMeta } from "@/lib/audit";
import {
  findDatasetScoped,
  findProjectScoped,
  findTrainingJobScoped,
} from "@/lib/org-scope";
import { enqueueModelTrain } from "@/lib/queue";
import { enforceRateLimit } from "@/lib/rate-limit";
import { TRAINING_RATE_LIMIT } from "@/lib/rate-limit-policy";
import { requireSession } from "@/lib/session";
import { estimateQueueWait } from "@/lib/training-eta";
import { trainingRowLimitError } from "@/lib/training-limits";

// "use server" só permite exportar funções async — a lista fica interna
// Ordenados por tempo de treinamento; o worker aceita fast/standard/full como
// aliases legados, mas novas submissões usam só estes valores
const TRAINING_MODES = [
  "fastest",
  "high_quality",
  "higher_quality",
  "production",
] as const;
export type TrainingMode = (typeof TRAINING_MODES)[number];

// Tipo de modelo escolhido explicitamente na tela "Treinar modelo" (US-008).
// O problemType passa a ser derivado daqui — nunca mais inferido do eixo
// temporal
const MODEL_KINDS = ["predict", "forecast"] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

// Limites do horizonte de previsão (US-009) — espelhados na validação
// client-side das Configurações avançadas
const MIN_FORECAST_HORIZON = 1;
const MAX_FORECAST_HORIZON = 365;

// Agregação temporal da série (US-010) — "auto" mantém a frequência inferida
// pelo worker a partir do espaçamento dos dados
const FORECAST_AGGREGATIONS = [
  "auto",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
] as const;
export type ForecastAggregation = (typeof FORECAST_AGGREGATIONS)[number];

// Algoritmo de previsão (US-011) — "auto" testa os três e elege o de melhor
// MAPE no backtest; os demais são exatamente os que o worker implementa
const FORECAST_MODELS = ["auto", "naive", "holt_winters", "arima"] as const;
export type ForecastModelChoice = (typeof FORECAST_MODELS)[number];

export type StartTrainingInput = {
  target: string;
  ignoredColumns: string[];
  mode: TrainingMode;
  /** "predict" → classificação/regressão; "forecast" → série temporal. */
  modelKind: ModelKind;
  /** Obrigatório em "forecast"; ignorado em "predict". */
  timeColumn: string | null;
  /**
   * Períodos a prever à frente; null = automático (30% da série). Só vale em
   * "forecast".
   */
  forecastHorizon: number | null;
  /**
   * Bucket temporal da série; "auto" deixa o worker inferir a frequência. Só
   * vale em "forecast".
   */
  aggregation: ForecastAggregation;
  /**
   * Algoritmo fixado; "auto" deixa o worker escolher pelo backtest. Só vale em
   * "forecast".
   */
  forecastModel: ForecastModelChoice;
  /**
   * Coluna categórica que identifica cada subsequência (loja, produto, sensor);
   * null = série única. Só vale em "forecast".
   */
  idColumn: string | null;
};

/**
 * Valida a configuração, cria o training_job com status "queued" e enfileira
 * o job model:train (fila "training", consumido pelo worker na US-014).
 */
export async function startTraining(
  projectId: string,
  input: StartTrainingInput,
) {
  const { user } = await requireSession();
  const db = getDb();

  // Rate limit por usuário ANTES de qualquer trabalho (US-011)
  const limited = await enforceRateLimit("training", user.id, TRAINING_RATE_LIMIT);
  if (limited) {
    const body = (await limited.json()) as { error?: string };
    return { error: body.error ?? "Muitas requisições. Tente novamente." };
  }

  // projectId vem do client — escopo org + auditoria de negação
  const project = await findProjectScoped(user, projectId);
  if (!project?.datasetId) {
    return { error: "Projeto não encontrado." };
  }

  // Id vem do próprio projeto (não de input do usuário) — sem auditoria
  const dataset = await findDatasetScoped(user, project.datasetId, {
    auditDenied: false,
  });
  if (!dataset) {
    return { error: "Dataset não encontrado." };
  }
  if (dataset.status !== "ready") {
    return { error: "O dataset ainda não está pronto para treinamento." };
  }
  // Proteção da fila (US-005): dataset acima do teto TRAINING_MAX_ROWS não
  // entra na fila — compara com o row_count da versão ativa, sem ler o parquet
  const rowLimitError = trainingRowLimitError(dataset.rowCount);
  if (rowLimitError) {
    return { error: rowLimitError };
  }
  if (!TRAINING_MODES.includes(input.mode)) {
    return { error: "Modo de treinamento inválido." };
  }
  if (!MODEL_KINDS.includes(input.modelKind)) {
    return { error: "Tipo de modelo inválido." };
  }

  const columns = await db
    .select({ name: datasetColumns.name, type: datasetColumns.type })
    .from(datasetColumns)
    .where(eq(datasetColumns.datasetId, dataset.id));
  const byName = new Map(columns.map((column) => [column.name, column]));

  const targetColumn = byName.get(input.target);
  if (!targetColumn) {
    return { error: "Coluna alvo não encontrada no dataset." };
  }
  if (targetColumn.type !== "category" && targetColumn.type !== "number") {
    return { error: "A coluna alvo precisa ser categórica ou numérica." };
  }

  const ignoredColumns = [...new Set(input.ignoredColumns)].filter(
    (name) => byName.has(name) && name !== input.target,
  );

  // O tipo de modelo é explícito (US-008): "forecast" sempre vira forecasting
  // e exige eixo temporal; "predict" ignora timeColumn por completo
  let timeColumn: string | null = null;
  let forecastHorizon: number | null = null;
  let aggregation: ForecastAggregation = "auto";
  let forecastModel: ForecastModelChoice = "auto";
  let idColumn: string | null = null;
  let problemType: "classification" | "regression" | "forecasting";
  if (input.modelKind === "forecast") {
    if (targetColumn.type !== "number") {
      return {
        error: "A previsão temporal só aceita uma coluna alvo numérica.",
      };
    }
    if (!input.timeColumn) {
      return { error: "Escolha o eixo temporal da previsão temporal." };
    }
    const candidate = byName.get(input.timeColumn);
    if (!candidate || candidate.type !== "date") {
      return { error: "O eixo temporal precisa ser uma coluna de data." };
    }
    if (ignoredColumns.includes(candidate.name)) {
      return {
        error: "O eixo temporal não pode estar entre as colunas ignoradas.",
      };
    }
    if (input.forecastHorizon != null) {
      if (
        !Number.isInteger(input.forecastHorizon) ||
        input.forecastHorizon < MIN_FORECAST_HORIZON ||
        input.forecastHorizon > MAX_FORECAST_HORIZON
      ) {
        return {
          error:
            "O horizonte de previsão precisa ser um número inteiro entre 1 e 365.",
        };
      }
      forecastHorizon = input.forecastHorizon;
    }
    if (input.aggregation != null) {
      if (!FORECAST_AGGREGATIONS.includes(input.aggregation)) {
        return { error: "Agregação temporal inválida." };
      }
      aggregation = input.aggregation;
    }
    if (input.forecastModel != null) {
      if (!FORECAST_MODELS.includes(input.forecastModel)) {
        return { error: "Tipo de modelo de previsão inválido." };
      }
      forecastModel = input.forecastModel;
    }
    // Campo de identificação (US-017): opcional; quando preenchido, o worker
    // treina uma previsão independente por valor da coluna
    if (input.idColumn) {
      if (input.idColumn === input.target) {
        return {
          error: "O campo de identificação não pode ser a coluna alvo.",
        };
      }
      if (input.idColumn === candidate.name) {
        return {
          error: "O campo de identificação não pode ser o eixo temporal.",
        };
      }
      const idCandidate = byName.get(input.idColumn);
      if (!idCandidate) {
        return {
          error: "Coluna de identificação não encontrada no dataset.",
        };
      }
      if (idCandidate.type !== "category") {
        return {
          error: "O campo de identificação precisa ser uma coluna categórica.",
        };
      }
      if (ignoredColumns.includes(idCandidate.name)) {
        return {
          error:
            "O campo de identificação não pode estar entre as colunas ignoradas.",
        };
      }
      idColumn = idCandidate.name;
    }
    timeColumn = candidate.name;
    problemType = "forecasting";
  } else {
    problemType =
      targetColumn.type === "category" ? "classification" : "regression";
  }

  const [job] = await db
    .insert(trainingJobs)
    .values({
      orgId: user.orgId,
      projectId: project.id,
      datasetId: dataset.id,
      status: "queued",
      config: {
        target: input.target,
        ignoredColumns,
        mode: input.mode,
        modelKind: input.modelKind,
        timeColumn,
        forecastHorizon,
        aggregation,
        forecastModel,
        idColumn,
        problemType,
      },
    })
    .returning({ id: trainingJobs.id });

  // Estimativa no enfileiramento (US-015): fila atual + duração própria, com
  // o job ainda fora do Redis (pending). Fica em metadata.etaSeconds para
  // medir o acerto contra o durationSeconds do training.succeeded (docs §18).
  const eta = await estimateQueueWait(
    job.id,
    { problemType, rowCount: dataset.rowCount },
    { pending: true },
  );

  const meta = requestMeta(await headers());
  await logAudit({
    action: "training.start",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "training_job",
    resourceId: job.id,
    metadata: {
      projectId: project.id,
      projectName: project.name,
      datasetId: dataset.id,
      problemType,
      modelKind: input.modelKind,
      mode: input.mode,
      target: input.target,
      etaSeconds: eta ? Math.round(eta.totalSeconds) : null,
    },
    ...meta,
  });

  try {
    await enqueueModelTrain(job.id);
  } catch {
    await db
      .update(trainingJobs)
      .set({
        status: "failed",
        errorMessage:
          "Não foi possível enfileirar o treinamento. Tente novamente.",
      })
      .where(eq(trainingJobs.id, job.id));
    return { error: "Não foi possível iniciar o treinamento. Tente novamente." };
  }

  redirect(`/projects/${projectId}/predict/jobs/${job.id}`);
}

/**
 * Reenfileira um treinamento que falhou (US-019): volta o job para "queued",
 * limpa progresso/erro/candidatos e publica model:train de novo na fila.
 */
export async function retryTraining(projectId: string, jobId: string) {
  const { user } = await requireSession();
  const db = getDb();

  // Mesmo escopo do startTraining: retry também enfileira model:train (US-011)
  const limited = await enforceRateLimit("training", user.id, TRAINING_RATE_LIMIT);
  if (limited) {
    const body = (await limited.json()) as { error?: string };
    return { error: body.error ?? "Muitas requisições. Tente novamente." };
  }

  // jobId vem do client — escopo org + auditoria de negação (uuid validado no helper)
  const job = await findTrainingJobScoped(user, jobId, projectId);
  if (!job) {
    return { error: "Treinamento não encontrado." };
  }
  if (job.status !== "failed") {
    return { error: "Só é possível tentar novamente um treinamento que falhou." };
  }

  await db
    .update(trainingJobs)
    .set({
      status: "queued",
      progress: 0,
      progressStep: null,
      errorMessage: null,
      candidates: null,
    })
    .where(eq(trainingJobs.id, job.id));

  const meta = requestMeta(await headers());
  await logAudit({
    action: "training.retry",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "training_job",
    resourceId: job.id,
    metadata: { projectId },
    ...meta,
  });

  try {
    await enqueueModelTrain(job.id);
  } catch {
    await db
      .update(trainingJobs)
      .set({
        status: "failed",
        errorMessage:
          "Não foi possível enfileirar o treinamento. Tente novamente.",
      })
      .where(eq(trainingJobs.id, job.id));
    return { error: "Não foi possível reiniciar o treinamento. Tente novamente." };
  }

  return {};
}

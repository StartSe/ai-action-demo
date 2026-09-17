import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { datasetColumns, trainingJobs } from "@/db/schema";
import {
  findDatasetScoped,
  findLatestModelScoped,
  findProjectScoped,
} from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

import type {
  ForecastAggregation,
  ForecastModelChoice,
  ModelKind,
  TrainingMode,
} from "./actions";
import {
  buildModelReport,
  PROBLEM_LABELS,
  winnerLabelOf,
} from "./model-report";
import { PredictView, type PredictColumn } from "./predict-view";
import { ReportOnlyView } from "./report-only-view";

const TRAINING_MODE_VALUES: readonly TrainingMode[] = [
  "fastest",
  "high_quality",
  "higher_quality",
  "production",
];
// Modos legados de jobs antigos (mesmo mapeamento do worker)
const TRAINING_MODE_ALIASES: Record<string, TrainingMode> = {
  fast: "fastest",
  standard: "high_quality",
  full: "higher_quality",
};

// Configurações avançadas do forecasting (US-009/010/011) — pré-carregadas no
// "Retreinar modelo" (US-012); jobs antigos não têm as chaves e caem no default
const FORECAST_AGGREGATIONS: readonly ForecastAggregation[] = [
  "auto",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
];
const FORECAST_MODELS: readonly ForecastModelChoice[] = [
  "auto",
  "naive",
  "holt_winters",
  "arima",
];

function normalizeForecastHorizon(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 365
    ? value
    : null;
}

function normalizeAggregation(value: unknown): ForecastAggregation {
  return typeof value === "string" &&
    (FORECAST_AGGREGATIONS as readonly string[]).includes(value)
    ? (value as ForecastAggregation)
    : "auto";
}

function normalizeForecastModel(value: unknown): ForecastModelChoice {
  return typeof value === "string" &&
    (FORECAST_MODELS as readonly string[]).includes(value)
    ? (value as ForecastModelChoice)
    : "auto";
}

function normalizeTrainingMode(mode: unknown): TrainingMode {
  if (typeof mode === "string") {
    if ((TRAINING_MODE_VALUES as readonly string[]).includes(mode)) {
      return mode as TrainingMode;
    }
    if (mode in TRAINING_MODE_ALIASES) return TRAINING_MODE_ALIASES[mode];
  }
  return "high_quality";
}

export const metadata = { title: "Predição" };

export default async function PredictPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { user } = await requireSession();
  const db = getDb();

  // Layout pai já audita a negação deste projectId
  const project = await findProjectScoped(user, projectId, {
    auditDenied: false,
  });
  if (!project) notFound();

  // Sem dataset mas com modelo vigente: modo relatório somente leitura
  // (US-003) — o dataset de treino foi excluído, mas o resultado do treino
  // permanece no modelo. Sem modelo, mantém o redirect para a raiz. Não há
  // jobs ativos aqui: eles são apagados junto com o dataset.
  if (!project.datasetId) {
    const orphanModel = await findLatestModelScoped(user, project.id, {
      auditDenied: false,
    });
    if (!orphanModel) redirect(`/projects/${project.id}`);

    // Sem dataset_columns para validar, o alvo vem direto de model.target
    const report = buildModelReport(orphanModel);
    return (
      <ReportOnlyView
        projectId={project.id}
        target={orphanModel.target}
        report={report}
        fallback={
          report
            ? null
            : {
                problemLabel:
                  PROBLEM_LABELS[orphanModel.problemType] ??
                  orphanModel.problemType,
                winnerLabel: winnerLabelOf(orphanModel),
              }
        }
      />
    );
  }

  // Treinamento em andamento → visão de progresso
  const [activeJob] = await db
    .select({ id: trainingJobs.id })
    .from(trainingJobs)
    .where(
      and(
        eq(trainingJobs.projectId, project.id),
        eq(trainingJobs.orgId, user.orgId),
        inArray(trainingJobs.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(trainingJobs.createdAt))
    .limit(1);
  if (activeJob) {
    redirect(`/projects/${project.id}/predict/jobs/${activeJob.id}`);
  }

  // Id vem do próprio projeto (não de input do usuário) — sem auditoria
  const dataset = await findDatasetScoped(user, project.datasetId, {
    auditDenied: false,
  });
  if (!dataset) redirect(`/projects/${project.id}`);
  // Prepare já trata parsing/profiling (skeleton) e erro
  if (dataset.status !== "ready") redirect(`/projects/${project.id}/prepare`);

  const columns = await db
    .select({
      name: datasetColumns.name,
      type: datasetColumns.type,
      stats: datasetColumns.stats,
    })
    .from(datasetColumns)
    .where(eq(datasetColumns.datasetId, dataset.id))
    .orderBy(asc(datasetColumns.position));

  const predictColumns: PredictColumn[] = columns.map((column) => {
    const stats = column.stats as { unique?: number } | null;
    return {
      name: column.name,
      type: column.type,
      unique: typeof stats?.unique === "number" ? stats.unique : null,
    };
  });

  // Modelo vigente com alvo conhecido → Prever unificado abre no relatório
  // (US-004); alvo precisa existir nas colunas atuais do dataset
  const model = await findLatestModelScoped(user, project.id, {
    auditDenied: false,
  });
  const modelTarget =
    model &&
    model.target != null &&
    columns.some((column) => column.name === model.target)
      ? model.target
      : null;

  // Config do treino que gerou o modelo (modo/eixo temporal/tipo) — pré-carrega
  // a configuração no "Retreinar modelo" (US-006/US-008)
  let modelMode: TrainingMode = "high_quality";
  let modelTimeColumn: string | null = null;
  let modelForecastHorizon: number | null = null;
  let modelAggregation: ForecastAggregation = "auto";
  let modelForecastModel: ForecastModelChoice = "auto";
  let modelIdColumn: string | null = null;
  // Modelos treinados antes da US-008 não têm modelKind no config: o tipo do
  // formulário cai de volta no problemType gravado no modelo
  let modelKind: ModelKind =
    model?.problemType === "forecasting" ? "forecast" : "predict";
  if (model && modelTarget != null && model.trainingJobId) {
    const [job] = await db
      .select({ config: trainingJobs.config })
      .from(trainingJobs)
      .where(
        and(
          eq(trainingJobs.id, model.trainingJobId),
          eq(trainingJobs.orgId, user.orgId),
        ),
      )
      .limit(1);
    const config = (job?.config ?? null) as {
      mode?: unknown;
      modelKind?: unknown;
      timeColumn?: unknown;
      forecastHorizon?: unknown;
      aggregation?: unknown;
      forecastModel?: unknown;
      idColumn?: unknown;
    } | null;
    modelMode = normalizeTrainingMode(config?.mode);
    modelForecastHorizon = normalizeForecastHorizon(config?.forecastHorizon);
    modelAggregation = normalizeAggregation(config?.aggregation);
    modelForecastModel = normalizeForecastModel(config?.forecastModel);
    if (config?.modelKind === "forecast" || config?.modelKind === "predict") {
      modelKind = config.modelKind;
    }
    const timeColumn = config?.timeColumn;
    modelTimeColumn =
      typeof timeColumn === "string" &&
      columns.some((c) => c.name === timeColumn && c.type === "date")
        ? timeColumn
        : null;
    // Campo de identificação (US-017): só pré-carrega se a coluna ainda existir
    // como categoria (o Preparar pode ter mudado o tipo depois do treino)
    const idColumn = config?.idColumn;
    modelIdColumn =
      typeof idColumn === "string" &&
      columns.some((c) => c.name === idColumn && c.type === "category")
        ? idColumn
        : null;
  }

  const currentModel =
    model && modelTarget != null
      ? {
          target: modelTarget,
          ignoredColumns: Array.isArray(model.ignoredColumns)
            ? (model.ignoredColumns as string[])
            : [],
          mode: modelMode,
          modelKind,
          timeColumn: modelTimeColumn,
          forecastHorizon: modelForecastHorizon,
          aggregation: modelAggregation,
          forecastModel: modelForecastModel,
          idColumn: modelIdColumn,
        }
      : null;

  const report = model && currentModel ? buildModelReport(model) : null;
  // Modelo antigo sem insights/metrics → fallback interativo dentro do Prever
  const reportFallback =
    model && currentModel && !report
      ? {
          problemLabel: PROBLEM_LABELS[model.problemType] ?? model.problemType,
          winnerLabel: winnerLabelOf(model),
        }
      : null;

  return (
    <PredictView
      projectId={project.id}
      columns={predictColumns}
      model={currentModel}
      report={report}
      reportFallback={reportFallback}
    />
  );
}

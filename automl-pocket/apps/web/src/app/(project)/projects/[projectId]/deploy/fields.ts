import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { datasetColumns, trainingJobs, type models } from "@/db/schema";
import type { DeploymentFormField } from "@/components/deployment-form";

type ModelRow = typeof models.$inferSelect;

/** Linha de dataset_columns já ordenada por position. */
export type DeployFieldColumn = {
  name: string;
  type: DeploymentFormField["type"];
  stats: unknown;
};

/**
 * Regra pura de derivação das features publicáveis: colunas do dataset de
 * treino menos o alvo e as ignoradas — mesma regra do worker (jobs/automl.py),
 * então bate com as feature_columns do artefato. O alvo nunca aparece.
 *
 * Também usada por deleteDataset para congelar os campos no
 * models.training_snapshot antes de apagar os training_jobs.
 */
export function buildDeployFields(
  rawConfig: unknown,
  columns: DeployFieldColumn[],
): DeploymentFormField[] {
  const config = rawConfig as {
    target?: string;
    ignoredColumns?: string[];
  } | null;
  if (!config?.target) return [];

  const excluded = new Set([config.target, ...(config.ignoredColumns ?? [])]);
  return columns
    .filter((column) => !excluded.has(column.name))
    .map((column) => {
      const stats = column.stats as {
        distribution?: { kind?: string; items?: { label?: unknown }[] };
      } | null;
      // Categorias conhecidas do perfilamento viram opções do select público
      const categories =
        column.type === "category" && stats?.distribution?.kind === "categories"
          ? (stats.distribution.items ?? [])
              .map((item) => String(item.label ?? ""))
              .filter((label) => label.length > 0)
          : [];
      return { name: column.name, type: column.type, categories };
    });
}

/**
 * Deriva as features publicáveis do modelo a partir do training job vivo.
 *
 * Compartilhado pelas telas de configuração dos 3 endpoints (US-043/046/047).
 */
export async function getModelDeployFields(
  model: ModelRow,
): Promise<DeploymentFormField[]> {
  // Ordem de resolução: training job vivo → snapshot congelado na exclusão do
  // dataset (models.training_snapshot) → [] (modelo legado sem job nem snapshot,
  // cujo dataset foi excluído antes do snapshot existir).
  if (model.trainingJobId) {
    const db = getDb();
    const [job] = await db
      .select({
        datasetId: trainingJobs.datasetId,
        config: trainingJobs.config,
      })
      .from(trainingJobs)
      .where(eq(trainingJobs.id, model.trainingJobId))
      .limit(1);

    if (job) {
      const columns = await db
        .select({
          name: datasetColumns.name,
          type: datasetColumns.type,
          stats: datasetColumns.stats,
        })
        .from(datasetColumns)
        .where(eq(datasetColumns.datasetId, job.datasetId))
        .orderBy(asc(datasetColumns.position));

      return buildDeployFields(job.config, columns);
    }
  }

  return model.trainingSnapshot?.deployFields ?? [];
}

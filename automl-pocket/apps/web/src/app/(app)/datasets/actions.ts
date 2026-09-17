"use server";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import {
  datasetColumns,
  datasets,
  datasetVersions,
  models,
  projects,
  trainingJobs,
} from "@/db/schema";
import { buildDeployFields } from "@/app/(project)/projects/[projectId]/deploy/fields";
import { logAudit, requestMeta } from "@/lib/audit";
import { findDatasetScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";
import { removeFileQuiet } from "@/lib/uploads";

export async function deleteDataset(datasetId: string) {
  const { user } = await requireSession();
  const db = getDb();

  // Autoriza (escopo org + auditoria de negação) antes de excluir
  const dataset = await findDatasetScoped(user, datasetId);
  if (!dataset) {
    return { error: "Dataset não encontrado." };
  }

  const linkedProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.datasetId, dataset.id));

  // Parquets das versões do Prepare: o cascade apaga as linhas, então os
  // paths precisam ser coletados antes da transação
  const versions = await db
    .select({ parquetPath: datasetVersions.parquetPath })
    .from(datasetVersions)
    .where(eq(datasetVersions.datasetId, dataset.id));

  await db.transaction(async (tx) => {
    // Jobs de treino referenciam o dataset (FK not null); modelos já treinados
    // são preservados soltando a referência ao job antes de removê-lo
    const jobs = await tx
      .select({ id: trainingJobs.id, config: trainingJobs.config })
      .from(trainingJobs)
      .where(eq(trainingJobs.datasetId, dataset.id));
    if (jobs.length) {
      const jobIds = jobs.map((job) => job.id);

      // Snapshot de treino: congela config do job + campos de deploy no modelo
      // antes de apagar os jobs, para o modelo continuar autossuficiente
      // (relatório, retreino informativo e deployments). Modelos que já têm
      // snapshot (de uma exclusão anterior) não são sobrescritos.
      const modelsToSnapshot = await tx
        .select({ id: models.id, trainingJobId: models.trainingJobId })
        .from(models)
        .where(
          and(
            inArray(models.trainingJobId, jobIds),
            isNull(models.trainingSnapshot),
          ),
        );
      if (modelsToSnapshot.length) {
        const columns = await tx
          .select({
            name: datasetColumns.name,
            type: datasetColumns.type,
            stats: datasetColumns.stats,
          })
          .from(datasetColumns)
          .where(eq(datasetColumns.datasetId, dataset.id))
          .orderBy(asc(datasetColumns.position));
        const configByJobId = new Map(jobs.map((job) => [job.id, job.config]));
        for (const model of modelsToSnapshot) {
          const config = model.trainingJobId
            ? configByJobId.get(model.trainingJobId)
            : undefined;
          if (config === undefined) continue;
          await tx
            .update(models)
            .set({
              trainingSnapshot: {
                config: config as Record<string, unknown>,
                deployFields: buildDeployFields(config, columns),
              },
            })
            .where(eq(models.id, model.id));
        }
      }

      await tx
        .update(models)
        .set({ trainingJobId: null })
        .where(inArray(models.trainingJobId, jobIds));
      await tx.delete(trainingJobs).where(inArray(trainingJobs.id, jobIds));
    }
    await tx
      .update(projects)
      .set({ datasetId: null })
      .where(eq(projects.datasetId, dataset.id));
    await tx.delete(datasets).where(eq(datasets.id, dataset.id));
  });

  await removeFileQuiet(dataset.filePath);
  await removeFileQuiet(dataset.parquetPath);
  for (const version of versions) {
    await removeFileQuiet(version.parquetPath);
  }

  await logAudit({
    action: "dataset.delete",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "dataset",
    resourceId: dataset.id,
    metadata: {
      fileName: dataset.fileName,
      linkedProjectIds: linkedProjects.map((project) => project.id),
    },
    ...requestMeta(await headers()),
  });

  revalidatePath("/datasets");
  revalidatePath("/projects");
  return { ok: true };
}

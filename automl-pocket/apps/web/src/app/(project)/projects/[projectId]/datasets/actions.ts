"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { logAudit, requestMeta } from "@/lib/audit";
import { isDatasetSelectable } from "@/lib/dataset-status";
import { findDatasetScoped, findProjectScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

/** Vincula um dataset existente ao projeto e navega para a etapa Prepare. */
export async function selectDataset(projectId: string, datasetId: string) {
  const { user } = await requireSession();

  // Ambos os ids vêm do client — escopo org + auditoria de negação
  const dataset = await findDatasetScoped(user, datasetId);
  if (!dataset) {
    return { error: "Dataset não encontrado." };
  }
  // O picker já esconde/desabilita esses casos; aqui é a barreira de servidor
  if (!isDatasetSelectable(dataset.status)) {
    return {
      error:
        dataset.status === "needs_review"
          ? "Esta planilha precisa de revisão antes de ser usada em um projeto."
          : "Este dataset falhou ao processar. Reenvie o arquivo para usá-lo.",
    };
  }

  const project = await findProjectScoped(user, projectId);
  if (!project) {
    return { error: "Projeto não encontrado." };
  }

  await getDb()
    .update(projects)
    .set({ datasetId: dataset.id })
    .where(eq(projects.id, project.id));

  const meta = requestMeta(await headers());
  await logAudit({
    action: "project.dataset_link",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "project",
    resourceId: projectId,
    metadata: { datasetId: dataset.id },
    ...meta,
  });

  revalidatePath("/projects");
  redirect(`/projects/${projectId}/prepare`);
}

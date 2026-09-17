"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { models, projects } from "@/db/schema";
import { logAudit, requestMeta } from "@/lib/audit";
import { findProjectScoped } from "@/lib/org-scope";
import { deleteProjectData } from "@/lib/project-delete";
import { parseProblemDescription } from "@/lib/project-problem";
import { requireSession } from "@/lib/session";
import { removeFileQuiet } from "@/lib/uploads";
import { NAME_MAX_LENGTH } from "@/lib/validation-limits";

export async function createProject(
  name: string,
  problemDescription?: string | null,
) {
  const { user } = await requireSession();

  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    return { error: "O nome do projeto não pode ficar vazio." };
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return {
      error: `O nome do projeto deve ter no máximo ${NAME_MAX_LENGTH} caracteres.`,
    };
  }

  // Campo opcional do diálogo (US-029): vazio vira null, >1000 chars é erro
  const description = parseProblemDescription(problemDescription);
  if (!description.ok) {
    return { error: description.error };
  }

  const db = getDb();

  const [project] = await db
    .insert(projects)
    .values({
      orgId: user.orgId,
      createdBy: user.id,
      name: trimmed,
      problemDescription: description.value,
    })
    .returning({ id: projects.id });

  const meta = requestMeta(await headers());
  await logAudit({
    action: "project.create",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "project",
    resourceId: project.id,
    // Nunca o texto da descrição — só se foi informada
    metadata: {
      projectName: trimmed,
      hasProblemDescription: description.value !== null,
    },
    ...meta,
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function renameProject(projectId: string, name: string) {
  const { user } = await requireSession();
  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "O nome do projeto não pode ficar vazio." };
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return {
      error: `O nome do projeto deve ter no máximo ${NAME_MAX_LENGTH} caracteres.`,
    };
  }

  // Autoriza (escopo org + auditoria de negação) antes de alterar
  const project = await findProjectScoped(user, projectId);
  if (!project) {
    return { error: "Projeto não encontrado." };
  }

  const db = getDb();
  await db
    .update(projects)
    .set({ name: trimmed })
    .where(eq(projects.id, project.id));

  revalidatePath("/projects");
  return { ok: true };
}

/**
 * Salva a descrição do problema de negócio (US-029).
 */
export async function updateProjectDescription(
  projectId: string,
  problemDescription: string | null,
): Promise<
  { ok: true; problemDescription: string | null } | { ok: false; error: string }
> {
  const { user } = await requireSession();

  const description = parseProblemDescription(problemDescription);
  if (!description.ok) {
    return { ok: false, error: description.error };
  }

  // Autoriza (escopo org + auditoria de negação) antes de alterar
  const project = await findProjectScoped(user, projectId);
  if (!project) {
    return { ok: false, error: "Projeto não encontrado." };
  }

  await getDb()
    .update(projects)
    .set({ problemDescription: description.value })
    .where(eq(projects.id, project.id));

  const meta = requestMeta(await headers());
  await logAudit({
    action: "project.update_description",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "project",
    resourceId: project.id,
    // Sem o texto: só o nome do projeto (cascade apaga projects) e, se ficou
    // vazia, o tamanho
    metadata: {
      projectName: project.name,
      hasDescription: description.value !== null,
      descriptionLength: description.value?.length ?? 0,
    },
    ...meta,
  });

  revalidatePath(`/projects/${project.id}`);
  revalidatePath("/projects");
  return { ok: true, problemDescription: description.value };
}

export async function setProjectArchived(projectId: string, archived: boolean) {
  const { user } = await requireSession();

  const project = await findProjectScoped(user, projectId);
  if (!project) {
    return { error: "Projeto não encontrado." };
  }

  await getDb()
    .update(projects)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(projects.id, project.id));

  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteProject(projectId: string) {
  const { user } = await requireSession();
  const db = getDb();

  const project = await findProjectScoped(user, projectId);
  if (!project) {
    return { error: "Projeto não encontrado." };
  }

  // O dataset é preservado: a exclusão remove só o projeto, seus
  // models/training_jobs (cascade) e os artefatos joblib dos modelos
  await deleteProjectData(
    {
      listModelArtifacts: async (id) => {
        const rows = await db
          .select({ artifactPath: models.artifactPath })
          .from(models)
          .where(eq(models.projectId, id));
        return rows.map((row) => row.artifactPath);
      },
      deleteProjectRow: async (id) => {
        await db.delete(projects).where(eq(projects.id, id));
      },
      removeFile: removeFileQuiet,
    },
    project.id,
  );

  const meta = requestMeta(await headers());
  await logAudit({
    action: "project.delete",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "project",
    resourceId: project.id,
    metadata: { name: project.name },
    ...meta,
  });

  revalidatePath("/projects");
  return { ok: true };
}

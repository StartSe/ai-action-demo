"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { getDb } from "@/db";
import { deployments } from "@/db/schema";
import { logAudit, requestMeta } from "@/lib/audit";
import { findProjectScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

import { loadDeployContext } from "../context";

export type WebAppConfigInput = {
  title: string;
  description: string;
  /** Nomes das features selecionadas para o formulário público */
  fields: string[];
};

const configSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Informe um título para o Web App.")
    .max(120, "O título pode ter no máximo 120 caracteres."),
  description: z
    .string()
    .trim()
    .max(500, "A descrição pode ter no máximo 500 caracteres."),
  fields: z.array(z.string().max(300)).max(500),
});

/** Slug secreto url-safe da URL pública (24 chars, ≥16 exigidos pela US-043). */
function newPublicSlug(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Valida a configuração enviada; as features são filtradas contra as do modelo
 * e reordenadas na ordem original das colunas (ordem do formulário público).
 */
function parseConfig(
  input: WebAppConfigInput,
  modelFieldNames: string[],
):
  | { error: string }
  | { config: { title: string; description: string | null; fields: string[] } } {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Configuração inválida.",
    };
  }
  const selected = new Set(parsed.data.fields);
  const fields = modelFieldNames.filter((name) => selected.has(name));
  if (fields.length === 0) {
    return { error: "Selecione pelo menos um campo do modelo." };
  }
  return {
    config: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      fields,
    },
  };
}

/**
 * Salva a configuração do Web App (draft ou publicado) sem mudar o status.
 * Com o deployment publicado, a página pública reflete imediatamente.
 */
export async function saveWebAppDeployment(
  projectId: string,
  input: WebAppConfigInput,
): Promise<{ error?: string }> {
  const ctx = await loadDeployContext(projectId);
  if (!ctx.ok) return { error: ctx.error };

  const parsed = parseConfig(
    input,
    ctx.modelFields.map((field) => field.name),
  );
  if ("error" in parsed) return parsed;

  const [row] = await getDb()
    .insert(deployments)
    .values({
      orgId: ctx.user.orgId,
      projectId: ctx.project.id,
      modelId: ctx.model.id,
      type: "web_app",
      status: "draft",
      ...parsed.config,
    })
    .onConflictDoUpdate({
      target: [deployments.projectId, deployments.type],
      set: { ...parsed.config, modelId: ctx.model.id, updatedAt: new Date() },
    })
    .returning({ id: deployments.id });

  const meta = requestMeta(await headers());
  await logAudit({
    action: "deployment.update",
    orgId: ctx.user.orgId,
    userId: ctx.user.id,
    resourceType: "deployment",
    resourceId: row.id,
    metadata: {
      projectId: ctx.project.id,
      type: "web_app",
      fieldCount: parsed.config.fields.length,
    },
    ...meta,
  });

  return {};
}

/**
 * Publica o Web App: salva a configuração, gera um public_slug NOVO (publicar
 * de novo troca o link) e marca como published.
 */
export async function publishWebAppDeployment(
  projectId: string,
  input: WebAppConfigInput,
): Promise<{ error: string } | { slug: string }> {
  const ctx = await loadDeployContext(projectId);
  if (!ctx.ok) return { error: ctx.error };

  const parsed = parseConfig(
    input,
    ctx.modelFields.map((field) => field.name),
  );
  if ("error" in parsed) return parsed;

  const slug = newPublicSlug();
  const [row] = await getDb()
    .insert(deployments)
    .values({
      orgId: ctx.user.orgId,
      projectId: ctx.project.id,
      modelId: ctx.model.id,
      type: "web_app",
      status: "published",
      publicSlug: slug,
      ...parsed.config,
    })
    .onConflictDoUpdate({
      target: [deployments.projectId, deployments.type],
      set: {
        ...parsed.config,
        modelId: ctx.model.id,
        status: "published",
        publicSlug: slug,
        updatedAt: new Date(),
      },
    })
    .returning({ id: deployments.id });

  const meta = requestMeta(await headers());
  await logAudit({
    action: "deployment.publish",
    orgId: ctx.user.orgId,
    userId: ctx.user.id,
    resourceType: "deployment",
    resourceId: row.id,
    metadata: {
      projectId: ctx.project.id,
      projectName: ctx.project.name,
      type: "web_app",
      fieldCount: parsed.config.fields.length,
    },
    ...meta,
  });

  return { slug };
}

/** Despublica o Web App: volta a draft e remove o slug (o link antigo morre). */
export async function unpublishWebAppDeployment(
  projectId: string,
): Promise<{ error?: string }> {
  const { user } = await requireSession();

  // Sem exigir modelo publicável: despublicar deve funcionar mesmo se o
  // projeto foi retreinado como forecasting depois da publicação
  const project = await findProjectScoped(user, projectId);
  if (!project) return { error: "Projeto não encontrado." };

  const db = getDb();
  const [row] = await db
    .select({ id: deployments.id, status: deployments.status })
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, project.id),
        eq(deployments.orgId, user.orgId),
        eq(deployments.type, "web_app"),
      ),
    )
    .limit(1);
  if (!row || row.status !== "published") {
    return { error: "Este Web App não está publicado." };
  }

  await db
    .update(deployments)
    .set({ status: "draft", publicSlug: null })
    .where(eq(deployments.id, row.id));

  const meta = requestMeta(await headers());
  await logAudit({
    action: "deployment.unpublish",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "deployment",
    resourceId: row.id,
    metadata: { projectId: project.id, type: "web_app" },
    ...meta,
  });

  return {};
}

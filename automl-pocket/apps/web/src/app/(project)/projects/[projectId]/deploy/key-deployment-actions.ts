import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { getDb } from "@/db";
import { deployments } from "@/db/schema";
import {
  REVOKED_KEY_VALUES,
  hasAnyKey,
  rotateKeyValues,
} from "@/lib/api-key-rotation";
import { generateApiKey } from "@/lib/api-keys";
import { logAudit, requestMeta } from "@/lib/audit";
import { findProjectScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

import { loadDeployContext } from "./context";

/**
 * Lógica compartilhada das server actions dos deployments autenticados por
 * chave (API na US-046, MCP na US-047): mesma mecânica de salvar campos,
 * publicar com chave nova, rotacionar/revogar chave (US-038) e despublicar —
 * muda só o type e as mensagens. As actions em api/actions.ts e
 * mcp/actions.ts são wrappers.
 */

export type KeyDeploymentType = "api" | "mcp";

export type KeyDeploymentInput = {
  /** Nomes das features selecionadas para o schema do endpoint */
  fields: string[];
  /**
   * Nome do deployment (US-047: título do servidor/tool no cliente MCP).
   * Ausente mantém o comportamento antigo: nome do projeto no insert e
   * título existente preservado no update.
   */
  title?: string;
  /**
   * Descrição curta do deployment, injetada nas instructions/descrições do
   * servidor MCP. Ausente = não mexer; string vazia = limpar.
   */
  description?: string;
};

const MESSAGES: Record<
  KeyDeploymentType,
  {
    rotateNotPublished: string;
    revokeNotPublished: string;
    notPublished: string;
  }
> = {
  api: {
    rotateNotPublished: "Publique a API antes de rotacionar a chave.",
    revokeNotPublished: "Publique a API antes de revogar a chave.",
    notPublished: "Esta API não está publicada.",
  },
  mcp: {
    rotateNotPublished: "Publique o endpoint MCP antes de rotacionar a chave.",
    revokeNotPublished: "Publique o endpoint MCP antes de revogar a chave.",
    notPublished: "Este endpoint MCP não está publicado.",
  },
};

/** Deployment publicado sem chave atual nem anterior (já revogado). */
const NO_KEY_TO_REVOKE_MESSAGE =
  "Não há chave ativa para revogar. Gere uma nova chave para reativar o endpoint.";

/** Resposta de rotate/regenerate: a chave em claro aparece só aqui. */
export type RotateKeyResult = {
  apiKey: string;
  apiKeyPrefix: string;
  /** ISO da expiração da chave anterior; null quando não havia chave (revogada). */
  previousKeyExpiresAt: string | null;
};

const fieldsSchema = z.array(z.string().max(300)).max(500);

const titleSchema = z.string().trim().min(1).max(80);
const descriptionSchema = z.string().trim().max(280);

/** Valida a descrição opcional; undefined = não mexer, vazia = limpar. */
function parseDescription(
  input: KeyDeploymentInput,
): { error: string } | { description: string | null | undefined } {
  if (input.description === undefined) return { description: undefined };
  const parsed = descriptionSchema.safeParse(input.description);
  if (!parsed.success) {
    return { error: "A descrição deve ter no máximo 280 caracteres." };
  }
  return { description: parsed.data === "" ? null : parsed.data };
}

/** Valida o nome opcional do deployment; undefined = não mexer no título. */
function parseTitle(
  input: KeyDeploymentInput,
): { error: string } | { title: string | undefined } {
  if (input.title === undefined) return { title: undefined };
  const parsed = titleSchema.safeParse(input.title);
  if (!parsed.success) {
    return { error: "O nome deve ter entre 1 e 80 caracteres." };
  }
  return { title: parsed.data };
}

/**
 * Valida os campos enviados: filtrados contra as features do modelo e
 * reordenados na ordem original das colunas.
 */
function parseFields(
  input: KeyDeploymentInput,
  modelFieldNames: string[],
): { error: string } | { fields: string[] } {
  const parsed = fieldsSchema.safeParse(input.fields);
  if (!parsed.success) {
    return { error: "Configuração inválida." };
  }
  const selected = new Set(parsed.data);
  const fields = modelFieldNames.filter((name) => selected.has(name));
  if (fields.length === 0) {
    return { error: "Selecione pelo menos um campo do modelo." };
  }
  return { fields };
}

/**
 * Salva a seleção de campos (draft ou publicado) sem mudar o status.
 * Com o deployment publicado, o endpoint reflete imediatamente.
 */
export async function saveKeyDeployment(
  type: KeyDeploymentType,
  projectId: string,
  input: KeyDeploymentInput,
): Promise<{ error?: string }> {
  const ctx = await loadDeployContext(projectId);
  if (!ctx.ok) return { error: ctx.error };

  const parsed = parseFields(
    input,
    ctx.modelFields.map((field) => field.name),
  );
  if ("error" in parsed) return parsed;
  const parsedTitle = parseTitle(input);
  if ("error" in parsedTitle) return parsedTitle;
  const parsedDescription = parseDescription(input);
  if ("error" in parsedDescription) return parsedDescription;

  const [row] = await getDb()
    .insert(deployments)
    .values({
      orgId: ctx.user.orgId,
      projectId: ctx.project.id,
      modelId: ctx.model.id,
      type,
      status: "draft",
      title: parsedTitle.title ?? ctx.project.name,
      description: parsedDescription.description ?? null,
      fields: parsed.fields,
    })
    .onConflictDoUpdate({
      target: [deployments.projectId, deployments.type],
      set: {
        fields: parsed.fields,
        modelId: ctx.model.id,
        updatedAt: new Date(),
        ...(parsedTitle.title !== undefined
          ? { title: parsedTitle.title }
          : {}),
        ...(parsedDescription.description !== undefined
          ? { description: parsedDescription.description }
          : {}),
      },
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
      type,
      fieldCount: parsed.fields.length,
    },
    ...meta,
  });

  return {};
}

/**
 * Publica o deployment: salva os campos, gera uma chave NOVA e marca como
 * published. A chave em claro só existe nesta resposta — o banco guarda
 * hash + prefixo.
 */
export async function publishKeyDeployment(
  type: KeyDeploymentType,
  projectId: string,
  input: KeyDeploymentInput,
): Promise<{ error: string } | { apiKey: string; apiKeyPrefix: string }> {
  const ctx = await loadDeployContext(projectId);
  if (!ctx.ok) return { error: ctx.error };

  const parsed = parseFields(
    input,
    ctx.modelFields.map((field) => field.name),
  );
  if ("error" in parsed) return parsed;
  const parsedTitle = parseTitle(input);
  if ("error" in parsedTitle) return parsedTitle;
  const parsedDescription = parseDescription(input);
  if ("error" in parsedDescription) return parsedDescription;

  const generated = generateApiKey();
  const [row] = await getDb()
    .insert(deployments)
    .values({
      orgId: ctx.user.orgId,
      projectId: ctx.project.id,
      modelId: ctx.model.id,
      type,
      status: "published",
      title: parsedTitle.title ?? ctx.project.name,
      description: parsedDescription.description ?? null,
      fields: parsed.fields,
      apiKeyHash: generated.hash,
      apiKeyPrefix: generated.prefix,
    })
    .onConflictDoUpdate({
      target: [deployments.projectId, deployments.type],
      set: {
        fields: parsed.fields,
        modelId: ctx.model.id,
        status: "published",
        apiKeyHash: generated.hash,
        apiKeyPrefix: generated.prefix,
        // Publicar de novo não é rotação: a chave anterior morre na hora
        previousApiKeyHash: null,
        previousKeyExpiresAt: null,
        updatedAt: new Date(),
        ...(parsedTitle.title !== undefined
          ? { title: parsedTitle.title }
          : {}),
        ...(parsedDescription.description !== undefined
          ? { description: parsedDescription.description }
          : {}),
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
      type,
      fieldCount: parsed.fields.length,
      apiKeyPrefix: generated.prefix,
    },
    ...meta,
  });

  return { apiKey: generated.key, apiKeyPrefix: generated.prefix };
}

/** Busca o deployment do tipo no projeto, escopado por org. */
async function findKeyDeployment(
  type: KeyDeploymentType,
  userOrgId: string,
  projectId: string,
) {
  const [row] = await getDb()
    .select({
      id: deployments.id,
      status: deployments.status,
      apiKeyHash: deployments.apiKeyHash,
      apiKeyPrefix: deployments.apiKeyPrefix,
      previousApiKeyHash: deployments.previousApiKeyHash,
    })
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, projectId),
        eq(deployments.orgId, userOrgId),
        eq(deployments.type, type),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Rotaciona a chave do deployment publicado (US-038): gera uma chave nova e
 * mantém a atual válida por 24 h como "chave anterior", para a integração
 * trocar sem janela de indisponibilidade. Num deployment revogado (sem
 * chave) simplesmente gera a nova — é o caminho de "reativar". A nova é
 * exibida uma única vez, como no publish.
 */
export async function rotateKeyDeployment(
  type: KeyDeploymentType,
  projectId: string,
): Promise<{ error: string } | RotateKeyResult> {
  const { user } = await requireSession();

  const project = await findProjectScoped(user, projectId);
  if (!project) return { error: "Projeto não encontrado." };

  const row = await findKeyDeployment(type, user.orgId, project.id);
  if (!row || row.status !== "published") {
    return { error: MESSAGES[type].rotateNotPublished };
  }

  const generated = generateApiKey();
  const values = rotateKeyValues(row, generated);
  await getDb()
    .update(deployments)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(deployments.id, row.id));

  const previousKeyExpiresAt =
    values.previousKeyExpiresAt?.toISOString() ?? null;
  const meta = requestMeta(await headers());
  await logAudit({
    action: "deployment.rotate_key",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "deployment",
    resourceId: row.id,
    metadata: {
      projectId: project.id,
      projectName: project.name,
      type,
      apiKeyPrefix: generated.prefix,
      // Prefixo da chave que entrou em graça (null = reativação após revogar)
      previousApiKeyPrefix: values.previousApiKeyHash ? row.apiKeyPrefix : null,
      previousKeyExpiresAt,
    },
    ...meta,
  });

  return {
    apiKey: generated.key,
    apiKeyPrefix: generated.prefix,
    previousKeyExpiresAt,
  };
}

/**
 * Compat: "regenerar" agora É rotacionar (a chave antiga ganha 24 h de graça
 * em vez de morrer na hora). Mantido para a UI atual; a US-039 troca o nome.
 */
export async function regenerateKeyDeployment(
  type: KeyDeploymentType,
  projectId: string,
): Promise<{ error: string } | RotateKeyResult> {
  return rotateKeyDeployment(type, projectId);
}

/**
 * Revoga na hora a chave atual E a anterior (US-038): o deployment continua
 * publicado, mas nenhuma chamada autentica até `rotateKeyDeployment` gerar
 * uma chave nova. É o botão de emergência para chave vazada.
 */
export async function revokeKeyDeployment(
  type: KeyDeploymentType,
  projectId: string,
): Promise<{ error?: string }> {
  const { user } = await requireSession();

  const project = await findProjectScoped(user, projectId);
  if (!project) return { error: "Projeto não encontrado." };

  const row = await findKeyDeployment(type, user.orgId, project.id);
  if (!row || row.status !== "published") {
    return { error: MESSAGES[type].revokeNotPublished };
  }
  if (!hasAnyKey(row)) return { error: NO_KEY_TO_REVOKE_MESSAGE };

  await getDb()
    .update(deployments)
    .set({ ...REVOKED_KEY_VALUES, updatedAt: new Date() })
    .where(eq(deployments.id, row.id));

  const meta = requestMeta(await headers());
  await logAudit({
    action: "deployment.revoke_key",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "deployment",
    resourceId: row.id,
    metadata: {
      projectId: project.id,
      projectName: project.name,
      type,
      apiKeyPrefix: row.apiKeyPrefix,
      hadPreviousKey: row.previousApiKeyHash !== null,
    },
    ...meta,
  });

  return {};
}

/** Despublica: volta a draft e remove as chaves (atual e anterior morrem). */
export async function unpublishKeyDeployment(
  type: KeyDeploymentType,
  projectId: string,
): Promise<{ error?: string }> {
  const { user } = await requireSession();

  // Sem exigir modelo publicável: despublicar deve funcionar mesmo se o
  // projeto foi retreinado como forecasting depois da publicação
  const project = await findProjectScoped(user, projectId);
  if (!project) return { error: "Projeto não encontrado." };

  const row = await findKeyDeployment(type, user.orgId, project.id);
  if (!row || row.status !== "published") {
    return { error: MESSAGES[type].notPublished };
  }

  await getDb()
    .update(deployments)
    .set({ status: "draft", ...REVOKED_KEY_VALUES })
    .where(eq(deployments.id, row.id));

  const meta = requestMeta(await headers());
  await logAudit({
    action: "deployment.unpublish",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "deployment",
    resourceId: row.id,
    metadata: { projectId: project.id, type },
    ...meta,
  });

  return {};
}

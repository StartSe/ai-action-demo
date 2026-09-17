import { and, eq, or } from "drizzle-orm";

import { getDb } from "@/db";
import { deployments, models, projects } from "@/db/schema";
import { getModelDeployFields } from "@/app/(project)/projects/[projectId]/deploy/fields";
import { matchApiKeyHash } from "@/lib/api-key-rotation";
import type { ApiPredictTarget } from "@/lib/api-predict";
import type { McpPredictTarget } from "@/lib/mcp-predict";
import type { DeploymentFormField } from "@/components/deployment-form";

// Slug base64url gerado com ≥16 chars; rejeita qualquer outra coisa antes do banco
const SLUG_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export type PublishedWebApp = {
  deployment: typeof deployments.$inferSelect;
  model: typeof models.$inferSelect;
  /** Nome do projeto dono do deployment — vai na metadata durável de auditoria */
  projectName: string;
  /** Campos selecionados na configuração, na ordem das colunas do modelo */
  formFields: DeploymentFormField[];
};

/**
 * Resolve o Web App publicado a partir do slug secreto da URL pública.
 *
 * Retorna null para slug inválido, deployment inexistente/despublicado ou
 * modelo não publicável — a página e a server action tratam como 404/erro,
 * sem revelar qual dos casos aconteceu.
 */
export async function findPublishedWebAppBySlug(
  slug: string,
): Promise<PublishedWebApp | null> {
  if (!SLUG_PATTERN.test(slug)) return null;

  const db = getDb();
  const [found] = await db
    .select({ deployment: deployments, projectName: projects.name })
    .from(deployments)
    .innerJoin(projects, eq(projects.id, deployments.projectId))
    .where(
      and(
        eq(deployments.publicSlug, slug),
        eq(deployments.status, "published"),
        eq(deployments.type, "web_app"),
      ),
    )
    .limit(1);
  if (!found) return null;
  const { deployment, projectName } = found;

  const [model] = await db
    .select()
    .from(models)
    .where(eq(models.id, deployment.modelId))
    .limit(1);
  if (!model || model.problemType === "forecasting") return null;

  const modelFields = await getModelDeployFields(model);
  const selected = new Set(deployment.fields);
  const formFields = modelFields.filter((field) => selected.has(field.name));
  if (formFields.length === 0) return null;

  return { deployment, model, projectName, formFields };
}

// SHA-256 hex — qualquer outra coisa nem chega ao banco
const KEY_HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Condição de lookup pela chave (US-038): casa o hash atual OU o anterior. A
 * graça de 24 h da chave anterior é decidida em TS por `matchApiKeyHash` (uma
 * única fonte da regra, testada sem banco) — o SQL só traz o candidato.
 */
function keyHashCondition(keyHash: string) {
  return or(
    eq(deployments.apiKeyHash, keyHash),
    eq(deployments.previousApiKeyHash, keyHash),
  );
}

/**
 * Resolve o deployment de API publicado pelo SHA-256 da chave apresentada
 * (US-046). Retorna null para hash desconhecido, deployment despublicado ou
 * modelo não publicável — o endpoint responde 401 sem distinguir os casos.
 */
export async function findPublishedApiDeploymentByKeyHash(
  keyHash: string,
): Promise<ApiPredictTarget | null> {
  if (!KEY_HASH_PATTERN.test(keyHash)) return null;

  const db = getDb();
  const [deployment] = await db
    .select({
      id: deployments.id,
      orgId: deployments.orgId,
      projectId: deployments.projectId,
      projectName: projects.name,
      modelId: deployments.modelId,
      apiKeyHash: deployments.apiKeyHash,
      previousApiKeyHash: deployments.previousApiKeyHash,
      previousKeyExpiresAt: deployments.previousKeyExpiresAt,
    })
    .from(deployments)
    .innerJoin(projects, eq(projects.id, deployments.projectId))
    .where(
      and(
        keyHashCondition(keyHash),
        eq(deployments.status, "published"),
        eq(deployments.type, "api"),
      ),
    )
    .limit(1);
  // Chave anterior fora da graça (ou deployment revogado): mesmo null do 401
  if (!deployment || !matchApiKeyHash(deployment, keyHash)) return null;

  const [model] = await db
    .select({ id: models.id, problemType: models.problemType })
    .from(models)
    .where(eq(models.id, deployment.modelId))
    .limit(1);
  if (!model || model.problemType === "forecasting") return null;

  return {
    deploymentId: deployment.id,
    orgId: deployment.orgId,
    projectId: deployment.projectId,
    projectName: deployment.projectName,
    modelId: deployment.modelId,
  };
}

/**
 * Resolve o deployment MCP publicado pelo SHA-256 da chave apresentada
 * (US-047), com os campos selecionados que viram o input schema da tool
 * predict. Retorna null para hash desconhecido, deployment despublicado ou
 * modelo não publicável — o endpoint responde 401 sem distinguir os casos.
 */
export async function findPublishedMcpDeploymentByKeyHash(
  keyHash: string,
): Promise<McpPredictTarget | null> {
  if (!KEY_HASH_PATTERN.test(keyHash)) return null;

  const db = getDb();
  const [found] = await db
    .select({ deployment: deployments, projectName: projects.name })
    .from(deployments)
    .innerJoin(projects, eq(projects.id, deployments.projectId))
    .where(
      and(
        keyHashCondition(keyHash),
        eq(deployments.status, "published"),
        eq(deployments.type, "mcp"),
      ),
    )
    .limit(1);
  if (!found) return null;
  const { deployment, projectName } = found;
  // Chave anterior fora da graça (ou deployment revogado): mesmo null do 401
  if (!matchApiKeyHash(deployment, keyHash)) return null;

  const [model] = await db
    .select()
    .from(models)
    .where(eq(models.id, deployment.modelId))
    .limit(1);
  if (!model || model.problemType === "forecasting") return null;

  const modelFields = await getModelDeployFields(model);
  const selected = new Set(deployment.fields);
  const formFields = modelFields.filter((field) => selected.has(field.name));
  if (formFields.length === 0) return null;

  return {
    deploymentId: deployment.id,
    orgId: deployment.orgId,
    projectId: deployment.projectId,
    projectName,
    modelId: deployment.modelId,
    title: deployment.title,
    target: model.target,
    description: deployment.description ?? null,
    metrics: model.metrics ?? null,
    problemType: model.problemType,
    formFields,
  };
}

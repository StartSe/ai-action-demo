import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { datasets, models, projects, trainingJobs } from "@/db/schema";
import { logAudit, requestMeta, type AuditEntry } from "@/lib/audit";

/** Usuário autenticado dono da requisição (vem de requireSession/getSession). */
export type Viewer = { id: string; orgId: string };

type RequestMetaInfo = { ip: string | null; userAgent: string | null };

type ScopedResourceType = "project" | "dataset" | "model" | "training_job";

export type ScopedLookupOptions<T> = {
  viewer: Viewer;
  resourceType: ScopedResourceType;
  resourceId: string;
  /** Busca escopada: recebe SEMPRE o orgId da sessão, nunca um orgId externo. */
  lookup: (orgId: string) => Promise<T | undefined>;
  /**
   * Audita a negação como "authz.denied". Desligar apenas quando um layout pai
   * já audita o mesmo recurso, ou quando o id não veio de input do usuário.
   */
  auditDenied?: boolean;
  /** Injetáveis para teste — em produção usam logAudit e os headers da request. */
  audit?: (entry: AuditEntry) => Promise<void>;
  meta?: RequestMetaInfo;
};

const uuidSchema = z.uuid();

/**
 * Núcleo do controle de acesso por organização: toda busca de recurso passa
 * por aqui com o org_id da sessão injetado. Recurso inexistente ou de outra
 * org resulta em null (a rota responde 404) e a tentativa é auditada.
 */
export async function scopedLookup<T>(
  options: ScopedLookupOptions<T>,
): Promise<T | null> {
  const {
    viewer,
    resourceType,
    resourceId,
    lookup,
    auditDenied = true,
    audit = logAudit,
  } = options;

  // Id malformado nunca chega ao banco (uuid inválido viraria erro de cast)
  const validId = uuidSchema.safeParse(resourceId).success;
  const row = validId ? await lookup(viewer.orgId) : undefined;
  if (row !== undefined) return row;

  if (auditDenied) {
    const meta = options.meta ?? (await requestMetaFromContext());
    await audit({
      action: "authz.denied",
      orgId: viewer.orgId,
      userId: viewer.id,
      resourceType,
      resourceId: validId ? resourceId : null,
      metadata: validId
        ? null
        : { invalidId: String(resourceId).slice(0, 100) },
      ...meta,
    });
  }
  return null;
}

/** IP/user-agent da request atual; fora de um request scope devolve nulos. */
async function requestMetaFromContext(): Promise<RequestMetaInfo> {
  try {
    // Import dinâmico: mantém o módulo importável fora do runtime do Next (vitest)
    const { headers } = await import("next/headers");
    return requestMeta(await headers());
  } catch {
    return { ip: null, userAgent: null };
  }
}

type FinderOptions = { auditDenied?: boolean; meta?: RequestMetaInfo };

/** Projeto por id, sempre restrito à org da sessão. */
export async function findProjectScoped(
  viewer: Viewer,
  projectId: string,
  options?: FinderOptions,
) {
  return scopedLookup({
    viewer,
    resourceType: "project",
    resourceId: projectId,
    ...options,
    lookup: async (orgId) => {
      const [row] = await getDb()
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
        .limit(1);
      return row;
    },
  });
}

/** Dataset por id, sempre restrito à org da sessão. */
export async function findDatasetScoped(
  viewer: Viewer,
  datasetId: string,
  options?: FinderOptions,
) {
  return scopedLookup({
    viewer,
    resourceType: "dataset",
    resourceId: datasetId,
    ...options,
    lookup: async (orgId) => {
      const [row] = await getDb()
        .select()
        .from(datasets)
        .where(and(eq(datasets.id, datasetId), eq(datasets.orgId, orgId)))
        .limit(1);
      return row;
    },
  });
}

/** Modelo mais recente do projeto, sempre restrito à org da sessão. */
export async function findLatestModelScoped(
  viewer: Viewer,
  projectId: string,
  options?: FinderOptions,
) {
  return scopedLookup({
    viewer,
    resourceType: "model",
    resourceId: projectId,
    ...options,
    lookup: async (orgId) => {
      const [row] = await getDb()
        .select()
        .from(models)
        .where(and(eq(models.projectId, projectId), eq(models.orgId, orgId)))
        .orderBy(desc(models.createdAt))
        .limit(1);
      return row;
    },
  });
}

/** Training job por id (e projeto), sempre restrito à org da sessão. */
export async function findTrainingJobScoped(
  viewer: Viewer,
  jobId: string,
  projectId: string,
  options?: FinderOptions,
) {
  return scopedLookup({
    viewer,
    resourceType: "training_job",
    resourceId: jobId,
    ...options,
    lookup: async (orgId) => {
      const [row] = await getDb()
        .select()
        .from(trainingJobs)
        .where(
          and(
            eq(trainingJobs.id, jobId),
            eq(trainingJobs.projectId, projectId),
            eq(trainingJobs.orgId, orgId),
          ),
        )
        .limit(1);
      return row;
    },
  });
}

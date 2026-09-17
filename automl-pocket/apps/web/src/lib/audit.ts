import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { scrubUrl } from "@/lib/scrub-url";

export type AuditEntry = {
  action: string;
  orgId?: string | null;
  userId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Grava um evento na trilha de auditoria. Nunca lança: uma falha ao auditar
 * não pode derrubar o fluxo principal (login, upload etc.).
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await getDb().insert(auditLogs).values({
      action: entry.action,
      orgId: entry.orgId ?? null,
      userId: entry.userId ?? null,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (error) {
    console.error("Falha ao gravar audit log:", entry.action, error);
  }
}

/**
 * Extrai IP e user-agent para auditoria. Aceita os Headers (`await headers()`
 * em server action) ou o próprio Request da rota. Nunca inclui a URL: quem
 * precisar dela em log usa `requestLogContext` (com o token removido).
 */
export function requestMeta(
  source: Headers | Request | undefined | null,
): {
  ip: string | null;
  userAgent: string | null;
} {
  if (!source) return { ip: null, userAgent: null };
  const headers = source instanceof Request ? source.headers : source;
  const forwarded = headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip") || null,
    userAgent: headers.get("user-agent"),
  };
}

/**
 * Contexto de um request para console.log/error nas rotas de API/MCP
 * (US-039). A URL passa por `scrubUrl`: o `?token=` do MCP é a chave do
 * deployment em claro e nunca pode ir para stdout/agregador de logs. Toda
 * rota que logar um request usa este helper em vez de `request.url`.
 */
export function requestLogContext(request: Request): {
  method: string;
  url: string;
  ip: string | null;
} {
  return {
    method: request.method,
    url: scrubUrl(request.url),
    ip: requestMeta(request).ip,
  };
}

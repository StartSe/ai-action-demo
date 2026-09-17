/**
 * Origem canônica do app (scheme + host + porta), derivada de BETTER_AUTH_URL —
 * o mesmo valor que o Better Auth usa como baseURL. Módulo puro (sem banco,
 * sem Next) para ser importado tanto pela política das rotas internas
 * (`internal-api.ts`) quanto pelo endpoint MCP (`mcp-predict.ts`).
 */

/** Null se BETTER_AUTH_URL estiver ausente ou não for uma URL válida. */
export function appOrigin(
  baseUrl: string | undefined = process.env.BETTER_AUTH_URL,
): string | null {
  const raw = (baseUrl ?? "").trim();
  if (raw === "") return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Origem normalizada de um header Origin, ou null se não for URL ("null", lixo). */
export function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Um header Origin bate com a origem esperada? `Origin: null` (sandbox,
 * file://, redirect cross-origin) e valores inválidos nunca batem. Sem origem
 * esperada (BETTER_AUTH_URL ausente) também não há como aceitar.
 */
export function originMatches(
  origin: string,
  expectedOrigin: string | null,
): boolean {
  if (expectedOrigin === null) return false;
  return normalizeOrigin(origin) === expectedOrigin;
}

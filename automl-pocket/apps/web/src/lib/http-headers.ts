/**
 * Cabeçalhos HTTP compartilhados pelas rotas de API.
 *
 * Respostas de API carregam dados por usuário/chave (predições, linhas de
 * dataset, chat) e nunca devem parar em cache compartilhado (CDN, proxy) nem
 * no cache do navegador — por isso todas saem com Cache-Control: no-store.
 */

export const CACHE_CONTROL_NO_STORE = "no-store";

/**
 * Variante para respostas em streaming (SSE): além de não armazenar, pede aos
 * proxies que não recodifiquem/bufferizem o corpo (no-transform).
 */
export const CACHE_CONTROL_NO_STORE_STREAM = "no-store, no-transform";

/** Objeto pronto para espalhar em `headers` de `Response.json`/`NextResponse`. */
export const NO_STORE_HEADERS = {
  "Cache-Control": CACHE_CONTROL_NO_STORE,
} as const;

function hasNoStore(value: string | null): boolean {
  if (!value) return false;
  return value
    .split(",")
    .some((directive) => directive.trim().toLowerCase() === "no-store");
}

/**
 * Garante Cache-Control: no-store na resposta (mutação in place, devolve a
 * mesma instância). Um Cache-Control que já contenha a diretiva no-store
 * (ex.: "no-store, no-transform" do SSE) é preservado.
 */
export function withNoStore<T extends Response>(response: T): T {
  if (!hasNoStore(response.headers.get("Cache-Control"))) {
    response.headers.set("Cache-Control", CACHE_CONTROL_NO_STORE);
  }
  return response;
}

/**
 * Descontinuação dos canais de chave fora do header (US-039): `api_key` no
 * body de /api/v1/predict e `?token=` na URL de /api/mcp continuam
 * funcionando, mas a resposta avisa via RFC 9745 (Deprecation) — status e
 * corpo não mudam. Sem página de documentação própria (Pocket US-006), não há
 * mais `Link rel="deprecation"`.
 */
const DEPRECATION_HEADER_VALUE = "true";

/** Marca a resposta como uso de canal descontinuado (mutação in place). */
export function withDeprecation<T extends Response>(response: T): T {
  response.headers.set("Deprecation", DEPRECATION_HEADER_VALUE);
  return response;
}

/**
 * Higiene de resposta das rotas públicas de API/MCP (US-040): o navegador não
 * pode "adivinhar" outro tipo de conteúdo a partir do corpo (nosniff).
 */
const X_CONTENT_TYPE_OPTIONS_NOSNIFF = "nosniff";

/** Garante X-Content-Type-Options: nosniff (mutação in place). */
export function withNoSniff<T extends Response>(response: T): T {
  response.headers.set(
    "X-Content-Type-Options",
    X_CONTENT_TYPE_OPTIONS_NOSNIFF,
  );
  return response;
}

/**
 * Conjunto obrigatório em TODA resposta de `/api/v1/*` e `/api/mcp` (200,
 * 4xx, 5xx, 405): Cache-Control: no-store + X-Content-Type-Options: nosniff.
 * Idempotente — pode ser aplicado no handler e de novo na rota.
 */
export function withPublicApiHeaders<T extends Response>(response: T): T {
  return withNoSniff(withNoStore(response));
}

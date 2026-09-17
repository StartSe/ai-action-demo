/**
 * Higiene de URL para logs (US-039): o endpoint MCP aceita a chave do
 * deployment em `?token=` (compat para clientes só com campo de URL), então
 * qualquer URL de request que vá para console/auditoria precisa perder esse
 * parâmetro antes — senão a chave em claro para em stdout, no agregador de
 * logs e em quem mais lê o log.
 *
 * Client-safe (sem imports de servidor).
 */

/** Query params que carregam segredo e nunca podem aparecer em log. */
export const SENSITIVE_QUERY_PARAMS = ["token"] as const;

const SENSITIVE_SET: ReadonlySet<string> = new Set(SENSITIVE_QUERY_PARAMS);

// Base fictícia só para o parser aceitar URLs relativas ("/api/mcp?token=x")
const RELATIVE_BASE = "http://scrub.invalid";

/**
 * Remove os parâmetros sensíveis da query string. Aceita URL absoluta ou
 * relativa (devolve no mesmo formato) e nunca lança: entrada que o parser
 * rejeita passa por um fallback textual que apaga `token=...`.
 */
export function scrubUrl(input: string | URL): string {
  const raw = input instanceof URL ? input.href : input;
  let url: URL;
  let relative = false;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(raw, RELATIVE_BASE);
      relative = true;
    } catch {
      return scrubUrlText(raw);
    }
  }

  let changed = false;
  for (const name of [...url.searchParams.keys()]) {
    if (SENSITIVE_SET.has(name)) {
      url.searchParams.delete(name);
      changed = true;
    }
  }
  // Sem parâmetro sensível devolve o texto original intacto (sem renormalizar)
  if (!changed) return raw;

  if (relative) return `${url.pathname}${url.search}${url.hash}`;
  return url.href;
}

/** Fallback sem parser: apaga `token=valor` e o separador que sobrou. */
function scrubUrlText(raw: string): string {
  let out = raw;
  for (const name of SENSITIVE_QUERY_PARAMS) {
    out = out.replace(new RegExp(`([?&])${name}=[^&#]*&?`, "g"), "$1");
  }
  return out.replace(/[?&]$/, "").replace(/[?&](?=#)/, "");
}

import { NextResponse } from "next/server";

import { apiKeyPrefix } from "@/lib/api-keys";
import { logAudit, requestMeta } from "@/lib/audit";
import { hitRateLimit, type RateLimitStore } from "@/lib/rate-limit";
import { API_AUTH_FAIL_RATE_LIMIT } from "@/lib/rate-limit-policy";

/**
 * Falhas de autenticação da API pública (/api/v1/predict) e do MCP (/api/mcp)
 * — US-021 da prática. Objetivo: enxergar tentativas de adivinhar chaves
 * antes de bloqueá-las.
 *
 * Toda resposta 401 grava `api.auth_failed` na trilha de auditoria com
 * { channel, keyPrefix, ip } (keyPrefix = 8 primeiros chars da chave tentada,
 * o mesmo tamanho de deployments.api_key_prefix — dá para cruzar com uma
 * chave real revogada/despublicada sem nunca gravar a chave inteira).
 *
 * Em seguida conta a falha por IP (API_AUTH_FAIL_RATE_LIMIT, só em 401) e,
 * ao estourar, grava `api.auth_bruteforce_suspected`. API_AUTH_FAIL_MODE:
 * - report:  (default) o 401 segue normalmente — só a auditoria denuncia.
 * - enforce: responde 429 com Retry-After no lugar do 401.
 *
 * Sem IP identificável (dev/local sem proxy) não há contagem — fail-open,
 * como o próprio hitRateLimit com Redis fora do ar.
 */
const API_AUTH_FAIL_MODES = ["report", "enforce"] as const;
export type ApiAuthFailMode = (typeof API_AUTH_FAIL_MODES)[number];

const DEFAULT_API_AUTH_FAIL_MODE: ApiAuthFailMode = "report";

/** Canal da falha: API pública ou servidor MCP. */
type ApiAuthChannel = "api" | "mcp";

/** Evento gravado em toda resposta 401. */
export const AUTH_FAILED_ACTION = "api.auth_failed";
/** Evento gravado quando um IP passa do limite de falhas na janela. */
export const AUTH_BRUTEFORCE_ACTION = "api.auth_bruteforce_suspected";

let warnedInvalidMode = false;

/** Só para testes: zera o aviso único de modo inválido. */
export function resetApiAuthFailWarnings(): void {
  warnedInvalidMode = false;
}

/** API_AUTH_FAIL_MODE (default "report"; valor desconhecido avisa uma vez e vale "report"). */
export function apiAuthFailMode(): ApiAuthFailMode {
  const raw = (process.env.API_AUTH_FAIL_MODE ?? "").trim().toLowerCase();
  if (raw === "") return DEFAULT_API_AUTH_FAIL_MODE;
  if ((API_AUTH_FAIL_MODES as readonly string[]).includes(raw)) {
    return raw as ApiAuthFailMode;
  }
  if (!warnedInvalidMode) {
    warnedInvalidMode = true;
    console.warn(
      `API_AUTH_FAIL_MODE="${raw}" inválido (esperado report|enforce); usando "${DEFAULT_API_AUTH_FAIL_MODE}".`,
    );
  }
  return DEFAULT_API_AUTH_FAIL_MODE;
}

/**
 * Prefixo identificador da chave tentada (`apiKeyPrefix`: `dos_live_` + 4
 * chars nas chaves novas, 8 chars nas antigas), ou null quando nenhuma chave
 * chegou. A chave inteira nunca é gravada.
 */
export function attemptedKeyPrefix(
  key: string | null | undefined,
): string | null {
  const trimmed = key?.trim() ?? "";
  return trimmed === "" ? null : apiKeyPrefix(trimmed);
}

export type ApiAuthFailureParams = {
  channel: ApiAuthChannel;
  /** Chave que o cliente tentou (em claro; só o prefixo é gravado) ou null. */
  attemptedKey: string | null;
  /** Headers da requisição — IP via x-forwarded-for/x-real-ip (requestMeta). */
  headers: Headers | null | undefined;
  mode?: ApiAuthFailMode;
  store?: RateLimitStore;
  audit?: typeof logAudit;
};

/**
 * Registra uma falha de autenticação (chamar em TODO caminho que responderia
 * 401) e aplica o limite por IP. Devolve a resposta 429 pronta (só em enforce,
 * ao estourar) ou null — nesse caso o chamador responde o 401 normal.
 */
export async function recordApiAuthFailure(
  params: ApiAuthFailureParams,
): Promise<NextResponse | null> {
  const { channel, attemptedKey, headers, store, audit = logAudit } = params;
  const mode = params.mode ?? apiAuthFailMode();
  const { ip, userAgent } = requestMeta(headers);
  const keyPrefix = attemptedKeyPrefix(attemptedKey);

  await audit({
    action: AUTH_FAILED_ACTION,
    ip,
    userAgent,
    metadata: { channel, keyPrefix, ip },
  });

  // Sem IP não há como contar por origem: só a auditoria acima vale
  if (!ip) return null;

  const hit = await hitRateLimit(`api-auth-fail:${ip}`, {
    ...API_AUTH_FAIL_RATE_LIMIT,
    store,
  });
  if (!hit.limited) return null;

  await audit({
    action: AUTH_BRUTEFORCE_ACTION,
    ip,
    userAgent,
    metadata: {
      channel,
      keyPrefix,
      ip,
      count: hit.count,
      limit: API_AUTH_FAIL_RATE_LIMIT.limit,
      windowSec: API_AUTH_FAIL_RATE_LIMIT.windowSec,
      mode,
    },
  });

  if (mode === "report") return null;

  return NextResponse.json(
    {
      error: `Muitas tentativas de autenticação a partir deste endereço. Tente novamente em ${hit.retryAfterSec} segundos.`,
    },
    {
      status: 429,
      headers: { "Retry-After": String(hit.retryAfterSec) },
    },
  );
}

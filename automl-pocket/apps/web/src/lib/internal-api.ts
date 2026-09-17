import { NextResponse } from "next/server";

import { appOrigin, normalizeOrigin } from "@/lib/app-origin";
import { logAudit, requestMeta, type AuditEntry } from "@/lib/audit";

/**
 * Política de origem das rotas internas (as que o próprio app consome com a
 * sessão do usuário: upload, rows, download, batch dos web apps publicados).
 * Nenhuma delas deve ser lida ou disparada por outro
 * site — elas não são API pública. A API pública (`/api/v1/*`), o MCP
 * (`/api/mcp`) e o Better Auth (`/api/auth/*`) ficam FORA desta política.
 *
 * INTERNAL_ORIGIN_MODE:
 * - off:     ignora a origem.
 * - report:  (default) deixa passar, mas grava `authz.cross_origin` na trilha
 *            de auditoria com { path, origin } para medir antes de bloquear.
 * - enforce: responde 403 com mensagem em pt-BR.
 *
 * Detecção de cross-origin, em ordem:
 * 1. `Sec-Fetch-Site: cross-site` (navegadores modernos enviam sempre).
 * 2. `Origin` presente e diferente da origem de `BETTER_AUTH_URL`.
 * Sem nenhum dos dois (curl, same-origin, navegação direta) = mesma origem.
 */
const INTERNAL_ORIGIN_MODES = ["off", "report", "enforce"] as const;
export type InternalOriginMode = (typeof INTERNAL_ORIGIN_MODES)[number];

const DEFAULT_INTERNAL_ORIGIN_MODE: InternalOriginMode = "report";

/** Evento de auditoria gravado em report e enforce. */
export const CROSS_ORIGIN_ACTION = "authz.cross_origin";

export const CROSS_ORIGIN_MESSAGE =
  "Esta rota só aceita requisições feitas pelo próprio aplicativo.";

let warnedInvalidMode = false;

/** Só para testes: zera o aviso único de modo inválido. */
export function resetInternalOriginWarnings(): void {
  warnedInvalidMode = false;
}

/** INTERNAL_ORIGIN_MODE (default "report"; valor desconhecido avisa uma vez e vale "report"). */
export function internalOriginMode(): InternalOriginMode {
  const raw = (process.env.INTERNAL_ORIGIN_MODE ?? "").trim().toLowerCase();
  if (raw === "") return DEFAULT_INTERNAL_ORIGIN_MODE;
  if ((INTERNAL_ORIGIN_MODES as readonly string[]).includes(raw)) {
    return raw as InternalOriginMode;
  }
  if (!warnedInvalidMode) {
    warnedInvalidMode = true;
    console.warn(
      `INTERNAL_ORIGIN_MODE="${raw}" inválido (esperado off|report|enforce); usando "${DEFAULT_INTERNAL_ORIGIN_MODE}".`,
    );
  }
  return DEFAULT_INTERNAL_ORIGIN_MODE;
}

// `appOrigin` vive em app-origin.ts (puro) e é re-exportado aqui por compat.
export { appOrigin };

export type CrossOriginDetection = {
  crossOrigin: boolean;
  /** Valor bruto do header Origin (ou null) — vai para a auditoria. */
  origin: string | null;
  /** O que decidiu: header Sec-Fetch-Site, comparação de Origin, ou nada. */
  via: "sec-fetch-site" | "origin" | null;
};

/**
 * Decide se a requisição vem de outro site. Puro: não lê env além de
 * `expectedOrigin` (injetável nos testes).
 */
export function detectCrossOrigin(
  headers: Headers,
  expectedOrigin: string | null = appOrigin(),
): CrossOriginDetection {
  const origin = headers.get("origin");
  const site = (headers.get("sec-fetch-site") ?? "").trim().toLowerCase();

  if (site === "cross-site") {
    return { crossOrigin: true, origin, via: "sec-fetch-site" };
  }

  if (origin !== null && origin !== "" && expectedOrigin !== null) {
    const normalized = normalizeOrigin(origin);
    // Origin "null" (sandbox, file://, redirect cross-origin) ou inválido
    // conta como estranho: não é a origem do app.
    if (normalized === null || normalized !== expectedOrigin) {
      return { crossOrigin: true, origin, via: "origin" };
    }
  }

  return { crossOrigin: false, origin, via: null };
}

export type InternalApiPolicyOptions = {
  mode?: InternalOriginMode;
  expectedOrigin?: string | null;
  audit?: (entry: AuditEntry) => Promise<void>;
  /** Quem fez a requisição, quando já se sabe (enriquece o evento). */
  userId?: string | null;
  orgId?: string | null;
};

/**
 * Aplica a política de origem a uma rota interna. Chamar no início do handler:
 *
 *   const denied = await internalApiPolicy(request);
 *   if (denied) return denied;
 *
 * Devolve null para seguir (off, mesma origem, ou report) e a resposta 403
 * em enforce. Em report/enforce grava `authz.cross_origin` com { path, origin }.
 */
export async function internalApiPolicy(
  request: Request,
  options: InternalApiPolicyOptions = {},
): Promise<NextResponse | null> {
  const mode = options.mode ?? internalOriginMode();
  if (mode === "off") return null;

  const expectedOrigin =
    options.expectedOrigin === undefined ? appOrigin() : options.expectedOrigin;
  const detection = detectCrossOrigin(request.headers, expectedOrigin);
  if (!detection.crossOrigin) return null;

  const path = safePath(request.url);
  const audit = options.audit ?? logAudit;
  const meta = requestMeta(request.headers);
  await audit({
    action: CROSS_ORIGIN_ACTION,
    userId: options.userId ?? null,
    orgId: options.orgId ?? null,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: {
      path,
      origin: detection.origin,
      via: detection.via,
      mode,
      method: request.method,
    },
  });

  if (mode === "report") return null;

  return NextResponse.json(
    { error: CROSS_ORIGIN_MESSAGE },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Handler OPTIONS para rotas internas: responde 204 sem nenhum header
 * `Access-Control-*`, então o preflight de outro site falha no navegador.
 * Exportar em cada rota interna: `export const OPTIONS = optionsNoCors;`
 */
export function optionsNoCors(): Response {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

import { z } from "zod";

import { bearerKey, hashApiKey } from "@/lib/api-keys";
import { withDeprecation, withPublicApiHeaders } from "@/lib/http-headers";
import {
  PREDICTION_TIMEOUT_MESSAGE,
  type Prediction,
  type PredictionRow,
} from "@/lib/predictions";

/**
 * Lógica do endpoint público POST /api/v1/predict (US-046), com dependências
 * injetáveis para o teste de integração rodar sem banco/Redis/worker.
 * A rota em src/app/api/v1/predict/route.ts liga as dependências reais.
 *
 * Autenticação (US-030): `Authorization: Bearer <chave>` é o caminho
 * canônico; `api_key` no body continua aceito por compatibilidade e será
 * descontinuado. Quando o header vem, ele manda — um header inválido responde
 * 401 mesmo com api_key válido no body (nunca cai para o body).
 *
 * Toda resposta 401 passa por `deps.onAuthFailed` (US-021 da prática):
 * auditoria api.auth_failed + contagem por IP, que em API_AUTH_FAIL_MODE
 * enforce troca o 401 por 429. Chave inexistente e deployment despublicado
 * respondem o MESMO 401 — o cliente não descobre se a chave já existiu.
 *
 * Limites e higiene (US-040): body acima de 1 MB ou mais linhas do que
 * `API_PREDICT_MAX_ROWS` respondem 413 antes de qualquer autenticação; as
 * mensagens de erro são fixas (nunca ecoam valores das linhas nem stack) e
 * toda resposta sai com Cache-Control: no-store + X-Content-Type-Options:
 * nosniff (`withPublicApiHeaders`).
 */

/** Onde a chave veio na requisição — vai na metadata do evento api.predict. */
export type ApiKeyLocation = "header" | "body";

/**
 * Teto de linhas por chamada quando `API_PREDICT_MAX_ROWS` não está definido.
 * Derivado do maior `metadata.rows` de `api.predict` em `audit_logs` nos
 * últimos 30 dias, arredondado para cima na centena,
 * com mínimo de 500 — no banco local não havia chamadas, então vale o mínimo.
 * O caminho síncrono espera o worker até 30 s; lotes maiores usam o web app.
 */
export const DEFAULT_API_PREDICT_MAX_ROWS = 500;

/** Teto do corpo da requisição em bytes (1 MB), independente do nº de linhas. */
export const API_PREDICT_MAX_BODY_BYTES = 1_048_576;

let warnedInvalidMaxRows = false;

/** Só para testes: zera o aviso único de env inválida. */
export function resetApiPredictWarnings(): void {
  warnedInvalidMaxRows = false;
}

/**
 * Teto de linhas em vigor: `API_PREDICT_MAX_ROWS` (inteiro ≥ 1) ou o default.
 * Valor inválido avisa uma vez e cai no default — nunca zera o limite.
 */
export function apiPredictMaxRows(
  raw: string | undefined = process.env.API_PREDICT_MAX_ROWS,
): number {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return DEFAULT_API_PREDICT_MAX_ROWS;
  const parsed = Number(trimmed);
  if (Number.isInteger(parsed) && parsed >= 1) return parsed;
  if (!warnedInvalidMaxRows) {
    warnedInvalidMaxRows = true;
    console.warn(
      `API_PREDICT_MAX_ROWS="${trimmed}" inválido (esperado inteiro ≥ 1); usando ${DEFAULT_API_PREDICT_MAX_ROWS}.`,
    );
  }
  return DEFAULT_API_PREDICT_MAX_ROWS;
}

/** Mensagem do 413 — cita o teto em vigor e o caminho para lotes maiores. */
export function payloadTooLargeMessage(maxRows: number): string {
  return `Envie até ${maxRows.toLocaleString("pt-BR")} linhas por chamada ou use o lote pelo web app.`;
}

const INVALID_ROW_ITEM_MESSAGE =
  "Cada item de rows deve ser um objeto {coluna: valor}.";

const MISSING_KEY_MESSAGE =
  "Informe a chave de API no header Authorization: Bearer <chave> (ou api_key no corpo da requisição).";

const INVALID_HEADER_MESSAGE =
  "Header Authorization inválido. Use Authorization: Bearer <chave>.";

/** Uma única mensagem para chave inexistente E deployment despublicado. */
export const INVALID_KEY_MESSAGE = "Chave de API inválida ou não publicada.";

const bodySchema = z.object({
  // Opcional: só é exigido quando o header Authorization está ausente
  api_key: z
    .string({ error: MISSING_KEY_MESSAGE })
    .min(1, MISSING_KEY_MESSAGE)
    .max(200, "Chave de API inválida.")
    .optional(),
  rows: z
    .array(z.record(z.string(), z.unknown()), {
      error: "Envie rows como uma lista de objetos {coluna: valor}.",
    })
    .min(1, "Envie pelo menos uma linha em rows."),
  // O teto de linhas NÃO fica no schema: acima dele é 413 (não 422), com o
  // valor lido da env a cada requisição
});

/**
 * Mensagem de validação sem eco do payload: os problemas de topo (api_key,
 * rows) já têm texto fixo em português no schema; um item de rows que não é
 * objeto receberia a mensagem padrão do Zod (em inglês, com o tipo recebido) —
 * troca por texto fixo. Nunca usa `issue.input`.
 */
function validationMessage(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return "Payload inválido.";
  if (issue.path[0] === "rows" && issue.path.length > 1) {
    return INVALID_ROW_ITEM_MESSAGE;
  }
  return issue.message;
}

/** Deployment de API resolvido pela chave, com o necessário para prever e auditar. */
export type ApiPredictTarget = {
  deploymentId: string;
  orgId: string;
  projectId: string;
  /** Nome do projeto — vai na metadata durável de auditoria */
  projectName: string;
  modelId: string;
};

export type ApiPredictDeps = {
  /** Rate limit por chave: 429 pronta ou null para prosseguir. */
  rateLimit(keyHash: string): Promise<Response | null>;
  /** Deployment de API publicado com este api_key_hash, ou null. */
  findDeploymentByKeyHash(keyHash: string): Promise<ApiPredictTarget | null>;
  /**
   * Chamado em TODA falha de autenticação, antes do 401: grava
   * api.auth_failed e conta por IP (recordApiAuthFailure em produção).
   * Devolve a 429 pronta (enforce, ao estourar) ou null para seguir com o 401.
   * Recebe a chave tentada em claro (ou null) — só o prefixo é gravado.
   */
  onAuthFailed(attemptedKey: string | null): Promise<Response | null>;
  /** Predição síncrona via worker (runPrediction em produção). */
  predict(modelId: string, rows: PredictionRow[]): Promise<Prediction[]>;
  /**
   * Auditoria api.predict — recebe só a contagem e onde a chave veio
   * (header|body, para medir a migração), nunca os dados enviados.
   */
  audit(
    target: ApiPredictTarget,
    rowCount: number,
    keyLocation: ApiKeyLocation,
  ): Promise<void>;
};

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

type ResolvedKey =
  | { ok: true; key: string; location: ApiKeyLocation }
  | { ok: false; status: 401 | 422; message: string };

/**
 * Resolve a chave da requisição: header Authorization primeiro; sem header,
 * api_key do body. Header presente mas fora do esquema Bearer é 401 (não cai
 * para o body); sem nenhum dos dois é 422, como a validação de payload.
 */
function resolveKey(
  request: Request,
  bodyKey: string | undefined,
): ResolvedKey {
  const header = request.headers.get("authorization");
  if (header !== null && header.trim() !== "") {
    const key = bearerKey(header);
    if (!key) {
      return { ok: false, status: 401, message: INVALID_HEADER_MESSAGE };
    }
    return { ok: true, key, location: "header" };
  }
  if (bodyKey) return { ok: true, key: bodyKey, location: "body" };
  return { ok: false, status: 422, message: MISSING_KEY_MESSAGE };
}

/** Único caminho para responder 401: registra a falha (e o eventual 429) antes. */
async function unauthorized(
  deps: ApiPredictDeps,
  message: string,
  attemptedKey: string | null,
): Promise<Response> {
  const blocked = await deps.onAuthFailed(attemptedKey);
  return blocked ?? jsonError(message, 401);
}

/**
 * Trata uma chamada de predição da API: header Authorization: Bearer <chave>
 * (ou api_key no body, compat) + body { rows } → 200 { predictions } no
 * formato da US-042; 401 chave inválida, 422 payload inválido (mensagem em
 * português), 429 rate limit por chave, 504 timeout.
 */
export async function handleApiPredict(
  request: Request,
  deps: ApiPredictDeps,
): Promise<Response> {
  // Headers obrigatórios em TODA saída (200, 4xx, 5xx) — por isso o wrapper
  return withPublicApiHeaders(await predictRequest(request, deps));
}

/** Corpo bruto dentro do teto de 1 MB, ou a resposta 413 pronta. */
async function readBodyWithinLimit(
  request: Request,
  maxRows: number,
): Promise<{ ok: true; text: string } | { ok: false; response: Response }> {
  const tooLarge = () =>
    ({
      ok: false,
      response: jsonError(payloadTooLargeMessage(maxRows), 413),
    }) as const;

  // Content-Length declarado acima do teto: recusa sem ler o corpo
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > API_PREDICT_MAX_BODY_BYTES) {
    return tooLarge();
  }

  const text = await request.text();
  // Mede em bytes (UTF-8), não em chars: acentos e emojis contam mais
  if (new TextEncoder().encode(text).byteLength > API_PREDICT_MAX_BODY_BYTES) {
    return tooLarge();
  }
  return { ok: true, text };
}

async function predictRequest(
  request: Request,
  deps: ApiPredictDeps,
): Promise<Response> {
  const maxRows = apiPredictMaxRows();

  const body = await readBodyWithinLimit(request, maxRows);
  if (!body.ok) return body.response;

  let raw: unknown;
  try {
    raw = JSON.parse(body.text);
  } catch {
    return jsonError(
      "Corpo da requisição inválido. Envie um JSON com rows.",
      422,
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(validationMessage(parsed.error.issues[0]), 422);
  }

  // Teto de linhas: 413 com orientação, antes de autenticar ou consultar o banco
  if (parsed.data.rows.length > maxRows) {
    return jsonError(payloadTooLargeMessage(maxRows), 413);
  }

  const resolved = resolveKey(request, parsed.data.api_key);
  if (!resolved.ok) {
    if (resolved.status === 401) {
      // Header fora do esquema Bearer: nenhuma chave foi extraída (prefixo null)
      return unauthorized(deps, resolved.message, null);
    }
    return jsonError(resolved.message, resolved.status);
  }

  const response = await predictWithKey(deps, parsed.data, resolved);
  // api_key no body é canal descontinuado (US-039): avisa em TODA resposta
  // dessa origem (200, 401, 429…) sem mudar status nem corpo
  return resolved.location === "body" ? withDeprecation(response) : response;
}

/** Do rate limit em diante, com a chave já resolvida. */
async function predictWithKey(
  deps: ApiPredictDeps,
  data: z.infer<typeof bodySchema>,
  resolved: Extract<ResolvedKey, { ok: true }>,
): Promise<Response> {
  // Rate limit antes da consulta: também freia tentativas de chave inválida
  const keyHash = hashApiKey(resolved.key);
  const limited = await deps.rateLimit(keyHash);
  if (limited) return limited;

  const target = await deps.findDeploymentByKeyHash(keyHash);
  if (!target) {
    return unauthorized(deps, INVALID_KEY_MESSAGE, resolved.key);
  }

  try {
    const predictions = await deps.predict(target.modelId, data.rows);
    await deps.audit(target, data.rows.length, resolved.location);
    return Response.json({ predictions });
  } catch (error) {
    // runPrediction entrega mensagens em português (worker/timeout/infra)
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Não foi possível calcular a predição. Tente novamente.";
    const status = message === PREDICTION_TIMEOUT_MESSAGE ? 504 : 422;
    return jsonError(message, status);
  }
}

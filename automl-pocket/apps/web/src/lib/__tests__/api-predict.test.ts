import { afterEach, describe, expect, it, vi } from "vitest";

import { generateApiKey, hashApiKey } from "@/lib/api-keys";
import {
  API_PREDICT_MAX_BODY_BYTES,
  DEFAULT_API_PREDICT_MAX_ROWS,
  INVALID_KEY_MESSAGE,
  apiPredictMaxRows,
  handleApiPredict,
  payloadTooLargeMessage,
  resetApiPredictWarnings,
  type ApiKeyLocation,
  type ApiPredictDeps,
  type ApiPredictTarget,
} from "@/lib/api-predict";
import { PREDICTION_TIMEOUT_MESSAGE } from "@/lib/predictions";

const VALID_KEY = "ak_teste-de-chave-valida-com-mais-de-32-chars";

const TARGET: ApiPredictTarget = {
  deploymentId: "11111111-1111-4111-8111-111111111111",
  orgId: "22222222-2222-4222-8222-222222222222",
  projectId: "33333333-3333-4333-8333-333333333333",
  projectName: "Churn de clientes",
  modelId: "44444444-4444-4444-8444-444444444444",
};

const CLASSIFICATION_RESULT = [
  {
    prediction: "sim",
    probability: 0.9,
    probabilities: { sim: 0.9, nao: 0.1 },
  },
];

/** Deps fake: chave válida resolve o TARGET, predição devolve classificação. */
function makeDeps(overrides: Partial<ApiPredictDeps> = {}) {
  const calls = {
    audits: [] as {
      target: ApiPredictTarget;
      rowCount: number;
      keyLocation: ApiKeyLocation;
    }[],
    predictedRows: null as unknown[] | null,
    lookedUpHashes: [] as string[],
    /** Chave tentada (em claro) em cada 401 — null quando nenhuma foi extraída */
    authFailures: [] as (string | null)[],
  };
  const deps: ApiPredictDeps = {
    rateLimit: async () => null,
    findDeploymentByKeyHash: async (keyHash) => {
      calls.lookedUpHashes.push(keyHash);
      return keyHash === hashApiKey(VALID_KEY) ? TARGET : null;
    },
    onAuthFailed: async (attemptedKey) => {
      calls.authFailures.push(attemptedKey);
      return null;
    },
    predict: async (_modelId, rows) => {
      calls.predictedRows = rows;
      return CLASSIFICATION_RESULT;
    },
    audit: async (target, rowCount, keyLocation) => {
      calls.audits.push({ target, rowCount, keyLocation });
    },
    ...overrides,
  };
  return { deps, calls };
}

function request(
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request("http://localhost:3000/api/v1/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Requisição no formato canônico (US-030): chave no header, body só com rows. */
function bearerRequest(key: string, body: unknown): Request {
  return request(body, { Authorization: `Bearer ${key}` });
}

describe("handleApiPredict", () => {
  it("api_key no body responde com Deprecation: true (US-039)", async () => {
    const { deps } = makeDeps();
    const response = await handleApiPredict(
      request({ api_key: VALID_KEY, rows: [{ idade: 42 }] }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(await response.json()).toEqual({
      predictions: CLASSIFICATION_RESULT,
    });
  });

  it("api_key inválido no body também avisa a descontinuação (401 inalterado)", async () => {
    const { deps } = makeDeps();
    const response = await handleApiPredict(
      request({ api_key: "ak_errada", rows: [{ idade: 42 }] }),
      deps,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(await response.json()).toEqual({ error: INVALID_KEY_MESSAGE });
  });

  it("chave no header Authorization NÃO recebe headers de descontinuação", async () => {
    const { deps } = makeDeps();
    const response = await handleApiPredict(
      bearerRequest(VALID_KEY, { rows: [{ idade: 42 }] }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Deprecation")).toBeNull();
    expect(response.headers.get("Link")).toBeNull();
  });

  it("responde 200 com as predições para chave válida", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      request({ api_key: VALID_KEY, rows: [{ idade: 42, cidade: "SP" }] }),
      deps,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      predictions: CLASSIFICATION_RESULT,
    });
    // A predição recebe as linhas como enviadas e a auditoria só a contagem
    expect(calls.predictedRows).toEqual([{ idade: 42, cidade: "SP" }]);
    expect(calls.audits).toEqual([
      { target: TARGET, rowCount: 1, keyLocation: "body" },
    ]);
  });

  it("consulta o deployment pelo SHA-256 da chave, nunca pela chave em claro", async () => {
    const { deps, calls } = makeDeps();
    await handleApiPredict(
      request({ api_key: VALID_KEY, rows: [{ idade: 1 }] }),
      deps,
    );

    expect(calls.lookedUpHashes).toEqual([hashApiKey(VALID_KEY)]);
    expect(calls.lookedUpHashes[0]).not.toContain(VALID_KEY);
  });

  it("responde 401 para chave inválida, sem prever nem auditar", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      request({
        api_key: "ak_chave-que-nao-existe-em-lugar-nenhum",
        rows: [{ a: 1 }],
      }),
      deps,
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/chave de api inválida/i);
    expect(calls.predictedRows).toBeNull();
    expect(calls.audits).toEqual([]);
  });

  it.each([
    ["JSON malformado", "{nao é json"],
    ["sem api_key", { rows: [{ a: 1 }] }],
    ["sem rows", { api_key: VALID_KEY }],
    ["rows vazio", { api_key: VALID_KEY, rows: [] }],
    ["rows com item não-objeto", { api_key: VALID_KEY, rows: [42] }],
  ])(
    "responde 422 com mensagem em português para payload inválido (%s)",
    async (_label, body) => {
      const { deps, calls } = makeDeps();
      const response = await handleApiPredict(request(body), deps);

      expect(response.status).toBe(422);
      const parsed = (await response.json()) as { error: string };
      expect(parsed.error).toMatch(/[a-zçãéíõ]/i);
      expect(parsed.error.length).toBeGreaterThan(10);
      expect(calls.predictedRows).toBeNull();
    },
  );

  it("propaga a resposta 429 do rate limit por chave", async () => {
    const limited = Response.json(
      { error: "Muitas requisições. Tente novamente em 60 segundos." },
      { status: 429 },
    );
    const { deps, calls } = makeDeps({ rateLimit: async () => limited });
    const response = await handleApiPredict(
      request({ api_key: VALID_KEY, rows: [{ a: 1 }] }),
      deps,
    );

    expect(response.status).toBe(429);
    expect(calls.lookedUpHashes).toEqual([]);
    expect(calls.predictedRows).toBeNull();
  });

  it("responde 504 quando o worker estoura o timeout", async () => {
    const { deps } = makeDeps({
      predict: async () => {
        throw new Error(PREDICTION_TIMEOUT_MESSAGE);
      },
    });
    const response = await handleApiPredict(
      request({ api_key: VALID_KEY, rows: [{ a: 1 }] }),
      deps,
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: PREDICTION_TIMEOUT_MESSAGE,
    });
  });

  it("responde 422 com a mensagem do worker quando a predição falha", async () => {
    const { deps, calls } = makeDeps({
      predict: async () => {
        throw new Error("O modelo deste deployment não está mais disponível.");
      },
    });
    const response = await handleApiPredict(
      request({ api_key: VALID_KEY, rows: [{ a: 1 }] }),
      deps,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "O modelo deste deployment não está mais disponível.",
    });
    expect(calls.audits).toEqual([]);
  });
});

describe("handleApiPredict — chave no header Authorization (US-030)", () => {
  it("aceita Authorization: Bearer <chave> com body só de rows e audita keyLocation header", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      bearerRequest(VALID_KEY, { rows: [{ idade: 42 }] }),
      deps,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      predictions: CLASSIFICATION_RESULT,
    });
    expect(calls.lookedUpHashes).toEqual([hashApiKey(VALID_KEY)]);
    expect(calls.audits).toEqual([
      { target: TARGET, rowCount: 1, keyLocation: "header" },
    ]);
  });

  it("continua aceitando api_key no body (compat) e audita keyLocation body", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      request({ api_key: VALID_KEY, rows: [{ idade: 42 }] }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(calls.audits).toEqual([
      { target: TARGET, rowCount: 1, keyLocation: "body" },
    ]);
  });

  it("header inválido com api_key válido no body responde 401, sem cair para o body", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      bearerRequest("ak_chave-invalida-no-header", {
        api_key: VALID_KEY,
        rows: [{ idade: 42 }],
      }),
      deps,
    );

    expect(response.status).toBe(401);
    // Só o hash do header foi consultado; o api_key do body nunca é tentado
    expect(calls.lookedUpHashes).toEqual([
      hashApiKey("ak_chave-invalida-no-header"),
    ]);
    expect(calls.predictedRows).toBeNull();
    expect(calls.audits).toEqual([]);
  });

  it("header presente tem precedência sobre api_key do body quando os dois são válidos", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      bearerRequest(VALID_KEY, {
        api_key: "ak_chave-do-body-ignorada",
        rows: [{ idade: 42 }],
      }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(calls.lookedUpHashes).toEqual([hashApiKey(VALID_KEY)]);
    expect(calls.audits[0]?.keyLocation).toBe("header");
  });

  it("header Authorization fora do esquema Bearer responde 401 sem consultar o banco", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      request(
        { api_key: VALID_KEY, rows: [{ idade: 42 }] },
        { Authorization: "Basic dXNlcjpzZW5oYQ==" },
      ),
      deps,
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/Authorization: Bearer/);
    expect(calls.lookedUpHashes).toEqual([]);
  });

  it("aplica o rate limit pelo hash da chave do header", async () => {
    const seen: string[] = [];
    const { deps } = makeDeps({
      rateLimit: async (keyHash) => {
        seen.push(keyHash);
        return null;
      },
    });
    await handleApiPredict(
      bearerRequest(VALID_KEY, { rows: [{ idade: 1 }] }),
      deps,
    );

    expect(seen).toEqual([hashApiKey(VALID_KEY)]);
  });

  it("sem header nem api_key responde 422 orientando o header", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      request({ rows: [{ idade: 42 }] }),
      deps,
    );

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/Authorization: Bearer/);
    expect(calls.lookedUpHashes).toEqual([]);
  });
});

describe("generateApiKey", () => {
  it("gera chave dos_live_ url-safe com ≥32 chars, prefixo identificador e hash SHA-256", () => {
    const generated = generateApiKey();

    expect(generated.key.length).toBeGreaterThanOrEqual(32);
    expect(generated.key).toMatch(/^dos_live_[A-Za-z0-9_-]+$/);
    // dos_live_ + 4 chars aleatórios (US-038): o prefixo fixo sozinho não identifica
    expect(generated.prefix).toBe(generated.key.slice(0, 13));
    expect(generated.hash).toBe(hashApiKey(generated.key));
    expect(generated.hash).toMatch(/^[a-f0-9]{64}$/);
    // O hash não revela a chave
    expect(generated.hash).not.toContain(generated.key.slice(9));
  });

  it("gera chaves diferentes a cada chamada", () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });
});

describe("handleApiPredict — falhas de autenticação (US-021)", () => {
  // O finder real devolve null tanto para hash desconhecido quanto para
  // deployment despublicado; o dublê reproduz os dois casos.
  const UNPUBLISHED_KEY = "ak_chave-de-deployment-despublicado-0000";

  it("chave inexistente e deployment despublicado respondem o MESMO 401", async () => {
    const { deps } = makeDeps({
      findDeploymentByKeyHash: async (keyHash) =>
        keyHash === hashApiKey(VALID_KEY) ? TARGET : null,
    });
    const unknown = await handleApiPredict(
      bearerRequest("ak_chave-que-nao-existe", { rows: [{ a: 1 }] }),
      deps,
    );
    const unpublished = await handleApiPredict(
      bearerRequest(UNPUBLISHED_KEY, { rows: [{ a: 1 }] }),
      deps,
    );

    expect(unknown.status).toBe(401);
    expect(unpublished.status).toBe(401);
    const unknownBody = await unknown.json();
    const unpublishedBody = await unpublished.json();
    expect(unknownBody).toEqual(unpublishedBody);
    expect(unknownBody).toEqual({ error: INVALID_KEY_MESSAGE });
  });

  it("chave inválida chama onAuthFailed com a chave tentada, uma vez por 401", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      bearerRequest("ak_chave-que-nao-existe", { rows: [{ a: 1 }] }),
      deps,
    );

    expect(response.status).toBe(401);
    expect(calls.authFailures).toEqual(["ak_chave-que-nao-existe"]);
  });

  it("header fora do esquema Bearer chama onAuthFailed sem chave (null)", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      request(
        { rows: [{ a: 1 }] },
        { Authorization: "Basic dXNlcjpzZW5oYQ==" },
      ),
      deps,
    );

    expect(response.status).toBe(401);
    expect(calls.authFailures).toEqual([null]);
  });

  it("não chama onAuthFailed em sucesso nem em 422", async () => {
    const { deps, calls } = makeDeps();
    const ok = await handleApiPredict(
      bearerRequest(VALID_KEY, { rows: [{ a: 1 }] }),
      deps,
    );
    const invalidPayload = await handleApiPredict(
      bearerRequest(VALID_KEY, { rows: [] }),
      deps,
    );

    expect(ok.status).toBe(200);
    expect(invalidPayload.status).toBe(422);
    expect(calls.authFailures).toEqual([]);
  });

  it("quando onAuthFailed devolve 429 (enforce), a resposta é o 429 e não o 401", async () => {
    const blocked = Response.json(
      { error: "Muitas tentativas." },
      { status: 429, headers: { "Retry-After": "42" } },
    );
    const { deps, calls } = makeDeps({ onAuthFailed: async () => blocked });
    const response = await handleApiPredict(
      bearerRequest("ak_chave-que-nao-existe", { rows: [{ a: 1 }] }),
      deps,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(calls.predictedRows).toBeNull();
    expect(calls.audits).toEqual([]);
  });
});

describe("handleApiPredict — limites de payload e higiene de resposta (US-040)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetApiPredictWarnings();
  });

  function rows(count: number) {
    return Array.from({ length: count }, () => ({ a: 1 }));
  }

  it("default do teto é 500 linhas; env inválida cai no default com um aviso", () => {
    expect(DEFAULT_API_PREDICT_MAX_ROWS).toBe(500);
    expect(apiPredictMaxRows(undefined)).toBe(500);
    expect(apiPredictMaxRows("")).toBe(500);
    expect(apiPredictMaxRows(" 1200 ")).toBe(1200);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(apiPredictMaxRows("0")).toBe(500);
    expect(apiPredictMaxRows("abc")).toBe(500);
    expect(apiPredictMaxRows("12.5")).toBe(500);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("acima do teto responde 413 com a orientação, antes de autenticar", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      bearerRequest(VALID_KEY, {
        rows: rows(DEFAULT_API_PREDICT_MAX_ROWS + 1),
      }),
      deps,
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Envie até 500 linhas por chamada ou use o lote pelo web app.",
    });
    expect(payloadTooLargeMessage(1200)).toBe(
      "Envie até 1.200 linhas por chamada ou use o lote pelo web app.",
    );
    // Nada de rate limit, lookup, predição ou auditoria
    expect(calls.lookedUpHashes).toEqual([]);
    expect(calls.predictedRows).toBeNull();
    expect(calls.audits).toEqual([]);
  });

  it("exatamente no teto passa", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleApiPredict(
      bearerRequest(VALID_KEY, { rows: rows(DEFAULT_API_PREDICT_MAX_ROWS) }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(calls.predictedRows).toHaveLength(DEFAULT_API_PREDICT_MAX_ROWS);
  });

  it("API_PREDICT_MAX_ROWS na env redefine o teto (e a mensagem)", async () => {
    vi.stubEnv("API_PREDICT_MAX_ROWS", "3");
    const { deps } = makeDeps();

    const ok = await handleApiPredict(
      bearerRequest(VALID_KEY, { rows: rows(3) }),
      deps,
    );
    expect(ok.status).toBe(200);

    const tooMany = await handleApiPredict(
      bearerRequest(VALID_KEY, { rows: rows(4) }),
      deps,
    );
    expect(tooMany.status).toBe(413);
    expect(await tooMany.json()).toEqual({
      error: "Envie até 3 linhas por chamada ou use o lote pelo web app.",
    });
  });

  it("body acima de 1 MB responde 413 sem tentar interpretar o JSON", async () => {
    const { deps, calls } = makeDeps();
    // Uma única linha, mas com um texto gigante: o teto de bytes é independente do de linhas
    const huge = JSON.stringify({
      rows: [{ obs: "x".repeat(API_PREDICT_MAX_BODY_BYTES) }],
    });
    const response = await handleApiPredict(
      bearerRequest(VALID_KEY, huge),
      deps,
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Envie até 500 linhas por chamada ou use o lote pelo web app.",
    });
    expect(calls.lookedUpHashes).toEqual([]);
  });

  it("Content-Length declarado acima de 1 MB responde 413 sem ler o corpo", async () => {
    const { deps } = makeDeps();
    const response = await handleApiPredict(
      request(
        { rows: rows(1) },
        {
          Authorization: `Bearer ${VALID_KEY}`,
          "Content-Length": String(API_PREDICT_MAX_BODY_BYTES + 1),
        },
      ),
      deps,
    );

    expect(response.status).toBe(413);
  });

  it("o teto de bytes conta UTF-8, não caracteres", async () => {
    const { deps } = makeDeps();
    // 400 mil "é" = 400 mil chars, mas 800 mil bytes + envelope < 1 MB: passa
    const fits = JSON.stringify({ rows: [{ obs: "é".repeat(400_000) }] });
    expect(
      (await handleApiPredict(bearerRequest(VALID_KEY, fits), deps)).status,
    ).toBe(200);
    // 600 mil "é" = 600 mil chars (< 1 Mi), porém 1,2 MB em bytes: 413
    const overflows = JSON.stringify({ rows: [{ obs: "é".repeat(600_000) }] });
    expect(
      (await handleApiPredict(bearerRequest(VALID_KEY, overflows), deps))
        .status,
    ).toBe(413);
  });

  it.each([
    ["item de rows não-objeto", { rows: ["SEGREDO-4242"] }],
    ["rows como string", { rows: "SEGREDO-4242" }],
    [
      "rows com objeto e um item inválido",
      { rows: [{ a: 1 }, "SEGREDO-4242"] },
    ],
  ])(
    "erro de validação nunca ecoa os valores enviados (%s)",
    async (_label, body) => {
      const { deps } = makeDeps();
      const response = await handleApiPredict(
        bearerRequest(VALID_KEY, body),
        deps,
      );

      expect(response.status).toBe(422);
      const text = await response.text();
      expect(text).not.toContain("SEGREDO");
      expect(text).not.toMatch(/\bat\s+\w+\s+\(/); // sem stack trace
      const parsed = JSON.parse(text) as { error: string };
      expect(Object.keys(parsed)).toEqual(["error"]);
      expect(parsed.error).toMatch(/rows/);
    },
  );

  it("413 tampouco ecoa os valores enviados", async () => {
    const { deps } = makeDeps();
    const response = await handleApiPredict(
      bearerRequest(VALID_KEY, {
        rows: Array.from({ length: DEFAULT_API_PREDICT_MAX_ROWS + 1 }, () => ({
          cpf: "SEGREDO-4242",
        })),
      }),
      deps,
    );

    expect(response.status).toBe(413);
    expect(await response.text()).not.toContain("SEGREDO");
  });

  it.each([
    ["200", { rows: [{ a: 1 }] }, 200],
    ["422", { rows: [] }, 422],
    ["413", { rows: Array.from({ length: 501 }, () => ({ a: 1 })) }, 413],
  ])(
    "toda resposta sai com X-Content-Type-Options: nosniff e Cache-Control: no-store (%s)",
    async (_label, body, status) => {
      const { deps } = makeDeps();
      const response = await handleApiPredict(
        bearerRequest(VALID_KEY, body),
        deps,
      );

      expect(response.status).toBe(status);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    },
  );

  it("401 e 429 também levam os headers de higiene", async () => {
    const { deps } = makeDeps();
    const unauthorized = await handleApiPredict(
      bearerRequest("ak_errada", { rows: [{ a: 1 }] }),
      deps,
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const limited = Response.json(
      { error: "Muitas requisições." },
      { status: 429 },
    );
    const { deps: limitedDeps } = makeDeps({ rateLimit: async () => limited });
    const response = await handleApiPredict(
      bearerRequest(VALID_KEY, { rows: [{ a: 1 }] }),
      limitedDeps,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

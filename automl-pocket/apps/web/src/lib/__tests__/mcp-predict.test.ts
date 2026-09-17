import { describe, expect, it, vi } from "vitest";

import { hashApiKey } from "@/lib/api-keys";
import {
  MCP_FORBIDDEN_ORIGIN_MESSAGE,
  MCP_INVALID_KEY_MESSAGE,
  MCP_SERVER_NAME,
  handleMcpRequest,
  summarizePrediction,
  type McpKeyLocation,
  type McpPredictDeps,
  type McpPredictTarget,
} from "@/lib/mcp-predict";

const VALID_KEY = "ak_teste-de-chave-valida-com-mais-de-32-chars";

const TARGET: McpPredictTarget = {
  deploymentId: "11111111-1111-4111-8111-111111111111",
  orgId: "22222222-2222-4222-8222-222222222222",
  projectId: "33333333-3333-4333-8333-333333333333",
  projectName: "Churn de clientes",
  modelId: "44444444-4444-4444-8444-444444444444",
  title: "Churn de clientes",
  target: "cancelou",
  description: "Estima o risco de cancelamento dos clientes da base.",
  metrics: { accuracy: 0.91 },
  problemType: "classification",
  formFields: [
    { name: "idade", type: "number", categories: [] },
    { name: "cidade", type: "category", categories: ["SP", "RJ", "BH"] },
    { name: "obs", type: "text", categories: [] },
    { name: "inicio", type: "date", categories: [] },
  ],
};

const CLASSIFICATION_RESULT = [
  {
    prediction: "sim",
    probability: 0.9,
    probabilities: { sim: 0.9, nao: 0.1 },
  },
];

/** Deps fake: chave válida resolve o TARGET, predição devolve classificação. */
function makeDeps(overrides: Partial<McpPredictDeps> = {}) {
  const calls = {
    audits: [] as { target: McpPredictTarget; keyLocation: McpKeyLocation }[],
    predictedRows: null as unknown[] | null,
    lookedUpHashes: [] as string[],
    /** Chave tentada (em claro) em cada 401 — null quando nenhuma chegou */
    authFailures: [] as (string | null)[],
  };
  const deps: McpPredictDeps = {
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
    audit: async (target, keyLocation) => {
      calls.audits.push({ target, keyLocation });
    },
    ...overrides,
  };
  return { deps, calls };
}

let nextId = 1;

function rpcRequest(
  method: string,
  params: Record<string, unknown> = {},
  {
    key = VALID_KEY as string | null,
    queryKey = null as string | null,
    origin = null as string | null,
  } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (key !== null) headers.Authorization = `Bearer ${key}`;
  if (origin !== null) headers.Origin = origin;
  const query =
    queryKey !== null ? `?token=${encodeURIComponent(queryKey)}` : "";
  return new Request(`http://localhost:3000/api/mcp${query}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
}

const INITIALIZE_PARAMS = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "teste", version: "1.0.0" },
};

type RpcResponse = {
  jsonrpc: string;
  result?: Record<string, unknown>;
  error?: { message: string };
};

describe("handleMcpRequest", () => {
  it("responde ao initialize com o servidor nomeado pelo deployment", async () => {
    const { deps } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("initialize", INITIALIZE_PARAMS),
      deps,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as RpcResponse;
    expect(body.error).toBeUndefined();
    expect(body.result?.protocolVersion).toBeTruthy();
    expect(body.result?.serverInfo).toMatchObject({
      name: MCP_SERVER_NAME,
      title: TARGET.title,
    });
    // As instructions do servidor dão ao agente o contexto de quando usá-lo,
    // incluindo a descrição escrita pelo dono do deployment
    expect(body.result?.instructions).toContain('prever "cancelou"');
    expect(body.result?.instructions).toContain(
      "Estima o risco de cancelamento",
    );
  });

  it("tools/list expõe só as tools do deployment (predict + model_info), nada além", async () => {
    const { deps } = makeDeps();
    const response = await handleMcpRequest(rpcRequest("tools/list"), deps);

    expect(response.status).toBe(200);
    const body = (await response.json()) as RpcResponse;
    const tools = body.result?.tools as {
      name: string;
      description?: string;
      inputSchema: {
        type: string;
        properties?: Record<string, { type?: string; description?: string }>;
        required?: string[];
      };
    }[];
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "model_info",
      "predict",
    ]);

    const tool = tools.find((candidate) => candidate.name === "predict")!;
    expect(tool.description).toMatch(/predição de classificação/i);
    // A descrição diz o que o modelo prevê e quando usar a tool — é o que
    // faz o agente acionar o conector sem o usuário pedir explicitamente
    expect(tool.description).toContain('prever "cancelou"');
    expect(tool.description).toContain("Estima o risco de cancelamento");
    expect(tool.inputSchema.type).toBe("object");
    const properties = tool.inputSchema.properties ?? {};
    expect(Object.keys(properties)).toEqual([
      "idade",
      "cidade",
      "obs",
      "inicio",
    ]);
    expect(properties.idade.type).toBe("number");
    expect(properties.cidade.type).toBe("string");
    // A descrição da categoria traz exemplos vindos do perfilamento
    expect(properties.cidade.description).toContain("SP");
    expect(properties.inicio.description).toMatch(/AAAA-MM-DD/);
    // Nenhum campo é obrigatório: ausentes viram nulos (regra da US-042)
    expect(tool.inputSchema.required ?? []).toEqual([]);
  });

  it("tools/call predict devolve a predição com frase em português e audita", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/call", {
        name: "predict",
        arguments: { idade: 42, cidade: "SP" },
      }),
      deps,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as RpcResponse;
    expect(body.error).toBeUndefined();
    const result = body.result as {
      content: { type: string; text: string }[];
      isError?: boolean;
    };
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe(
      'A classe prevista é "sim", com 90% de probabilidade.',
    );
    // O segundo item traz a predição no formato da US-042
    expect(JSON.parse(result.content[1].text)).toEqual(
      CLASSIFICATION_RESULT[0],
    );
    // Campos não informados viram nulos; a auditoria não recebe os dados
    expect(calls.predictedRows).toEqual([
      { idade: 42, cidade: "SP", obs: null, inicio: null },
    ]);
    // keyLocation "header": a chave veio no Authorization (US-030)
    expect(calls.audits).toEqual([{ target: TARGET, keyLocation: "header" }]);
  });

  it("model_info descreve o modelo sem auditar", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/call", { name: "model_info", arguments: {} }),
      deps,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as RpcResponse;
    const result = body.result as {
      content: { type: string; text: string }[];
      isError?: boolean;
    };
    expect(result.isError).toBeFalsy();
    const info = JSON.parse(result.content[0].text);
    expect(info.alvo).toBe("cancelou");
    expect(info.descricao).toContain("risco de cancelamento");
    // Categorias completas, sem o corte de 8 exemplos das descrições
    expect(info.campos).toContainEqual({
      nome: "cidade",
      tipo: "category",
      categorias: ["SP", "RJ", "BH"],
    });
    expect(info.metricas).toEqual({ accuracy: 0.91 });
    // Metadados não contam como predição
    expect(calls.predictedRows).toBeNull();
    expect(calls.audits).toEqual([]);
  });

  it("aceita a chave via query param ?token= para clientes sem campo de header", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: null, queryKey: VALID_KEY }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(calls.lookedUpHashes).toEqual([hashApiKey(VALID_KEY)]);
  });

  it("predict autenticado por ?token= audita keyLocation query", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest(
        "tools/call",
        { name: "predict", arguments: { idade: 42 } },
        { key: null, queryKey: VALID_KEY },
      ),
      deps,
    );

    expect(response.status).toBe(200);
    expect(calls.audits).toEqual([{ target: TARGET, keyLocation: "query" }]);
  });

  it("?token= na URL responde com Deprecation: true (US-039)", async () => {
    const { deps } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: null, queryKey: VALID_KEY }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Deprecation")).toBe("true");
    const body = (await response.json()) as RpcResponse;
    expect(body.result).toBeDefined();
  });

  it("?token= inválido também avisa a descontinuação (401 inalterado)", async () => {
    const { deps } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: null, queryKey: "ak_errada" }),
      deps,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Deprecation")).toBe("true");
  });

  it("chave no header Authorization NÃO recebe headers de descontinuação", async () => {
    const { deps } = makeDeps();
    const response = await handleMcpRequest(rpcRequest("tools/list", {}), deps);

    expect(response.status).toBe(200);
    expect(response.headers.get("Deprecation")).toBeNull();
    expect(response.headers.get("Link")).toBeNull();
  });

  it("o header Authorization tem precedência sobre o ?token= da URL", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest(
        "tools/list",
        {},
        { key: VALID_KEY, queryKey: "ak_chave-ignorada" },
      ),
      deps,
    );

    expect(response.status).toBe(200);
    expect(calls.lookedUpHashes).toEqual([hashApiKey(VALID_KEY)]);
  });

  it("responde 401 sem header Authorization, sem consultar o banco", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: null }),
      deps,
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/authorization/i);
    expect(calls.lookedUpHashes).toEqual([]);
  });

  it("responde 401 para chave desconhecida, sem prever nem auditar", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: "ak_chave-que-nao-existe" }),
      deps,
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/chave de api inválida/i);
    expect(calls.predictedRows).toBeNull();
    expect(calls.audits).toEqual([]);
  });

  it("consulta o deployment pelo SHA-256 da chave, nunca pela chave em claro", async () => {
    const { deps, calls } = makeDeps();
    await handleMcpRequest(rpcRequest("tools/list"), deps);

    expect(calls.lookedUpHashes).toEqual([hashApiKey(VALID_KEY)]);
    expect(calls.lookedUpHashes[0]).not.toContain(VALID_KEY);
  });

  it("propaga a resposta 429 do rate limit por chave", async () => {
    const limited = Response.json(
      { error: "Muitas requisições. Tente novamente em 60 segundos." },
      { status: 429 },
    );
    const { deps, calls } = makeDeps({ rateLimit: async () => limited });
    const response = await handleMcpRequest(rpcRequest("tools/list"), deps);

    expect(response.status).toBe(429);
    expect(calls.lookedUpHashes).toEqual([]);
  });

  it("erro do worker vira resultado isError com a mensagem em português", async () => {
    const { deps, calls } = makeDeps({
      predict: async () => {
        throw new Error(
          "A predição demorou mais do que o esperado. Tente novamente.",
        );
      },
    });
    const response = await handleMcpRequest(
      rpcRequest("tools/call", { name: "predict", arguments: { idade: 1 } }),
      deps,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as RpcResponse;
    const result = body.result as {
      content: { type: string; text: string }[];
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/demorou mais do que o esperado/);
    expect(calls.audits).toEqual([]);
  });
});

describe("summarizePrediction", () => {
  it("resume classificação com probabilidade em pt-BR", () => {
    expect(
      summarizePrediction({
        prediction: "não",
        probability: 0.876,
        probabilities: { não: 0.876, sim: 0.124 },
      }),
    ).toBe('A classe prevista é "não", com 87,6% de probabilidade.');
  });

  it("resume regressão com valor formatado em pt-BR", () => {
    expect(summarizePrediction({ prediction: 1234.5 })).toBe(
      "O valor previsto é 1.234,5.",
    );
  });
});

describe("handleMcpRequest — falhas de autenticação (US-021)", () => {
  it("chave inexistente e deployment despublicado respondem o MESMO 401", async () => {
    // O finder real devolve null nos dois casos; o dublê reproduz isso
    const { deps } = makeDeps();
    const unknown = await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: "ak_chave-que-nao-existe" }),
      deps,
    );
    const unpublished = await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: "ak_deployment-despublicado" }),
      deps,
    );

    expect(unknown.status).toBe(401);
    expect(unpublished.status).toBe(401);
    expect(await unknown.json()).toEqual({ error: MCP_INVALID_KEY_MESSAGE });
    expect(await unpublished.json()).toEqual({
      error: MCP_INVALID_KEY_MESSAGE,
    });
  });

  it("chave inválida (header ou ?token=) chama onAuthFailed com a chave tentada", async () => {
    const { deps, calls } = makeDeps();
    await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: "ak_chave-que-nao-existe" }),
      deps,
    );
    await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: null, queryKey: "ak_token-na-url" }),
      deps,
    );

    expect(calls.authFailures).toEqual([
      "ak_chave-que-nao-existe",
      "ak_token-na-url",
    ]);
  });

  it("sem chave nenhuma chama onAuthFailed com null", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: null }),
      deps,
    );

    expect(response.status).toBe(401);
    expect(calls.authFailures).toEqual([null]);
  });

  it("não chama onAuthFailed quando a chave é válida", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(rpcRequest("tools/list"), deps);

    expect(response.status).toBe(200);
    expect(calls.authFailures).toEqual([]);
  });

  it("quando onAuthFailed devolve 429 (enforce), a resposta é o 429 e não o 401", async () => {
    const blocked = Response.json(
      { error: "Muitas tentativas." },
      { status: 429, headers: { "Retry-After": "42" } },
    );
    const { deps, calls } = makeDeps({ onAuthFailed: async () => blocked });
    const response = await handleMcpRequest(
      rpcRequest("tools/list", {}, { key: "ak_chave-que-nao-existe" }),
      deps,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(response.headers.get("WWW-Authenticate")).toBeNull();
    expect(calls.lookedUpHashes).toEqual([
      hashApiKey("ak_chave-que-nao-existe"),
    ]);
  });
});

describe("handleMcpRequest — Origin e higiene de resposta (US-040)", () => {
  const APP = "https://automl.exemplo.com.br";

  it("Origin diferente de BETTER_AUTH_URL responde 403 antes de autenticar", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/list", {}, { origin: "https://malicioso.example" }),
      deps,
      { expectedOrigin: APP },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: MCP_FORBIDDEN_ORIGIN_MESSAGE,
    });
    // Nem lookup, nem contagem de falha de autenticação, nem predição
    expect(calls.lookedUpHashes).toEqual([]);
    expect(calls.authFailures).toEqual([]);
    expect(calls.predictedRows).toBeNull();
    // Sem CORS: um navegador não consegue ler nem a resposta 403
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("Origin igual à origem do app passa (porta e path normalizados)", async () => {
    const { deps } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest(
        "tools/list",
        {},
        { origin: "https://automl.exemplo.com.br:443" },
      ),
      deps,
      { expectedOrigin: APP },
    );

    expect(response.status).toBe(200);
  });

  it("sem header Origin (cliente MCP de desktop/servidor) segue normalmente", async () => {
    const { deps } = makeDeps();
    const response = await handleMcpRequest(rpcRequest("tools/list"), deps, {
      expectedOrigin: APP,
    });

    expect(response.status).toBe(200);
  });

  it.each([
    ["Origin: null (sandbox/file://)", "null"],
    ["Origin inválido", "isso-nao-e-uma-url"],
    ["mesmo host, esquema diferente", "http://automl.exemplo.com.br"],
    ["subdomínio", "https://evil.automl.exemplo.com.br"],
  ])("Origin estranho responde 403 (%s)", async (_label, origin) => {
    const { deps } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/list", {}, { origin }),
      deps,
      { expectedOrigin: APP },
    );

    expect(response.status).toBe(403);
  });

  it("sem BETTER_AUTH_URL, qualquer Origin presente é recusado", async () => {
    const { deps } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/list", {}, { origin: APP }),
      deps,
      { expectedOrigin: null },
    );

    expect(response.status).toBe(403);
  });

  it("por padrão compara com BETTER_AUTH_URL da env", async () => {
    vi.stubEnv("BETTER_AUTH_URL", APP);
    try {
      const { deps } = makeDeps();
      const ok = await handleMcpRequest(
        rpcRequest("tools/list", {}, { origin: APP }),
        deps,
      );
      expect(ok.status).toBe(200);

      const denied = await handleMcpRequest(
        rpcRequest("tools/list", {}, { origin: "https://malicioso.example" }),
        deps,
      );
      expect(denied.status).toBe(403);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["200 tools/list", () => rpcRequest("tools/list"), 200],
    ["401 sem chave", () => rpcRequest("tools/list", {}, { key: null }), 401],
    [
      "403 Origin estranho",
      () =>
        rpcRequest("tools/list", {}, { origin: "https://malicioso.example" }),
      403,
    ],
  ])(
    "toda resposta sai com X-Content-Type-Options: nosniff e Cache-Control: no-store (%s)",
    async (_label, build, status) => {
      const { deps } = makeDeps();
      const response = await handleMcpRequest(build(), deps, {
        expectedOrigin: APP,
      });

      expect(response.status).toBe(status);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    },
  );

  it("erro de validação da tool não ecoa os valores enviados nem stack", async () => {
    const { deps, calls } = makeDeps();
    const response = await handleMcpRequest(
      rpcRequest("tools/call", {
        name: "predict",
        // idade é number: string inválida com um marcador que não pode voltar
        arguments: { idade: "SEGREDO-4242", cidade: "SEGREDO-4242" },
      }),
      deps,
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("SEGREDO");
    expect(text).not.toMatch(/\bat\s+\w+\s+\(/);
    expect(calls.predictedRows).toBeNull();
  });

  it("falha do worker vira isError com a mensagem controlada, sem os dados", async () => {
    const { deps } = makeDeps({
      predict: async () => {
        throw new Error("O modelo deste deployment não está mais disponível.");
      },
    });
    const response = await handleMcpRequest(
      rpcRequest("tools/call", {
        name: "predict",
        arguments: { idade: 42, obs: "SEGREDO-4242" },
      }),
      deps,
    );

    const text = await response.text();
    expect(text).toContain("não está mais disponível");
    expect(text).not.toContain("SEGREDO");
  });
});

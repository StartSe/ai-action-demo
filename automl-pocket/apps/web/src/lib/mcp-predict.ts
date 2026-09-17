import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z, type ZodType } from "zod";

import { bearerKey, hashApiKey } from "@/lib/api-keys";
import { appOrigin, originMatches } from "@/lib/app-origin";
import { withDeprecation, withPublicApiHeaders } from "@/lib/http-headers";
import type { Prediction, PredictionRow } from "@/lib/predictions";
import type { DeploymentFormField } from "@/components/deployment-form";

/**
 * Lógica do endpoint MCP público POST /api/mcp (US-047), com dependências
 * injetáveis para o teste de integração rodar sem banco/Redis/worker.
 * A rota em src/app/api/mcp/route.ts liga as dependências reais.
 *
 * Streamable HTTP stateless: cada request cria servidor + transporte novos
 * (padrão do SDK oficial); a autenticação é a api_key do deployment MCP via
 * header Authorization: Bearer <chave> ou query param ?token= (clientes que
 * só têm campo de URL, como os conectores do claude.ai).
 *
 * Toda resposta 401 passa por `deps.onAuthFailed` (US-021 da prática):
 * auditoria api.auth_failed + contagem por IP, que em API_AUTH_FAIL_MODE
 * enforce troca o 401 por 429. Chave inexistente e deployment despublicado
 * respondem o MESMO 401 — o cliente não descobre se a chave já existiu.
 *
 * Origem (US-040): clientes MCP (desktop, servidores, conectores) não enviam
 * `Origin`; um navegador envia sempre. Header `Origin` presente e diferente
 * da origem de BETTER_AUTH_URL responde 403 antes de qualquer autenticação —
 * o endpoint nunca é para ser chamado por um site com a chave embutida.
 * `tools/list` expõe só as tools deste deployment (`predict` + `model_info`,
 * ambas presas ao modelo resolvido pela chave). Toda resposta sai com
 * Cache-Control: no-store + X-Content-Type-Options: nosniff.
 */

/** 403 para `Origin` que não é a do app (chamada de navegador/outro site). */
export const MCP_FORBIDDEN_ORIGIN_MESSAGE =
  "Este endpoint não aceita chamadas de navegador nem de outros sites (Origin não permitido).";

/** Uma única mensagem para chave inexistente E deployment despublicado. */
export const MCP_INVALID_KEY_MESSAGE =
  "Chave de API inválida ou não publicada.";

/** Onde a chave veio na requisição — vai na metadata do evento mcp.predict. */
export type McpKeyLocation = "header" | "query";

/** Nome fixo do servidor MCP; o título carrega o nome do projeto. */
export const MCP_SERVER_NAME = "automl-deployment";

/** Deployment MCP resolvido pela chave, com o necessário para a tool predict. */
export type McpPredictTarget = {
  deploymentId: string;
  orgId: string;
  projectId: string;
  /** Nome do projeto — vai na metadata durável de auditoria */
  projectName: string;
  modelId: string;
  /** Título do deployment (nome do projeto) — vira o título do servidor */
  title: string;
  /** Coluna-alvo do treino; null em modelos antigos sem job rastreável */
  target: string | null;
  /** Descrição escrita pelo dono do deployment; entra nas instructions */
  description: string | null;
  /** Métricas de qualidade do modelo (JSON do worker), expostas na model_info */
  metrics: unknown;
  problemType: "classification" | "regression";
  /** Campos selecionados na configuração, na ordem das colunas do modelo */
  formFields: DeploymentFormField[];
};

export type McpPredictDeps = {
  /** Rate limit por chave: 429 pronta ou null para prosseguir. */
  rateLimit(keyHash: string): Promise<Response | null>;
  /** Deployment MCP publicado com este api_key_hash, ou null. */
  findDeploymentByKeyHash(keyHash: string): Promise<McpPredictTarget | null>;
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
   * Auditoria mcp.predict — recebe onde a chave veio (header|query), nunca
   * os dados enviados.
   */
  audit(target: McpPredictTarget, keyLocation: McpKeyLocation): Promise<void>;
};

const MAX_CATEGORY_EXAMPLES = 8;

function fieldSchema(field: DeploymentFormField): ZodType {
  switch (field.type) {
    case "number":
      return z
        .number()
        .describe(`Valor numérico da coluna "${field.name}".`)
        .optional();
    case "category": {
      const examples = field.categories.slice(0, MAX_CATEGORY_EXAMPLES);
      const suffix =
        field.categories.length > MAX_CATEGORY_EXAMPLES ? ", entre outras" : "";
      const description =
        examples.length > 0
          ? `Categoria da coluna "${field.name}". Exemplos: ${examples.join(", ")}${suffix}. Outros valores também são aceitos.`
          : `Categoria da coluna "${field.name}".`;
      return z.string().describe(description).optional();
    }
    case "date":
      return z
        .string()
        .describe(`Data da coluna "${field.name}" no formato AAAA-MM-DD.`)
        .optional();
    default:
      return z.string().describe(`Valor da coluna "${field.name}".`).optional();
  }
}

/**
 * Input schema da tool predict derivado dos campos selecionados: um parâmetro
 * opcional por feature (campos ausentes viram nulos, regra da US-042).
 */
function buildPredictInputSchema(
  fields: DeploymentFormField[],
): Record<string, ZodType> {
  return Object.fromEntries(
    fields.map((field) => [field.name, fieldSchema(field)]),
  );
}

/** Frase em português resumindo a predição, para a resposta da tool. */
export function summarizePrediction(prediction: Prediction): string {
  if ("probabilities" in prediction) {
    const pct = (prediction.probability * 100).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    });
    return `A classe prevista é "${prediction.prediction}", com ${pct}% de probabilidade.`;
  }
  const value =
    typeof prediction.prediction === "number"
      ? prediction.prediction.toLocaleString("pt-BR", {
          maximumFractionDigits: 4,
        })
      : String(prediction.prediction);
  return `O valor previsto é ${value}.`;
}

function buildServer(
  target: McpPredictTarget,
  deps: McpPredictDeps,
  keyLocation: McpKeyLocation,
) {
  const problemLabel =
    target.problemType === "classification" ? "classificação" : "regressão";
  // "prever <alvo>" é o que faz o agente acionar a tool sozinho — sem o alvo
  // na descrição, o cliente MCP não sabe quando o servidor é relevante
  const goal = target.target
    ? `prever "${target.target}"`
    : `fazer predições de ${problemLabel}`;
  const description = target.description?.trim() || null;

  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      title: target.title,
      version: "1.0.0",
    },
    {
      instructions: [
        `Servidor do projeto "${target.title}" na plataforma AutoML, ` +
          `com um modelo de ${problemLabel} treinado para ${goal}.`,
        description,
        `Use a tool predict sempre que o usuário quiser ${goal}, estimar um resultado ` +
          `ou classificar um caso a partir de dados que ele informar. A tool model_info ` +
          `descreve o modelo (alvo, campos, métricas) sem consumir predições.`,
      ]
        .filter(Boolean)
        .join(" "),
    },
  );

  server.registerTool(
    "predict",
    {
      title: `Predição — ${target.title}`,
      description: [
        `Faz uma predição de ${problemLabel} com o modelo do projeto "${target.title}"${
          target.target ? ` para prever "${target.target}"` : ""
        }.`,
        description,
        `Use quando o usuário quiser ${goal} para um caso concreto, informando os ` +
          "dados que conhece. Campos não informados são tratados como valores nulos.",
      ]
        .filter(Boolean)
        .join(" "),
      inputSchema: buildPredictInputSchema(target.formFields),
    },
    async (args: Record<string, unknown>) => {
      // Linha montada só com os campos selecionados; vazio/ausente vira nulo
      const row: PredictionRow = {};
      for (const field of target.formFields) {
        const value = args[field.name];
        row[field.name] = value === undefined || value === "" ? null : value;
      }

      const [prediction] = await deps.predict(target.modelId, [row]);
      await deps.audit(target, keyLocation);

      return {
        content: [
          { type: "text" as const, text: summarizePrediction(prediction) },
          { type: "text" as const, text: JSON.stringify(prediction, null, 2) },
        ],
      };
    },
  );

  // Metadados do modelo, sem auditoria: é o caminho barato para o agente
  // descobrir como preencher a predict (categorias completas, sem o corte de
  // 8 exemplos das descrições dos parâmetros)
  server.registerTool(
    "model_info",
    {
      title: `Sobre o modelo — ${target.title}`,
      description:
        "Descreve o modelo deste servidor: alvo, tipo de problema, campos " +
        "aceitos com a lista completa de categorias e métricas de qualidade. " +
        "Use para entender o que o modelo faz e como preencher a tool predict. " +
        "Não consome predições.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              nome: target.title,
              descricao: description,
              tipo_problema: problemLabel,
              alvo: target.target,
              campos: target.formFields.map((field) => ({
                nome: field.name,
                tipo: field.type,
                ...(field.type === "category"
                  ? { categorias: field.categories }
                  : {}),
              })),
              metricas: target.metrics ?? null,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  return server;
}

/** Único caminho para responder 401: registra a falha (e o eventual 429) antes. */
async function unauthorized(
  deps: McpPredictDeps,
  message: string,
  attemptedKey: string | null,
): Promise<Response> {
  const blocked = await deps.onAuthFailed(attemptedKey);
  if (blocked) return blocked;
  return Response.json(
    { error: message },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="mcp"' } },
  );
}

/**
 * Chave da requisição: header Authorization (canônico) ou query param ?token=,
 * fallback para clientes que só têm campo de URL (estilo Zapier MCP). O header
 * tem precedência quando os dois vierem. Devolve também a origem, que vai na
 * auditoria (keyLocation) para medir quem ainda usa a URL.
 */
function extractKey(
  request: Request,
): { key: string; location: McpKeyLocation } | null {
  const fromHeader = bearerKey(request.headers.get("authorization"));
  if (fromHeader) return { key: fromHeader, location: "header" };
  const fromQuery = new URL(request.url).searchParams.get("token")?.trim();
  return fromQuery ? { key: fromQuery, location: "query" } : null;
}

/**
 * Trata uma requisição MCP (Streamable HTTP, stateless): autentica pela chave
 * do deployment, aplica rate limit por chave e delega o JSON-RPC ao SDK.
 * 401 chave ausente/inválida, 429 rate limit; o restante segue o protocolo.
 */
export type McpRequestOptions = {
  /**
   * Origem do app para comparar com o header Origin (default `appOrigin()`,
   * de BETTER_AUTH_URL). Null = não há com o que comparar: qualquer Origin
   * presente é recusado, porque navegador nunca deveria chamar o MCP.
   */
  expectedOrigin?: string | null;
};

export async function handleMcpRequest(
  request: Request,
  deps: McpPredictDeps,
  options: McpRequestOptions = {},
): Promise<Response> {
  // Headers obrigatórios em TODA saída (200, 4xx, 5xx) — por isso o wrapper
  return withPublicApiHeaders(await mcpRequest(request, deps, options));
}

async function mcpRequest(
  request: Request,
  deps: McpPredictDeps,
  options: McpRequestOptions,
): Promise<Response> {
  // Origem antes de tudo: nem rate limit nem lookup para chamada de navegador
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const expectedOrigin =
      options.expectedOrigin === undefined
        ? appOrigin()
        : options.expectedOrigin;
    if (!originMatches(origin, expectedOrigin)) {
      return Response.json(
        { error: MCP_FORBIDDEN_ORIGIN_MESSAGE },
        { status: 403 },
      );
    }
  }

  const extracted = extractKey(request);
  if (!extracted) {
    return unauthorized(
      deps,
      "Informe a chave de API no header Authorization: Bearer <chave> ou no parâmetro ?token= da URL.",
      null,
    );
  }

  const deprecate = <T extends Response>(response: T): T =>
    extracted.location === "query" ? withDeprecation(response) : response;

  // Rate limit antes da consulta: também freia tentativas de chave inválida
  const keyHash = hashApiKey(extracted.key);
  const limited = await deps.rateLimit(keyHash);
  if (limited) return deprecate(limited);

  const target = await deps.findDeploymentByKeyHash(keyHash);
  if (!target) {
    return deprecate(
      await unauthorized(deps, MCP_INVALID_KEY_MESSAGE, extracted.key),
    );
  }

  // Stateless: servidor e transporte novos por request, sem sessão
  const server = buildServer(target, deps, extracted.location);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  // ?token= na URL é canal descontinuado (US-039): avisa sem mudar status/corpo
  return deprecate(await transport.handleRequest(request));
}

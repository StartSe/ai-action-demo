// Camada única de acesso à IA via OpenRouter (API compatível com OpenAI).
// Sem OPENROUTER_API_KEY o app entra em modo demonstração (ver lib/demo.ts).

import { getConfig } from "./store";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Modelo padrão gratuito. Troque por OPENROUTER_MODEL (ex.: "anthropic/claude-sonnet-4.5") quando quiser um modelo pago.
export const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
// Se o modelo principal falhar (fila cheia, indisponível), o OpenRouter tenta estes em ordem.
export const FALLBACK_MODELS = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free"];

function apiKey(): string | undefined {
  return getConfig("OPENROUTER_API_KEY");
}

export function aiEnabled(): boolean {
  return Boolean(apiKey());
}

export function modelName(): string {
  return getConfig("OPENROUTER_MODEL") || DEFAULT_MODEL;
}

type Message = { role: "system" | "user" | "assistant"; content: string };

export async function askText({ system, prompt, maxTokens = 4000, temperature = 0.4 }: { system: string; prompt: string; maxTokens?: number; temperature?: number }): Promise<string> {
  const messages: Message[] = [{ role: "system", content: system }, { role: "user", content: prompt }];
  const fallbacks = (getConfig("OPENROUTER_FALLBACK_MODELS") || FALLBACK_MODELS.join(",")).split(",").map((m) => m.trim()).filter(Boolean);
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": getConfig("APP_URL") || "http://localhost:3000",
      "X-Title": getConfig("APP_NAME") || "IA para Executivos",
    },
    body: JSON.stringify({
      model: modelName(),
      models: [modelName(), ...fallbacks],
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Chave do OpenRouter inválida. Confira em /setup.");
    if (res.status === 429) throw new Error("O modelo gratuito está com fila cheia agora. Tente de novo em alguns segundos ou escolha outro modelo em /setup.");
    throw new Error(`A IA não respondeu (HTTP ${res.status}). ${detalhe.slice(0, 200)}`);
  }
  const data = await res.json();
  const texto = data?.choices?.[0]?.message?.content;
  if (!texto) throw new Error("A IA devolveu uma resposta vazia. Tente novamente.");
  return String(texto);
}

export async function askJSON<T = unknown>(opts: { system: string; prompt: string; maxTokens?: number }): Promise<T> {
  const system = `${opts.system}\n\nResponda somente com JSON válido, sem comentários e sem blocos de código markdown.`;
  const texto = await askText({ ...opts, system, temperature: 0.2 });
  return parseJSON<T>(texto);
}

export function parseJSON<T = unknown>(text: string): T {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const inicios = ["{", "["].map((c) => t.indexOf(c)).filter((i) => i >= 0);
  const start = inicios.length ? Math.min(...inicios) : 0;
  if (start > 0) t = t.slice(start);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (end > 0) t = t.slice(0, end + 1);
  return JSON.parse(t) as T;
}

// --- Tool calling (function calling) para agentes que operam ferramentas externas. ---
// Formato compatível com a API da OpenAI, servido pelo mesmo endpoint do OpenRouter.

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ToolMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/**
 * Loop manual de tool calling: envia `messages` + `tools`, e enquanto o modelo pedir
 * `finish_reason === "tool_calls"`, executa cada chamada via `executeTool` e devolve o
 * resultado como mensagem `role: "tool"`. Retorna o texto final do assistente.
 */
export async function askWithTools({
  system,
  messages,
  tools,
  executeTool,
  maxTokens = 4000,
  maxIterations = 8,
}: {
  system: string;
  messages: ToolMessage[];
  tools: ToolDefinition[];
  executeTool: (nome: string, args: Record<string, unknown>) => Promise<unknown>;
  maxTokens?: number;
  maxIterations?: number;
}): Promise<string> {
  const fallbacks = (getConfig("OPENROUTER_FALLBACK_MODELS") || FALLBACK_MODELS.join(",")).split(",").map((m) => m.trim()).filter(Boolean);
  const historico: ToolMessage[] = [{ role: "system", content: system }, ...messages];

  for (let iteracao = 0; iteracao < maxIterations; iteracao++) {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": getConfig("APP_URL") || "http://localhost:3000",
        "X-Title": getConfig("APP_NAME") || "IA para Executivos",
      },
      body: JSON.stringify({
        model: modelName(),
        models: [modelName(), ...fallbacks],
        messages: historico,
        tools,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("Chave do OpenRouter inválida. Confira em /setup.");
      if (res.status === 429) throw new Error("O modelo gratuito está com fila cheia agora. Tente de novo em alguns segundos ou escolha outro modelo em /setup.");
      throw new Error(`A IA não respondeu (HTTP ${res.status}). ${detalhe.slice(0, 200)}`);
    }
    const data = await res.json();
    const escolha = data?.choices?.[0];
    const mensagem = escolha?.message;
    if (!mensagem) throw new Error("A IA devolveu uma resposta vazia. Tente novamente.");

    if (escolha.finish_reason !== "tool_calls" || !mensagem.tool_calls?.length) {
      return String(mensagem.content || "");
    }

    historico.push({ role: "assistant", content: mensagem.content ?? null, tool_calls: mensagem.tool_calls });
    for (const chamada of mensagem.tool_calls as ToolCall[]) {
      let resultado: unknown;
      try {
        const args = chamada.function.arguments ? JSON.parse(chamada.function.arguments) : {};
        resultado = await executeTool(chamada.function.name, args);
      } catch (err) {
        resultado = { erro: err instanceof Error ? err.message : "Falha ao executar a ação." };
      }
      historico.push({ role: "tool", tool_call_id: chamada.id, content: JSON.stringify(resultado) });
    }
  }

  return "";
}

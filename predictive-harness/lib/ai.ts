// O modelo de linguagem do harness: raciocina e escreve. ChatGPT (assinatura, pelo Codex App Server)
// ou um modelo do OpenRouter, escolhidos explicitamente em Configurações. Nunca há fallback silencioso
// entre provedores; as decisões rápidas ficam em lib/jev.ts.
import { getConfig } from "./store";
import { chatGPT } from "./chatgpt";
import { AppError } from "./api";
export type Provedor = "chatgpt" | "openrouter";
export type AIConfig = { provider: Provedor; model: string; modelForte: string };
export function aiConfig(): AIConfig {
  return {
    provider: getConfig("AI_PROVIDER") === "openrouter" ? "openrouter" : "chatgpt",
    model: getConfig("AI_MODEL") || "",
    modelForte: getConfig("AI_MODEL_FORTE") || "",
  };
}
export async function contaChatGPT() {
  return chatGPT()
    .account()
    .catch(() => ({ account: null, login: null, error: "ChatGPT indisponível no servidor. Tente reconectar." }));
}
export async function conversaPronta(config = aiConfig()) {
  if (config.provider === "openrouter") return !!getConfig("OPENROUTER_API_KEY");
  return !!(await contaChatGPT()).account;
}
export function rotuloModelo(config = aiConfig(), forte = false) {
  const m = forte && config.modelForte ? config.modelForte : config.model;
  if (config.provider === "chatgpt") return m ? `ChatGPT · ${m}` : "ChatGPT · automático";
  return m ? `OpenRouter · ${m}` : "OpenRouter · automático";
}
export type Pedido = { system: string; prompt: string; forte?: boolean; maxTokens?: number; signal?: AbortSignal; fetcher?: typeof fetch };
export async function perguntar({ system, prompt, forte = false, maxTokens = 3000, signal, fetcher = fetch }: Pedido): Promise<string> {
  const config = aiConfig();
  const model = (forte && config.modelForte) || config.model;
  if (config.provider === "chatgpt") {
    if (!(await contaChatGPT()).account) throw new AppError("Conecte o ChatGPT em Configurações ou escolha um modelo do OpenRouter.", 409);
    return chatGPT().run({ system, prompt, model: model || undefined, signal });
  }
  const key = getConfig("OPENROUTER_API_KEY");
  if (!key) throw new AppError("Conecte o OpenRouter em Configurações para conversar sobre os dados.", 409);
  const response = await fetcher("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "Predictive Harness",
      "HTTP-Referer": "https://github.com/StartSe/ai-action-demo",
    },
    body: JSON.stringify({
      model: model || "openrouter/auto",
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok)
    throw new AppError(
      response.status === 401 ? "A chave do OpenRouter não foi aceita. Reconecte em Configurações."
        : response.status === 402 ? "O saldo do OpenRouter é insuficiente. Adicione créditos ou escolha outro modelo."
        : response.status === 429 ? "O modelo atingiu seu limite. Espere um pouco ou escolha outro modelo."
        : "O provedor não concluiu a resposta. Tente novamente.",
      502,
    );
  const data = await response.json();
  if (data.error) throw new AppError("O provedor interrompeu a resposta. Tente outro modelo.", 502);
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AppError("O modelo devolveu uma resposta vazia. Tente outro modelo.", 502);
  return text;
}
export function parseJSON<T = unknown>(text: string): T | null {
  const limpo = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(limpo) as T;
  } catch {
    const inicio = limpo.search(/[[{]/);
    const fim = Math.max(limpo.lastIndexOf("]"), limpo.lastIndexOf("}"));
    if (inicio >= 0 && fim > inicio) {
      try {
        return JSON.parse(limpo.slice(inicio, fim + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
let cacheModelos: { at: number; modelos: { id: string; name: string }[] } | null = null;
/** Catálogo público do OpenRouter, guardado por uma hora. Só modelos de texto com "/" no id. */
export async function modelosOpenRouter(force = false) {
  if (!force && cacheModelos && Date.now() - cacheModelos.at < 3600_000) return cacheModelos.modelos;
  const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new AppError("O OpenRouter não devolveu a lista de modelos.", 502);
  const data = (await r.json()) as { data?: { id: string; name?: string; architecture?: { output_modalities?: string[] } }[] };
  const modelos = (data.data || [])
    .filter((m) => typeof m.id === "string" && m.id.includes("/") && !m.id.startsWith("typesafe/") && (m.architecture?.output_modalities || ["text"]).includes("text"))
    .map((m) => ({ id: m.id, name: m.name || m.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  cacheModelos = { at: Date.now(), modelos };
  return modelos;
}

import { getConfig } from "./store";
import { chatGPT } from "./chatgpt";
import { AppError } from "./api";
export type AIConfig = { provider: "chatgpt" | "openrouter"; model: string };
export function aiConfig(): AIConfig {
  return {
    provider: getConfig("AI_PROVIDER") === "chatgpt" ? "chatgpt" : "openrouter",
    model: getConfig("AI_MODEL") || "",
  };
}
export async function connected(config = aiConfig()) {
  if (config.provider === "openrouter")
    return !!getConfig("OPENROUTER_API_KEY");
  return !!(await chatGPT().account()).account;
}
export async function ask(
  system: string,
  prompt: string,
  signal?: AbortSignal,
  config = aiConfig(),
  fetcher = fetch,
): Promise<string> {
  if (config.provider === "chatgpt")
    return chatGPT().run({
      system,
      prompt,
      model: config.model || undefined,
      signal,
    });
  const key = getConfig("OPENROUTER_API_KEY");
  if (!key)
    throw new AppError(
      "Conecte o ChatGPT ou o OpenRouter em Conexões para gerar seu mapa.",
    );
  const response = await fetcher(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(180000)])
        : AbortSignal.timeout(180000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Mapify",
        "HTTP-Referer": "https://github.com/StartSe/ai-action-demo",
      },
      body: JSON.stringify({
        model: config.model || "openrouter/auto",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: 10000,
      }),
    },
  );
  if (!response.ok)
    throw new AppError(
      response.status === 401
        ? "A chave do OpenRouter não foi aceita. Reconecte em Conexões."
        : response.status === 402
          ? "O saldo do OpenRouter é insuficiente. Adicione créditos ou escolha outro modelo."
          : response.status === 429
            ? "O modelo atingiu seu limite. Espere um pouco ou escolha outro modelo."
            : "O provedor não concluiu a resposta. Tente novamente.",
    );
  const data = await response.json();
  if (data.error)
    throw new AppError(
      "O provedor interrompeu a resposta. Tente outro modelo.",
    );
  if (data.choices?.[0]?.finish_reason === "length")
    throw new AppError(
      "A resposta ficou incompleta. Escolha um mapa mais resumido ou outro modelo.",
    );
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim())
    throw new AppError(
      "O modelo devolveu uma resposta vazia. Tente outro modelo.",
    );
  return text;
}
export function parseJSON(text: string) {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(clean);
  } catch {
    throw new AppError(
      "A IA não retornou um mapa válido. Tente gerar novamente ou escolha outro modelo.",
    );
  }
}
let cache: { at: number; models: { id: string; name: string }[] } | undefined;
export async function openrouterModels() {
  if (cache && Date.now() - cache.at < 3600000) return cache.models;
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new AppError(
      "Não foi possível carregar os modelos. Tente novamente.",
    );
  const data = await response.json();
  const models = (data.data as { id: string; name: string }[])
    .map((m) => ({ id: m.id, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  cache = { at: Date.now(), models };
  return models;
}

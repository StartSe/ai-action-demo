import { chatGPT, type AgentTool } from "./chatgpt";
import { getConfig } from "./store";
import { BrainError } from "./api";
export function provider() {
  return getConfig("BRAIN_PROVIDER") === "openrouter"
    ? "openrouter"
    : "chatgpt";
}
export async function connected() {
  return provider() === "openrouter"
    ? !!getConfig("OPENROUTER_API_KEY")
    : !!(await chatGPT().account()).account;
}
export async function generate(
  system: string,
  prompt: string,
  tools: AgentTool[] = [],
  signal?: AbortSignal,
): Promise<string> {
  const timeout = AbortSignal.any([
    AbortSignal.timeout(180000),
    ...(signal ? [signal] : []),
  ]);
  if (provider() === "chatgpt")
    return chatGPT().run({
      system,
      prompt,
      tools,
      signal: timeout,
      model: getConfig("CHATGPT_MODEL") || undefined,
    });
  const key = getConfig("OPENROUTER_API_KEY");
  if (!key)
    throw new BrainError(
      "Conecte sua IA em Conexões para trabalhar com suas memórias.",
    );
  const messages: Record<string, unknown>[] = [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];
  for (let round = 0; round < 8; round++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: timeout,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Daily Second Brain",
      },
      body: JSON.stringify({
        model: getConfig("OPENROUTER_MODEL") || "openrouter/auto",
        messages,
        max_completion_tokens: 7000,
        ...(tools.length
          ? {
              tools: tools.map((t) => ({
                type: "function",
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.schema,
                },
              })),
            }
          : {}),
      }),
    });
    if (!res.ok)
      throw new BrainError(
        res.status === 402
          ? "O OpenRouter está sem créditos."
          : res.status === 401
            ? "Confira a chave do OpenRouter em Conexões."
            : "O OpenRouter não respondeu. Tente novamente.",
        502,
      );
    const data = await res.json();
    const m = data?.choices?.[0]?.message;
    if (!m) throw new BrainError("A IA devolveu uma resposta vazia.", 502);
    if (!m.tool_calls?.length) {
      if (!m.content) throw new BrainError("A IA não devolveu texto.", 502);
      return String(m.content);
    }
    messages.push(m);
    for (const call of m.tool_calls.slice(0, 8)) {
      const tool = tools.find((t) => t.name === call.function.name);
      let content: string;
      try {
        if (!tool) throw Error("Ferramenta indisponível");
        content = await tool.call(JSON.parse(call.function.arguments || "{}"));
      } catch {
        content =
          "Não foi possível preparar essa ação. Verifique os argumentos.";
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  throw new BrainError(
    "Limite de etapas atingido. Divida o pedido em partes menores.",
  );
}

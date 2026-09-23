import { api, body, string, AppError } from "@/lib/api";
import { aiConfig, openrouterModels } from "@/lib/ai";
import { getConfig, setConfig } from "@/lib/store";
import { chatGPT } from "@/lib/chatgpt";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(async () => {
    const config = aiConfig();
    const provider =
      new URL(req.url).searchParams.get("provider") || config.provider;
    const chat = await chatGPT()
      .account()
      .catch(() => ({
        account: null,
        error: "ChatGPT indisponível. Tente reconectar.",
      }));
    let error: string | undefined;
    const models = await (
      provider === "chatgpt"
        ? chat.account
          ? chatGPT().models()
          : Promise.resolve([])
        : openrouterModels()
    ).catch((e) => {
      error = e.message;
      return [];
    });
    return {
      ...config,
      openrouter: !!getConfig("OPENROUTER_API_KEY"),
      chatgpt: !!chat.account,
      email: chat.account?.email,
      models,
      error,
    };
  });
}
export async function PUT(req: Request) {
  return api(async () => {
    const b = await body(req);
    if (b.provider !== "chatgpt" && b.provider !== "openrouter")
      throw new AppError("Escolha o provedor de IA.");
    const key = string(b.key, 1000);
    if (key) {
      const response = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new AppError(
          "A chave não foi aceita pelo OpenRouter. Confira e tente novamente.",
        );
      setConfig("OPENROUTER_API_KEY", key);
    }
    if (b.disconnect === true) setConfig("OPENROUTER_API_KEY", null);
    setConfig("AI_PROVIDER", b.provider);
    setConfig("AI_MODEL", string(b.model, 200));
    return { ok: true };
  });
}

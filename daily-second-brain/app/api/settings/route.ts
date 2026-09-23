import { api, body, BrainError } from "@/lib/api";
import { getConfig, setConfig } from "@/lib/store";
import { provider } from "@/lib/motor";
import { validateZapier } from "@/lib/zapier";
export const dynamic = "force-dynamic";
function settings() {
  return {
    provider: provider(),
    model:
      getConfig(
        provider() === "chatgpt" ? "CHATGPT_MODEL" : "OPENROUTER_MODEL",
      ) || "",
    openrouter: !!getConfig("OPENROUTER_API_KEY"),
    elevenlabs: !!getConfig("ELEVENLABS_API_KEY"),
    zapier: !!getConfig("ZAPIER_MCP_URL"),
    voice: getConfig("ELEVENLABS_VOICE_ID") || "",
  };
}
export async function GET(req: Request) {
  return api(async () => {
    if (new URL(req.url).searchParams.has("models")) {
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new BrainError("Catálogo indisponível agora.", 502);
      const j = await r.json();
      return j.data.map((x: { id: string; name: string }) => ({
        id: x.id,
        name: x.name,
      }));
    }
    return settings();
  });
}
export async function PUT(req: Request) {
  return api(async () => {
    const b = await body(req);
    const allowed = [
      "BRAIN_PROVIDER",
      "CHATGPT_MODEL",
      "OPENROUTER_MODEL",
      "OPENROUTER_API_KEY",
      "ELEVENLABS_API_KEY",
      "ELEVENLABS_VOICE_ID",
      "ZAPIER_MCP_URL",
      "ZAPIER_MCP_TOKEN",
    ];
    for (const [k, v] of Object.entries(b)) {
      if (
        !allowed.includes(k) ||
        (v !== null && (typeof v !== "string" || v.length > 4000))
      )
        throw new BrainError("Configuração inválida.");
      if (
        k === "BRAIN_PROVIDER" &&
        !["chatgpt", "openrouter"].includes(String(v))
      )
        throw new BrainError("Escolha ChatGPT ou OpenRouter.");
      if (k === "ZAPIER_MCP_URL" && v) validateZapier(String(v));
    }
    for (const [k, v] of Object.entries(b)) setConfig(k, v as string | null);
    return settings();
  });
}

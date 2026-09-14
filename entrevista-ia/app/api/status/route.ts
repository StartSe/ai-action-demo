import { aiEnabled, modelName, visionEnabled } from "@/lib/ai";
import { INTEGRACOES } from "@/lib/integracoes";
import { integracaoConfigurada } from "@/lib/setup-comum";
import { ligacaoEnabled, ttsEnabled } from "@/lib/voz";

export const dynamic = "force-dynamic";

export async function GET() {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  return Response.json({
    ai: aiEnabled(),
    demo: !aiEnabled(),
    model: modelName(),
    vision: visionEnabled(),
    integrations: { tts: ttsEnabled(), ligacao: ligacaoEnabled() },
    setup: { pronto, url: "/setup" },
  });
}

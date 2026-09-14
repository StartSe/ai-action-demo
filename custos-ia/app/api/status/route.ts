import { aiEnabled, modelName, visionEnabled } from "@/lib/ai";
import { CAMBIO, INTEGRACOES } from "@/lib/integracoes";
import { integracaoConfigurada, NOTIFICACOES, OPENROUTER } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function GET() {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  return Response.json({
    ai: aiEnabled(),
    demo: !aiEnabled(),
    model: modelName(),
    vision: visionEnabled(),
    integrations: { openrouter: integracaoConfigurada(OPENROUTER), notificacoes: integracaoConfigurada(NOTIFICACOES), cambio: integracaoConfigurada(CAMBIO) },
    setup: { pronto, url: "/setup" },
  });
}

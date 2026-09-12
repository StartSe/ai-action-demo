import { aiEnabled, modelName } from "@/lib/ai";
import { INTEGRACOES } from "@/lib/integracoes";
import { trelloAutorizado } from "@/lib/quadro";
import { integracaoConfigurada } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function GET() {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  return Response.json({
    ai: aiEnabled(),
    demo: !aiEnabled(),
    model: modelName(),
    integrations: { trello: trelloAutorizado() },
    setup: { pronto, url: "/setup" },
  });
}

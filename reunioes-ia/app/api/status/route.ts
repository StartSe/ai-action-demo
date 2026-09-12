import { aiEnabled, modelName } from "@/lib/ai";
import { INTEGRACOES } from "@/lib/integracoes";
import { integracaoConfigurada } from "@/lib/setup-comum";
import { transcricaoEnabled } from "@/lib/transcricao";

export const dynamic = "force-dynamic";

export async function GET() {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  return Response.json({
    ai: aiEnabled(),
    demo: !aiEnabled(),
    model: modelName(),
    integrations: { transcricao: transcricaoEnabled() },
    setup: { pronto, url: "/setup" },
  });
}

import { aiEnabled, modelName, visionEnabled } from "@/lib/ai";
import { INTEGRACOES, PROSPECTHALO } from "@/lib/integracoes";
import { integracaoConfigurada } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function GET() {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  return Response.json({ ai: aiEnabled(), demo: !aiEnabled(), model: modelName(), vision: visionEnabled(), integrations: { prospecthalo: integracaoConfigurada(PROSPECTHALO) }, setup: { pronto, url: "/setup" } });
}

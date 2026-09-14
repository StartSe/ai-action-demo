import { aiEnabled, modelName, visionEnabled } from "@/lib/ai";
import { exaEnabled } from "@/lib/busca";
import { INTEGRACOES } from "@/lib/integracoes";
import { integracaoConfigurada } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function GET() {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  return Response.json({ ai: aiEnabled(), demo: !aiEnabled(), model: modelName(), vision: visionEnabled(), integrations: { exa: exaEnabled() }, setup: { pronto, url: "/setup" } });
}

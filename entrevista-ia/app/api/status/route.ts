import { aiEnabled, modelName, visionEnabled } from "@/lib/ai";
import { INTEGRACOES } from "@/lib/integracoes";
import { integracaoConfigurada } from "@/lib/setup-comum";
import { statusExtra } from "@/lib/status-do-app";

export const dynamic = "force-dynamic";

export async function GET() {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  const integrations: Record<string, boolean> = Object.fromEntries(INTEGRACOES.map((i) => [i.id, integracaoConfigurada(i)]));
  Object.assign(integrations, statusExtra());
  return Response.json({ ai: aiEnabled(), demo: !aiEnabled(), model: modelName(), vision: visionEnabled(), integrations, setup: { pronto, url: "/setup" } });
}

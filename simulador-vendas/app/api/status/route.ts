import { aiEnabled, modelName, visionEnabled } from "@/lib/ai";
import { sessaoAtual } from "@/lib/conta";
import { INTEGRACOES } from "@/lib/integracoes";
import { calcularProximos, integracaoConfigurada } from "@/lib/setup-comum";
import { statusExtra } from "@/lib/status-do-app";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  const usuario = sessaoAtual(req);
  const proximos = calcularProximos(INTEGRACOES);
  const integrations: Record<string, boolean> = Object.fromEntries(INTEGRACOES.map((i) => [i.id, integracaoConfigurada(i)]));
  Object.assign(integrations, statusExtra());
  return Response.json({ ai: aiEnabled(), demo: !aiEnabled(), model: modelName(), vision: visionEnabled(), integrations, setup: { pronto, url: "/setup" }, usuario, proximos }, { headers: { "Cache-Control": "no-store" } });
}

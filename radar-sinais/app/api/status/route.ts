import { aiEnabled, aiProvider, modelName, visionEnabled } from "@/lib/ai";
import { sessaoAtual } from "@/lib/conta";
import { INTEGRACOES } from "@/lib/integracoes";
import { calcularProximos, integracaoConfigurada } from "@/lib/setup-comum";
import { exemplosVisiveis } from "@/lib/radar-historico";
import { statusExtra } from "@/lib/status-do-app";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ai = await aiEnabled();
  const pronto = ai;
  const usuario = sessaoAtual(req);
  const proximos = calcularProximos(INTEGRACOES).filter(i => i.id !== "openrouter");
  if (!ai) proximos.unshift({ id: "ia", titulo: "Inteligência artificial", beneficio: "Escolha OpenRouter ou ChatGPT para analisar seus temas", url: "/setup#ia" });
  const integrations: Record<string, boolean> = Object.fromEntries(INTEGRACOES.map((i) => [i.id, integracaoConfigurada(i)]));
  Object.assign(integrations, statusExtra());
  return Response.json({ ai, demo: !ai, provedor: aiProvider(), exemplos: exemplosVisiveis(ai), model: modelName(), vision: visionEnabled(), integrations, setup: { pronto, url: "/setup" }, usuario, proximos });
}

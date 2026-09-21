import { aiEnabled, aiProvider, modelName, visionEnabled } from "@/lib/ai";
import { sessaoAtual } from "@/lib/conta";
import { INTEGRACOES } from "@/lib/integracoes";
import { calcularProximos, integracaoConfigurada } from "@/lib/setup-comum";
import { statusExtra } from "@/lib/status-do-app";

export const dynamic = "force-dynamic";

/** Divergência registrada em scripts/padrao-excecoes.json: a IA deste app pode vir do OpenRouter ou de uma
 * conta ChatGPT (lib/ai.ts:aiProvider), então `ai` e `setup.pronto` saem de aiEnabled() — nunca só da chave
 * do OpenRouter — e a sugestão "Inteligência artificial" só aparece enquanto nenhuma das duas contas está
 * conectada. Notificações fica fora de `proximos` porque este app esconde esse cartão em /setup
 * (components/setup.tsx): sugerir um cartão que não existe na tela levaria a lugar nenhum. */
export async function GET(req: Request) {
  const ai = await aiEnabled();
  const usuario = sessaoAtual(req);
  const proximos = calcularProximos(INTEGRACOES).filter((i) => i.id !== "openrouter" && i.id !== "notificacoes");
  if (!ai) proximos.unshift({ id: "ia", titulo: "Inteligência artificial", beneficio: "Conecte o OpenRouter ou sua conta ChatGPT para qualificar leads e escrever abordagens", url: "/setup#openrouter" });
  const integrations: Record<string, boolean> = Object.fromEntries(INTEGRACOES.map((i) => [i.id, integracaoConfigurada(i)]));
  Object.assign(integrations, statusExtra(), { ia: ai });
  return Response.json({ ai, demo: !ai, provedor: aiProvider(), model: modelName(), vision: visionEnabled(), integrations, setup: { pronto: ai, url: "/setup" }, usuario, proximos });
}

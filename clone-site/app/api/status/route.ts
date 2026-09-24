// Divergência de propósito em relação ao pdi-time (registrada em scripts/padrao-excecoes.json): a IA deste app
// pode ser o OpenRouter (chave) OU o ChatGPT (assinatura conectada pelo Codex App Server), escolhido em
// /setup#ia. `ai`/`demo` seguem lib/motor.ts:iaDisponivel(); `integrations.chatgpt` diz se a conta está
// conectada; a leitura de captura também segue o provedor principal.
import { modelName } from "@/lib/ai";
import { sessaoAtual } from "@/lib/conta";
import { INTEGRACOES } from "@/lib/integracoes";
import { chatgptConectado, iaDisponivel, nomeModeloChatGPT, provedor } from "@/lib/motor";
import { calcularProximos, integracaoConfigurada } from "@/lib/setup-comum";
import { statusExtra } from "@/lib/status-do-app";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ai = await iaDisponivel();
  const usarChatGPT = provedor() === "chatgpt";
  const chatgpt = usarChatGPT ? ai : await chatgptConectado();
  const pronto = ai && INTEGRACOES.filter((i) => i.obrigatoria && i.id !== "openrouter").every(integracaoConfigurada);
  const usuario = sessaoAtual(req);
  // Com o ChatGPT conectado, a chave do OpenRouter deixa de ser "o próximo passo" obrigatório: vira opcional (leitura de captura).
  const proximos = calcularProximos(INTEGRACOES).filter((i) => !(usarChatGPT && ai && i.id === "openrouter"));
  if (!ai) proximos.unshift({ id: "ia", titulo: "Inteligência artificial", beneficio: "Escolha OpenRouter ou ChatGPT para criar e editar os sites", url: "/setup#ia" });
  const integrations: Record<string, boolean> = Object.fromEntries(INTEGRACOES.map((i) => [i.id, integracaoConfigurada(i)]));
  integrations.chatgpt = chatgpt;
  Object.assign(integrations, statusExtra());
  return Response.json({ ai, demo: !ai, provedor: provedor(), model: usarChatGPT ? nomeModeloChatGPT() : modelName(), vision: ai, integrations, setup: { pronto, url: "/setup" }, usuario, proximos });
}

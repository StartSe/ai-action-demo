// Estado da tela Configurações: ChatGPT, OpenRouter (com o Jev) e o modelo da conversa.
// Só chaves conhecidas são gravadas; segredos voltam mascarados (lib/store.ts).
import { getConfig, setConfig, mascarar, origemConfig } from "./store";
import { AppError, string } from "./api";
import { aiConfig, contaChatGPT, modelosOpenRouter } from "./ai";
import { chatGPT } from "./chatgpt";
import { decidir, jevDisponivel, JEV_MODELO, TESTE_JEV } from "./jev";
import type { StatusConexoes } from "./types";

export async function statusConexoes(provedorParaModelos?: string): Promise<StatusConexoes> {
  const config = aiConfig();
  const chat = await contaChatGPT();
  const provider = provedorParaModelos === "chatgpt" || provedorParaModelos === "openrouter" ? provedorParaModelos : config.provider;
  let erro: string | undefined;
  const modelos = await (provider === "chatgpt"
    ? chat.account ? chatGPT().models() : Promise.resolve([])
    : getConfig("OPENROUTER_API_KEY") ? modelosOpenRouter() : Promise.resolve([])
  ).catch((e: Error) => {
    erro = e.message;
    return [] as { id: string; name: string }[];
  });
  const openrouter = !!getConfig("OPENROUTER_API_KEY");
  let ultimoTeste: StatusConexoes["jev"]["ultimoTeste"] = null;
  try {
    ultimoTeste = JSON.parse(getConfig("JEV_ULTIMO_TESTE") || "null");
  } catch {
    ultimoTeste = null;
  }
  const conversaPronta = config.provider === "chatgpt" ? !!chat.account : openrouter;
  return {
    provider: config.provider,
    model: config.model,
    modelForte: config.modelForte,
    chatgpt: { conectado: !!chat.account, email: chat.account?.email, plano: chat.account?.planType, login: chat.login ? { verificationUrl: chat.login.verificationUrl, userCode: chat.login.userCode } : null, erro: chat.error },
    openrouter: { conectado: openrouter, mascarado: mascarar(getConfig("OPENROUTER_API_KEY")), origem: origemConfig("OPENROUTER_API_KEY") },
    jev: { disponivel: jevDisponivel(), modelo: JEV_MODELO, caminho: getConfig("JEV_CAMINHO") || null, ultimoTeste },
    harnessPronto: openrouter && conversaPronta,
    conversaPronta,
    modelos,
    erro,
  };
}

export async function salvarConexoes(b: Record<string, unknown>) {
  if (b.provider !== undefined && b.provider !== "chatgpt" && b.provider !== "openrouter") throw new AppError("Escolha o provedor da conversa.");
  const key = string(b.key, 1000);
  if (key) {
    const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new AppError("A chave não foi aceita pelo OpenRouter. Confira e tente novamente.");
    setConfig("OPENROUTER_API_KEY", key);
    setConfig("JEV_CAMINHO", null);
    setConfig("JEV_ULTIMO_TESTE", null);
  }
  if (b.disconnect === true) {
    setConfig("OPENROUTER_API_KEY", null);
    setConfig("JEV_CAMINHO", null);
    setConfig("JEV_ULTIMO_TESTE", null);
  }
  if (b.provider !== undefined) setConfig("AI_PROVIDER", b.provider as string);
  if (b.model !== undefined) setConfig("AI_MODEL", string(b.model, 200) || null);
  if (b.modelForte !== undefined) setConfig("AI_MODEL_FORTE", string(b.modelForte, 200) || null);
}

/** "Testar decisão": uma chamada real e pequena ao Jev, para confirmar endereço, chave e formato. */
export async function testarJev() {
  const d = await decidir(TESTE_JEV.state, TESTE_JEV.questions);
  const resumo = { ok: true, latenciaMs: d.latenciaMs, quando: new Date().toISOString() };
  setConfig("JEV_ULTIMO_TESTE", JSON.stringify(resumo));
  return {
    ...resumo,
    caminho: d.caminho,
    modelo: d.modelo,
    tokens: d.tokens,
    custoUsd: d.custoUsd,
    respostas: Object.fromEntries(Object.entries(d.respostas).map(([k, r]) => [k, { tipo: r.tipo, escolha: r.escolha, pontuacao: r.pontuacao, sim: r.sim, confianca: r.confianca, probabilidades: r.probabilidades }])),
    bruto: d.bruto,
  };
}

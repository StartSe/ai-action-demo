// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
import { buscaWebConectada } from "./busca";
import { motivoCanalIndisponivel } from "./rotinas";
import { getConfig } from "./store";

export function statusExtra(): Record<string, boolean> {
  const canal = getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
  return {
    // Exa ou Tavily conectada: a tela deixa de convidar a conectar uma fonte de notícias em português.
    buscaWeb: buscaWebConectada(),
    // "Notificações prontas" de verdade (canal + credencial), para o botão "Receber este radar toda semana".
    notificacoes: !motivoCanalIndisponivel(canal),
  };
}

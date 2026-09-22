// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
import type { Canal } from "./notificacoes";
import { motivoCanalIndisponivel } from "./rotinas";
import { getConfig } from "./store";

/** true quando uma cobrança enviada agora chegaria a alguém: canal escolhido com credencial pronta e,
 * no caso do e-mail, um destino definido (o genérico só olha o campo "Canal", que tem padrão e quase
 * nunca é salvo, então sempre daria "false"). */
export function cobrancaPronta(): boolean {
  const canal: Canal = getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
  if (canal === "email" && !getConfig("NOTIFICACOES_DESTINO")) return false;
  return !motivoCanalIndisponivel(canal);
}

export function statusExtra(): Record<string, boolean> {
  return {
    notificacoes: cobrancaPronta(),
  };
}

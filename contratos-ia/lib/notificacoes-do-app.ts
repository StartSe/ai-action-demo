// Como ESTE app avisa quem analisou o contrato (canal e destino escolhidos em /setup#notificacoes) e se
// já consegue entregar. Próprio do app: lib/notificacoes.ts (compartilhado) só envia; quem decide "está
// pronto?" e "para quem?" é o app, porque a resposta depende do que ele promete na tela (aqui: o aviso
// de 30 dias antes de cada prazo do contrato).
import type { Canal } from "./notificacoes";
import { motivoCanalIndisponivel } from "./rotinas";
import { getConfig } from "./store";

export type CanalDeAviso = { canal: Canal; destino?: string; motivo?: string };

/** Canal/destino configurados e, quando ainda não dá para entregar, o motivo em uma frase acionável. */
export function canalDeAviso(): CanalDeAviso {
  const canal: Canal = getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
  const destino = getConfig("NOTIFICACOES_DESTINO") || undefined;
  if (canal === "email" && !destino) {
    return { canal, destino, motivo: "Informe o e-mail de destino em Notificações para receber os avisos de prazo." };
  }
  return { canal, destino, motivo: motivoCanalIndisponivel(canal) };
}

/** true quando um aviso enviado agora chegaria a alguém (canal com credencial e destino definidos). */
export function notificacoesProntas(): boolean {
  return !canalDeAviso().motivo;
}

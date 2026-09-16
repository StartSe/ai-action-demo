// Como ESTE app avisa quem pediu o vídeo (canal e destino escolhidos em /setup#notificacoes) e se já
// consegue entregar. Próprio do app (mesmo espírito de lib/rotinas-do-app.ts): lib/notificacoes.ts
// (compartilhado) só envia; quem decide "está pronto?" e "para quem?" é o app, porque a resposta depende
// do que ele promete na tela — aqui, o aviso de "o vídeo ficou pronto", que leva minutos para acontecer.
import type { Canal } from "./notificacoes";
import { enviar } from "./notificacoes";
import { motivoCanalIndisponivel } from "./rotinas";
import { getConfig } from "./store";

export type CanalDeAviso = { canal: Canal; destino?: string; motivo?: string };

/** Canal/destino configurados e, quando ainda não dá para entregar, o motivo em uma frase acionável. */
export function canalDeAviso(): CanalDeAviso {
  const canal: Canal = getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
  const destino = getConfig("NOTIFICACOES_DESTINO") || undefined;
  if (canal === "email" && !destino) {
    return { canal, destino, motivo: "Informe um e-mail de destino em Notificações para ser avisado." };
  }
  return { canal, destino, motivo: motivoCanalIndisponivel(canal) };
}

/** true quando um aviso enviado agora chegaria a alguém (canal com credencial e destino definidos). */
export function avisosProntos(): boolean {
  return !canalDeAviso().motivo;
}

/** Envia um aviso pelo canal configurado; sem canal pronto, só registra no console e devolve false. */
export async function avisar({ titulo, texto, link }: { titulo: string; texto: string; link?: string }): Promise<boolean> {
  const { canal, destino, motivo } = canalDeAviso();
  if (motivo) {
    console.error(`Aviso não enviado ("${titulo}"): ${motivo}`);
    return false;
  }
  const envio = await enviar({ canal, destino, titulo, texto, link });
  if (!envio.ok) console.error(`Aviso não entregue ("${titulo}"): ${envio.mensagem}`);
  return envio.ok;
}

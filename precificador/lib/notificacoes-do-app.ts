// Como ESTE app avisa o dono do negócio (canal e destino escolhidos em Configurações) e se já consegue
// entregar. Próprio do app (mesmo espírito de lib/rotinas-do-app.ts): lib/notificacoes.ts (compartilhado)
// só envia; quem decide "está pronto?" e "para quem?" é o app, porque a resposta depende do que ele
// promete na tela (aqui: o aviso semanal de item fora da margem-alvo).
import type { Canal } from "./notificacoes";
import { enviar } from "./notificacoes";
import { motivoCanalIndisponivel } from "./rotinas";
import { getConfig } from "./store";

export type CanalDoDono = { canal: Canal; destino?: string; motivo?: string };

/** Canal/destino configurados e, quando ainda não dá para entregar, o motivo em uma frase acionável. */
export function canalDoDono(): CanalDoDono {
  const canal: Canal = getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
  const destino = getConfig("NOTIFICACOES_DESTINO") || undefined;
  if (canal === "email" && !destino) {
    return { canal, destino, motivo: "Escolha um e-mail de destino em Notificações para receber os avisos." };
  }
  return { canal, destino, motivo: motivoCanalIndisponivel(canal) };
}

/** true quando um aviso enviado agora chegaria a alguém (canal com credencial e destino definidos). */
export function notificacoesProntas(): boolean {
  return !canalDoDono().motivo;
}

/** Envia um aviso ao dono pelo canal configurado; sem canal pronto, só registra no console e devolve false. */
export async function avisarDono({ titulo, texto, link }: { titulo: string; texto: string; link?: string }): Promise<boolean> {
  const { canal, destino, motivo } = canalDoDono();
  if (motivo) {
    console.error(`Aviso não enviado ("${titulo}"): ${motivo}`);
    return false;
  }
  const envio = await enviar({ canal, destino, titulo, texto, link });
  if (!envio.ok) console.error(`Aviso não entregue ("${titulo}"): ${envio.mensagem}`);
  return envio.ok;
}

import { voice } from "@livekit/agents";
import { RoomEvent, type Room } from "@livekit/rtc-node";
import { criarPausaDespedida } from "../lib/pausa-despedida";

/** Espera o playout real e dá tempo de responder ao tchau. Uma nova fala ou
 * interrupção invalida o encerramento daquela geração, inclusive se o áudio atrasar. */
export function controlarConversa({ session, room, identidade, concluir }: {
  session: Pick<voice.AgentSession, "on" | "interrupt">;
  room: Pick<Room, "on">;
  identidade: string;
  concluir: () => void;
}) {
  let fechada = false;
  let terminou = false;
  let geracao = 0;
  const pausa = criarPausaDespedida(() => { if (!fechada && terminou) concluir(); });
  const retomar = () => { geracao++; terminou = false; pausa.cancelar(); };
  session.on(voice.AgentSessionEventTypes.SpeechCreated, ({ speechHandle }) => {
    const atual = geracao;
    void speechHandle.waitForPlayout().then(() => {
      if (!fechada && atual === geracao && terminou && !speechHandle.interrupted) pausa.aguardar();
    }).catch(() => pausa.cancelar());
  });
  session.on(voice.AgentSessionEventTypes.UserStateChanged, (e) => { if (e.newState === "speaking") retomar(); });
  session.on(voice.AgentSessionEventTypes.UserInputTranscribed, () => pausa.cancelar());
  session.on(voice.AgentSessionEventTypes.Error, () => retomar());
  room.on(RoomEvent.DataReceived, (data, participant, _kind, topic) => {
    if (fechada || topic !== "entrevista-controle" || participant?.identity !== identidade) return;
    try {
      const evento = JSON.parse(new TextDecoder().decode(data));
      if (evento.tipo === "interromper") {
        retomar();
        void session.interrupt({ force: true }).await.catch(() => {});
      } else if (evento.tipo === "digitando") retomar();
    } catch { /* Ignora pacotes de controle inválidos. */ }
  });
  return {
    aoResponder(encerrar: boolean) { pausa.cancelar(); terminou = encerrar; },
    fechar() { fechada = true; pausa.cancelar(); },
  };
}

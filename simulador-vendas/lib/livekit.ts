import { JobStatus, TrackSource } from "@livekit/protocol";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { getConfig } from "./store";
import type { Sessao } from "./sessoes";

export const NOME_AGENTE = "simulador-vendas";
export function livekitConfigurado(): boolean {
  return ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "ELEVENLABS_API_KEY", "OPENROUTER_API_KEY"].every(k => Boolean(getConfig(k)));
}
export function nomeSala(sessaoId: string) { return `treino-${sessaoId}`; }
function credenciais() {
  const url = getConfig("LIVEKIT_URL");
  const key = getConfig("LIVEKIT_API_KEY");
  const secret = getConfig("LIVEKIT_API_SECRET");
  if (!url || !key || !secret) throw new Error("Conversa por voz indisponível. Tente novamente em instantes.");
  return { url, key, secret };
}
const conexoes = new Map<string, Promise<void>>();
export async function conectarLivekit(sessao: Sessao) {
  const { url, key, secret } = credenciais();
  const room = nomeSala(sessao.id);
  let pronta = conexoes.get(room);
  if (!pronta) {
    pronta = (async () => {
      await new RoomServiceClient(url, key, secret).createRoom({ name: room, emptyTimeout: 120, maxParticipants: 2 });
      const dispatch = new AgentDispatchClient(url, key, secret);
      const existentes = (await dispatch.listDispatch(room)).filter(d => d.agentName === NOME_AGENTE);
      for (const d of existentes) {
        if (d.state?.jobs.length && d.state.jobs.every(j => j.state?.status === JobStatus.JS_SUCCESS || j.state?.status === JobStatus.JS_FAILED)) await dispatch.deleteDispatch(d.id, room);
      }
      if (!(await dispatch.listDispatch(room)).some(d => d.agentName === NOME_AGENTE)) {
        await dispatch.createDispatch(room, NOME_AGENTE, { metadata: JSON.stringify({ sessaoId: sessao.id }) });
      }
    })().finally(() => conexoes.delete(room));
    conexoes.set(room, pronta);
  }
  await pronta;
  const token = new AccessToken(key, secret, { identity: `vendedor-${sessao.id}`, ttl: "5m" });
  token.addGrant({ roomJoin: true, room, canPublish: true, canPublishSources: [TrackSource.MICROPHONE], canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: false });
  return { url, token: await token.toJwt() };
}

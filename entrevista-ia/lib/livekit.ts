import { randomUUID } from "node:crypto";
import { AccessToken, RoomConfiguration, RoomAgentDispatch, TrackSource } from "livekit-server-sdk";
import { getConfig } from "./store";

export const NOME_AGENTE = "entrevistadora";
export const MODELO_VOZ_PADRAO = "eleven_flash_v2_5";
export function livekitConfigurado() {
  return ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "ELEVENLABS_API_KEY", "OPENROUTER_API_KEY"].every((chave) => Boolean(getConfig(chave)));
}
export function configuracaoVoz() {
  return { apiKey: getConfig("ELEVENLABS_API_KEY"), voiceId: getConfig("ELEVENLABS_VOICE_ID") || "EXAVITQu4vr4xnSDxMaL", model: getConfig("ELEVENLABS_MODEL_ID") || MODELO_VOZ_PADRAO };
}
export async function tokenDaEntrevista(entrevistaId: string) {
  if (!livekitConfigurado()) throw new Error("Conversa por voz indisponível neste momento.");
  // Uma reconexão explícita cria outra sala e despacha um agente novo, retomando o banco.
  const room = `entrevista-${entrevistaId}-${randomUUID()}`;
  const identity = `candidato-${entrevistaId}`;
  const token = new AccessToken(getConfig("LIVEKIT_API_KEY"), getConfig("LIVEKIT_API_SECRET"), { identity, ttl: "10m" });
  token.addGrant({ roomJoin: true, room, canSubscribe: true, canPublish: true, canPublishData: true, canPublishSources: [TrackSource.MICROPHONE] });
  token.roomConfig = new RoomConfiguration({ emptyTimeout: 60, maxParticipants: 2, agents: [new RoomAgentDispatch({ agentName: NOME_AGENTE, metadata: JSON.stringify({ entrevistaId }) })] });
  return { token: await token.toJwt(), url: getConfig("LIVEKIT_URL"), room, identity };
}

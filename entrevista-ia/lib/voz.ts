// Integração opcional com a ElevenLabs: voz da entrevistadora (texto em áudio) e ligação
// telefônica via Conversational AI + Twilio. Sem as chaves (env ou /setup), os recursos ficam
// desligados e o servidor avisa o frontend por /api/status -> integrations.
import { getConfig } from "./store";

const VOICE_ID_PADRAO = "EXAVITQu4vr4xnSDxMaL";

export function ttsEnabled(): boolean {
  return Boolean(getConfig("ELEVENLABS_API_KEY"));
}

export function ligacaoEnabled(): boolean {
  return Boolean(getConfig("ELEVENLABS_API_KEY") && getConfig("ELEVENLABS_AGENT_ID") && getConfig("ELEVENLABS_PHONE_NUMBER_ID"));
}

export async function gerarAudio(texto: string): Promise<ArrayBuffer> {
  const voiceId = getConfig("ELEVENLABS_VOICE_ID") || VOICE_ID_PADRAO;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": getConfig("ELEVENLABS_API_KEY") as string,
      "Content-Type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({ text: texto, model_id: "eleven_multilingual_v2" }),
  });
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    throw new Error(`Falha ao gerar áudio na ElevenLabs (status ${r.status}). ${detalhe.slice(0, 200)}`);
  }
  return r.arrayBuffer();
}

interface DadosLigacao {
  telefone: string;
  vaga?: string;
  requisitos?: string;
  candidato?: string;
}

export async function ligar({ telefone, vaga, requisitos, candidato }: DadosLigacao) {
  const r = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "xi-api-key": getConfig("ELEVENLABS_API_KEY") as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: getConfig("ELEVENLABS_AGENT_ID"),
      agent_phone_number_id: getConfig("ELEVENLABS_PHONE_NUMBER_ID"),
      to_number: telefone,
      conversation_initiation_client_data: {
        dynamic_variables: {
          vaga: vaga || "",
          requisitos: requisitos || "",
          candidato: candidato || "",
        },
      },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const mensagem = (data as { detail?: { message?: string }; message?: string })?.detail?.message
      || (data as { message?: string })?.message
      || `Falha ao iniciar a ligação (status ${r.status}).`;
    throw new Error(mensagem);
  }
  return data;
}

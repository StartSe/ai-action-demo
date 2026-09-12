// Transcrição de áudio. Prioridade: ElevenLabs (scribe_v1) -> OpenAI (whisper-1) -> demo.
// Sem nenhuma das duas chaves, devolve a transcrição de exemplo (lib/demo.ts).
import { getConfig } from "./store";
import { transcricaoDemo } from "./demo";
import type { FonteTranscricao } from "./types";

export function transcricaoEnabled(): boolean {
  return Boolean(getConfig("ELEVENLABS_API_KEY") || getConfig("OPENAI_API_KEY"));
}

interface EntradaAudio {
  buffer: ArrayBuffer;
  filename?: string;
  mimetype?: string;
}

export async function transcrever({ buffer, filename, mimetype }: EntradaAudio): Promise<{ transcricao: string; fonte: FonteTranscricao }> {
  const elevenlabs = getConfig("ELEVENLABS_API_KEY");
  if (elevenlabs) {
    return transcreverElevenLabs({ buffer, filename, mimetype }, elevenlabs);
  }
  const openai = getConfig("OPENAI_API_KEY");
  if (openai) {
    return transcreverOpenAI({ buffer, filename, mimetype }, openai);
  }
  return { transcricao: transcricaoDemo(), fonte: "demo" };
}

async function transcreverElevenLabs({ buffer, filename, mimetype }: EntradaAudio, chave: string): Promise<{ transcricao: string; fonte: FonteTranscricao }> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", new Blob([buffer], { type: mimetype || "application/octet-stream" }), filename || "audio");
  form.append("language_code", "por");
  form.append("diarize", "true");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": chave },
    body: form,
  });
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    throw new Error(`Falha ao transcrever com a ElevenLabs (${r.status}). ${detalhe}`.trim());
  }
  const data = await r.json();
  if (!data.text) throw new Error("A ElevenLabs não retornou texto para este áudio.");
  return { transcricao: data.text, fonte: "elevenlabs" };
}

async function transcreverOpenAI({ buffer, filename, mimetype }: EntradaAudio, chave: string): Promise<{ transcricao: string; fonte: FonteTranscricao }> {
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", new Blob([buffer], { type: mimetype || "application/octet-stream" }), filename || "audio");
  form.append("language", "pt");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}` },
    body: form,
  });
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    throw new Error(`Falha ao transcrever com a OpenAI (${r.status}). ${detalhe}`.trim());
  }
  const data = await r.json();
  if (!data.text) throw new Error("A OpenAI não retornou texto para este áudio.");
  return { transcricao: data.text, fonte: "openai" };
}

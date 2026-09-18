// Transcrição de áudio pelo serviço escolhido em /setup ("Transcrição de áudio": ElevenLabs ou OpenAI,
// uma chave só). Sem chave, devolve a transcrição de exemplo (lib/demo.ts). As chaves antigas
// ELEVENLABS_API_KEY/OPENAI_API_KEY continuam valendo como variável de ambiente (README), para quem já
// publicou o app antes do cartão único existir.
import { getConfig } from "./store";
import { transcricaoDemo } from "./demo";
import type { FonteTranscricao } from "./types";

export type ServicoTranscricao = "elevenlabs" | "openai";

const ACAO_CONFERIR_CHAVE = { rotulo: "Conferir a chave", url: "/setup#transcricao" };
const CREDITOS: Record<ServicoTranscricao, string> = {
  elevenlabs: "https://elevenlabs.io/app/subscription",
  openai: "https://platform.openai.com/settings/organization/billing",
};

/** Erro da transcrição já traduzido para a tela (nunca traz status HTTP nem o corpo do provedor): a rota
 * devolve `message`/`status`/`acao` como estão, no mesmo formato `{ error, acao }` que o ErrorBox lê. */
export class ErroTranscricao extends Error {
  status: number;
  acao?: { rotulo: string; url: string };
  constructor(mensagem: string, status: number, acao?: { rotulo: string; url: string }) {
    super(mensagem);
    this.name = "ErroTranscricao";
    this.status = status;
    this.acao = acao;
  }
}

/** Serviço e chave em uso: primeiro o cartão de /setup (TRANSCRICAO_SERVICO + TRANSCRICAO_API_KEY), depois as variáveis antigas. */
export function servicoTranscricao(): { servico: ServicoTranscricao; chave: string } | null {
  const chave = getConfig("TRANSCRICAO_API_KEY");
  if (chave) return { servico: getConfig("TRANSCRICAO_SERVICO") === "openai" ? "openai" : "elevenlabs", chave };
  const elevenlabs = getConfig("ELEVENLABS_API_KEY");
  if (elevenlabs) return { servico: "elevenlabs", chave: elevenlabs };
  const openai = getConfig("OPENAI_API_KEY");
  if (openai) return { servico: "openai", chave: openai };
  return null;
}

export function transcricaoEnabled(): boolean {
  return servicoTranscricao() !== null;
}

interface EntradaAudio {
  buffer: ArrayBuffer;
  filename?: string;
  mimetype?: string;
}

/** Único ponto que traduz uma resposta não-ok do serviço de transcrição em ErroTranscricao. O detalhe técnico vai só para console.error. */
export function interpretarFalhaTranscricao(servico: ServicoTranscricao, status: number, detalheBruto: string): ErroTranscricao {
  console.error(`Falha ao transcrever com ${servico}:`, status, detalheBruto.slice(0, 200));
  const detalhe = detalheBruto.toLowerCase();
  if (status === 401 || status === 403) {
    return new ErroTranscricao("A chave de transcrição foi recusada. Confira a chave salva em Configurações.", 401, ACAO_CONFERIR_CHAVE);
  }
  if (status === 402 || status === 429 || detalhe.includes("quota") || detalhe.includes("insufficient")) {
    return new ErroTranscricao("Sem minutos de transcrição no serviço conectado. Adicione créditos ou cole a transcrição em texto.", 402, { rotulo: "Adicionar créditos", url: CREDITOS[servico] });
  }
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return new ErroTranscricao("O serviço não aceitou este áudio (formato ou tamanho). Envie mp3, m4a, wav, webm ou ogg de até 25 MB.", 422);
  }
  return new ErroTranscricao("O serviço de transcrição não respondeu como esperado. Tente de novo ou cole a transcrição em texto.", 502);
}

async function chamarServico(url: string, init: RequestInit, servico: ServicoTranscricao): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    console.error(`Falha de rede ao transcrever com ${servico}:`, err);
    throw new ErroTranscricao("Não conseguimos falar com o serviço de transcrição. Verifique a conexão e tente de novo.", 503);
  }
}

export async function transcrever({ buffer, filename, mimetype }: EntradaAudio): Promise<{ transcricao: string; fonte: FonteTranscricao }> {
  const atual = servicoTranscricao();
  if (!atual) return { transcricao: transcricaoDemo(), fonte: "demo" };
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimetype || "application/octet-stream" }), filename || "audio");
  let r: Response;
  if (atual.servico === "elevenlabs") {
    form.append("model_id", "scribe_v1");
    form.append("language_code", "por");
    form.append("diarize", "true");
    r = await chamarServico("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": atual.chave }, body: form }, "elevenlabs");
  } else {
    form.append("model", "whisper-1");
    form.append("language", "pt");
    r = await chamarServico("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${atual.chave}` }, body: form }, "openai");
  }
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    throw interpretarFalhaTranscricao(atual.servico, r.status, detalhe);
  }
  const dados = (await r.json().catch(() => ({}))) as { text?: string };
  const texto = (dados.text || "").trim();
  if (!texto) throw new ErroTranscricao("Não encontramos fala neste áudio. Confira o arquivo ou cole a transcrição em texto.", 422);
  return { transcricao: texto, fonte: atual.servico };
}

/** Teste de conexão do cartão "Transcrição de áudio" (/setup): confere a chave sem gastar minutos. */
export async function testarTranscricao(config: Record<string, string | undefined>): Promise<{ ok: boolean; mensagem: string }> {
  const chave = config.TRANSCRICAO_API_KEY;
  const servico: ServicoTranscricao = config.TRANSCRICAO_SERVICO === "openai" ? "openai" : "elevenlabs";
  if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
  let r: Response;
  try {
    r = servico === "elevenlabs"
      ? await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": chave } })
      : await fetch("https://api.openai.com/v1/models/whisper-1", { headers: { Authorization: `Bearer ${chave}` } });
  } catch (err) {
    console.error("Falha de rede ao testar a transcrição:", err);
    return { ok: false, mensagem: "Não conseguimos falar com o serviço de transcrição. Verifique a conexão e tente de novo." };
  }
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    return { ok: false, mensagem: interpretarFalhaTranscricao(servico, r.status, detalhe).message };
  }
  if (servico === "elevenlabs") {
    const dados = (await r.json().catch(() => ({}))) as { subscription?: { tier?: string } };
    return { ok: true, mensagem: `Conectado à ElevenLabs. Plano: ${dados.subscription?.tier || "não informado"}.` };
  }
  return { ok: true, mensagem: "Conectado à OpenAI. A transcrição está disponível para esta chave." };
}

// Aviso automático de pós-conversa da ElevenLabs (evento post_call_transcription): recebe a
// transcrição completa assim que uma ligação por voz termina, sem precisar de ninguém colar nada.
// Corpo lido cru (req.text()) porque a assinatura é calculada sobre os bytes exatos recebidos.
import crypto from "node:crypto";
import { getConfig, setConfig } from "@/lib/store";
import { salvarConversaAnalisada } from "@/lib/analise";
import { CRITERIOS_PADRAO } from "@/lib/criterios";
import { obter as obterSala, registrarResultado } from "@/lib/salas";
import type { Conversa, LinhaTranscricao } from "@/lib/types";

export const dynamic = "force-dynamic";

const JANELA_SEGUNDOS = 30 * 60;

/** Cabeçalho no formato "t=<epoch>,v0=<hash>[,v0=<hash2>...]" (a ElevenLabs pode mandar mais de uma
 * assinatura durante uma rotação de segredo: basta uma delas bater). */
function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string): boolean {
  if (!cabecalho) return false;
  let carimbo: string | null = null;
  const hashes: string[] = [];
  for (const parte of cabecalho.split(",")) {
    const i = parte.indexOf("=");
    if (i === -1) continue;
    const chave = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    if (chave === "t") carimbo = valor;
    else if (chave === "v0") hashes.push(valor);
  }
  if (!carimbo || hashes.length === 0) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(carimbo)) > JANELA_SEGUNDOS) return false;

  const esperado = Buffer.from(crypto.createHmac("sha256", segredo).update(`${carimbo}.${corpo}`).digest("hex"), "hex");
  return hashes.some((h) => {
    const buf = Buffer.from(h, "hex");
    return buf.length === esperado.length && crypto.timingSafeEqual(buf, esperado);
  });
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

type EventoPosConversa = {
  type?: string;
  data?: {
    transcript?: { role?: string; message?: string; time_in_call_secs?: number }[];
    metadata?: { call_duration_secs?: number };
    dynamic_variables?: Record<string, string | number>;
  };
};

/** Roda depois de já ter respondido 200 à ElevenLabs: monta a Conversa e reaproveita a mesma
 * análise/gravação da conversa colada (lib/analise.ts), sem duplicar lógica. */
async function processar(corpo: string): Promise<void> {
  const evento = JSON.parse(corpo) as EventoPosConversa;
  if (evento.type !== "post_call_transcription") return;

  const linhas = evento.data?.transcript || [];
  const transcricao: LinhaTranscricao[] = linhas
    .filter((l) => l.message)
    .map((l) => ({
      papel: l.role === "agent" ? "cliente" : "vendedor",
      texto: l.message || "",
      segundo: typeof l.time_in_call_secs === "number" ? l.time_in_call_secs : undefined,
    }));
  if (transcricao.length === 0) return;

  const dynamicVars = evento.data?.dynamic_variables || {};
  const salaCodigo = dynamicVars.sala_token != null ? String(dynamicVars.sala_token) : undefined;
  const sala = salaCodigo ? obterSala(salaCodigo) : null;
  const vendedorId = dynamicVars.vendedor_id != null ? String(dynamicVars.vendedor_id) : sala?.vendedorId || undefined;

  const conversa: Conversa = {
    id: gerarId(),
    vendedorId,
    cenarioId: sala?.cenarioId || undefined,
    origem: "voz",
    transcricao,
    duracaoSeg: typeof evento.data?.metadata?.call_duration_secs === "number" ? evento.data.metadata.call_duration_secs : undefined,
    criadoEm: new Date().toISOString(),
  };

  const resultado = await salvarConversaAnalisada(conversa, CRITERIOS_PADRAO);
  setConfig("ELEVENLABS_ULTIMA_CONVERSA_EM", conversa.criadoEm);
  if (sala && salaCodigo && resultado.id) registrarResultado(salaCodigo, resultado.id);
}

export async function POST(req: Request): Promise<Response> {
  const corpo = await req.text();
  const segredo = getConfig("ELEVENLABS_WEBHOOK_SECRET");
  const cabecalho = req.headers.get("elevenlabs-signature");
  if (!segredo || !assinaturaValida(corpo, cabecalho, segredo)) {
    return new Response("Assinatura inválida", { status: 401 });
  }

  processar(corpo).catch((err) => console.error("Erro ao processar conversa recebida da ElevenLabs:", err));
  return new Response("OK", { status: 200 });
}

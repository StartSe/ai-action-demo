// Aviso automático de pós-conversa da ElevenLabs (evento post_call_transcription): recebe a
// transcrição completa assim que uma ligação por voz termina, sem precisar de ninguém colar nada.
// Corpo lido cru (req.text()) porque a assinatura é calculada sobre os bytes exatos recebidos.
import crypto from "node:crypto";
import { getConfig } from "@/lib/store";
import { registrarConversaRecebida, registrarRecusa } from "@/lib/aviso-pos-conversa";
import { salvarConversaAnalisada } from "@/lib/analise";
import { avaliarSessao } from "@/lib/avaliacao";
import { CRITERIOS_PADRAO } from "@/lib/criterios";
import { obter as obterSala, registrarResultado } from "@/lib/salas";
import { encerrar, obter as obterSessao, registrarMensagem, transcricao as transcricaoDaSessao } from "@/lib/sessoes";
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

/**
 * O caminho de hoje (US-016): a conversa pertence à **sessão** de um vendedor dentro de uma simulação.
 * O `sessao_id` é uma das variáveis dinâmicas que a sala manda ao agente, e é por ele que a
 * transcrição encontra de volta quem treinou, em que treino e com que cliente.
 *
 * Gravar a transcrição, fechar a sessão e avaliar acontecem aqui porque no nível 1 nada disso passa
 * pelo app: quem conduziu a conversa foi o agente, e o vendedor já saiu da ligação quando ela chega.
 *
 * A entrega de um aviso automático pode se repetir (a ElevenLabs reenvia o que não recebeu 200), então
 * as duas gravações são condicionadas ao que já existe: sessão já avaliada não é reavaliada, e
 * transcrição já gravada não é gravada de novo — senão a mesma conversa apareceria em dobro.
 */
async function processarSessao(sessaoId: string, transcricao: LinhaTranscricao[], duracaoSeg?: number): Promise<boolean> {
  const sessao = obterSessao(sessaoId);
  if (!sessao) return false;
  if (sessao.resultadoId) return true;

  if (transcricaoDaSessao(sessao.id).length === 0) {
    for (const linha of transcricao) {
      registrarMensagem({ sessaoId: sessao.id, papel: linha.papel, texto: linha.texto, segundo: linha.segundo });
    }
  }

  // A duração vem do aviso, não do relógio do app: a ligação já acabou quando ele chega, e medir daqui
  // contaria o tempo de entrega como tempo de conversa.
  if (sessao.status === "em_andamento" || sessao.status === "preparando") encerrar(sessao.id, { duracaoSeg });
  await avaliarSessao(sessao.id);
  return true;
}

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
  const duracaoSeg = typeof evento.data?.metadata?.call_duration_secs === "number" ? evento.data.metadata.call_duration_secs : undefined;

  // Sessão primeiro (US-016); `sala_token` continua atendido logo abaixo porque os agentes já
  // configurados com a variável antiga não deixam de funcionar quando o app é atualizado.
  const sessaoId = dynamicVars.sessao_id != null ? String(dynamicVars.sessao_id) : undefined;
  if (sessaoId && (await processarSessao(sessaoId, transcricao, duracaoSeg))) {
    registrarConversaRecebida(new Date().toISOString());
    return;
  }

  const salaCodigo = dynamicVars.sala_token != null ? String(dynamicVars.sala_token) : undefined;
  const sala = salaCodigo ? obterSala(salaCodigo) : null;
  const vendedorId = dynamicVars.vendedor_id != null ? String(dynamicVars.vendedor_id) : sala?.vendedorId || undefined;

  const conversa: Conversa = {
    id: gerarId(),
    vendedorId,
    cenarioId: sala?.cenarioId || undefined,
    origem: "voz",
    transcricao,
    duracaoSeg,
    criadoEm: new Date().toISOString(),
  };

  const resultado = await salvarConversaAnalisada(conversa, CRITERIOS_PADRAO);
  registrarConversaRecebida(conversa.criadoEm);
  if (sala && salaCodigo && resultado.id) registrarResultado(salaCodigo, resultado.id);
}

export async function POST(req: Request): Promise<Response> {
  const corpo = await req.text();
  const segredo = getConfig("ELEVENLABS_WEBHOOK_SECRET");
  const cabecalho = req.headers.get("elevenlabs-signature");
  if (!segredo) {
    registrarRecusa("O segredo de verificação ainda não foi salvo em Configurações.");
    return new Response("Assinatura inválida", { status: 401 });
  }
  if (!assinaturaValida(corpo, cabecalho, segredo)) {
    registrarRecusa(cabecalho ? "A assinatura não confere com o segredo salvo (ou a conversa chegou muito atrasada)." : "A conversa chegou sem assinatura.");
    return new Response("Assinatura inválida", { status: 401 });
  }

  processar(corpo).catch((err) => {
    console.error("Erro ao processar conversa recebida da ElevenLabs:", err);
    registrarRecusa("A conversa chegou, mas a análise falhou. Confira a conexão com a IA em Configurações.");
  });
  return new Response("OK", { status: 200 });
}

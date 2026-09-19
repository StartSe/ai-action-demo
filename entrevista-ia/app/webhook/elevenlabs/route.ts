// Aviso automático de pós-conversa da ElevenLabs (evento post_call_transcription): recebe a
// transcrição completa assim que a conversa do agente termina — no navegador do candidato (US-019) ou
// por telefone (US-020) —, sem precisar de ninguém colar nada.
//
// É a única porta por onde uma entrevista conduzida pelo agente volta para o app: naquele nível
// nenhum turno passa por aqui, e o candidato já fechou a página quando o aviso chega. Sem este
// endereço configurado na conta da ElevenLabs, a entrevista acontece e o app nunca fica sabendo.
//
// O corpo é lido cru (`req.text()`) porque a assinatura é calculada sobre os bytes exatos recebidos:
// um `JSON.parse` seguido de `JSON.stringify` muda espaços e ordem e derruba a conferência.
import crypto from "node:crypto";
import { registrarConversaRecebida, registrarRecusa } from "@/lib/aviso-pos-conversa";
import { concluirEntrevista } from "@/lib/conclusao";
import { obter as obterEntrevista, registrarMensagem, transcricao as transcricaoDaEntrevista } from "@/lib/entrevistas";
import type { PapelMensagem } from "@/lib/entrevistas";
import { getConfig } from "@/lib/store";

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

type EventoPosConversa = {
  type?: string;
  data?: {
    transcript?: { role?: string; message?: string; time_in_call_secs?: number }[];
    dynamic_variables?: Record<string, string | number>;
  };
};

type Fala = { papel: PapelMensagem; texto: string; segundo?: number };

/**
 * Casa a conversa com a entrevista pelo `entrevista_id` — a variável dinâmica que a sala do agente e
 * a ligação telefônica mandam (`lib/agente.ts`) — e grava o que chegou.
 *
 * A entrega de um aviso automático **se repete**: a ElevenLabs reenvia o que não recebeu 200. Por
 * isso as duas escritas são condicionadas ao que já existe — transcrição já gravada não é gravada de
 * novo (a mesma conversa apareceria em dobro no parecer) e uma entrevista já concluída ou avaliada
 * não volta atrás.
 */
function processarEntrevista(entrevistaId: string, falas: Fala[], tentativa: number): boolean {
  const entrevista = obterEntrevista(entrevistaId);
  if (!entrevista) return false;
  if (entrevista.tentativa !== tentativa) return true;
  if (entrevista.status === "cancelada" || entrevista.status === "expirada") {
    console.error("Conversa recebida de uma entrevista que não vale mais:", entrevistaId, entrevista.status);
    return true;
  }

  if (transcricaoDaEntrevista(entrevista.id).length === 0) {
    for (const fala of falas) {
      registrarMensagem({ entrevistaId: entrevista.id, papel: fala.papel, texto: fala.texto, segundo: fala.segundo });
    }
  }

  // `nivelVoz: "agente"` só é escrito aqui: no nível 1 nenhum turno passa pelo servidor, então esta é
  // a primeira (e única) vez que o app sabe como a conversa aconteceu.
  //
  // `concluirEntrevista()` é a mesma porta da sala do navegador (lib/conclusao.ts): ela marca o
  // estado, mede o tamanho da conversa e põe o parecer a caminho em segundo plano. Uma entrevista já
  // concluída ou avaliada não volta atrás nem ganha um segundo parecer — o que importa aqui, porque a
  // ElevenLabs reentrega o aviso que não recebeu 200.
  concluirEntrevista(entrevista.id, { nivelVoz: "agente" });
  return true;
}

/** Roda depois de já ter respondido 200 à ElevenLabs: ela reenvia o que demora a responder, e montar
 * a transcrição antes de responder transformaria uma entrega lenta em duas conversas. */
async function processar(corpo: string): Promise<void> {
  const evento = JSON.parse(corpo) as EventoPosConversa;
  if (evento.type !== "post_call_transcription") return;

  const falas: Fala[] = (evento.data?.transcript || [])
    .filter((l) => l.message)
    .map((l) => ({
      papel: (l.role === "agent" ? "entrevistadora" : "candidato") as PapelMensagem,
      texto: l.message || "",
      segundo: typeof l.time_in_call_secs === "number" ? l.time_in_call_secs : undefined,
    }));
  if (falas.length === 0) return;

  const variaveis = evento.data?.dynamic_variables || {};
  const entrevistaId = variaveis.entrevista_id != null ? String(variaveis.entrevista_id) : "";
  if (!entrevistaId) {
    console.error("Conversa recebida da ElevenLabs sem entrevista_id: confira as variáveis dinâmicas do agente.");
    return;
  }
  if (!processarEntrevista(entrevistaId, falas, Number(variaveis.tentativa ?? 1))) {
    console.error("Conversa recebida da ElevenLabs para uma entrevista que não existe mais:", entrevistaId);
    return;
  }
  registrarConversaRecebida(new Date().toISOString());
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
    registrarRecusa(
      cabecalho
        ? "A assinatura não confere com o segredo salvo (ou a conversa chegou muito atrasada)."
        : "A conversa chegou sem assinatura."
    );
    return new Response("Assinatura inválida", { status: 401 });
  }

  processar(corpo).catch((err) => {
    console.error("Erro ao processar conversa recebida da ElevenLabs:", err);
    registrarRecusa("A conversa chegou, mas não pôde ser guardada. Tente de novo ou fale com quem cuida do app.");
  });
  return new Response("OK", { status: 200 });
}

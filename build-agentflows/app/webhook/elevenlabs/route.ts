// Aviso de fim de ligação da ElevenLabs (post_call_transcription). Rota pública (proxy.ts),
// validada pela assinatura HMAC com o segredo colado em Configurações. Executa o fluxo escolhido com a
// transcrição da ligação (inbound ou outbound) para registrar, classificar ou dar sequência.
import { getConfig, setConfig } from "@/lib/store";
import { assinaturaConfere, interpretarPosLigacao, type PosLigacao } from "@/lib/elevenlabs";
import { startRun } from "@/lib/flow-runtime";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const corpo = await req.text();
  const segredo = getConfig("ELEVENLABS_WEBHOOK_SECRET") || "";
  if (!assinaturaConfere(corpo, req.headers.get("elevenlabs-signature"), segredo)) {
    console.error("Aviso da ElevenLabs recusado: assinatura ausente ou inválida.");
    return new Response(null, { status: 401 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(corpo);
  } catch {}
  const ligacao = interpretarPosLigacao(body);
  if (ligacao) processar(ligacao).catch((err) => console.error("Erro ao processar fim de ligação:", err));
  return new Response("OK", { status: 200 });
}
export function textoDaLigacao(l: PosLigacao) {
  return [
    l.telefone ? `Telefone: ${l.telefone}` : "",
    l.resumo ? `Resumo: ${l.resumo}` : "",
    l.variaveis.contexto ? `Contexto da ligação: ${l.variaveis.contexto}` : "",
    "",
    "Transcrição:",
    l.transcricao || "(sem falas registradas)",
  ]
    .filter((linha, i, arr) => linha !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}
export async function processar(l: PosLigacao) {
  setConfig("ELEVENLABS_ULTIMA_LIGACAO", JSON.stringify({ em: new Date().toISOString(), id: l.conversationId }));
  const flowId = getConfig("ELEVENLABS_FLOW_ID");
  if (!flowId) return null;
  return startRun(flowId, textoDaLigacao(l), true);
}

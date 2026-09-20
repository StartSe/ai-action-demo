// Avisos do WhatsApp (Z-API, Meta e ZapperHub) chegam aqui. Rota pública (proxy.ts, `/webhook/**`),
// protegida pela chave secreta na URL (?chave=) gerada em Conexões; a Meta também usa essa chave
// como valor de verificação. Cada mensagem de texto executa o fluxo publicado escolhido em
// Conexões e a resposta volta pelo mesmo número. Responde 200 na hora e processa em seguida.
import { getConfig, setConfig } from "@/lib/store";
import { chaveConfere, enviarMensagem, interpretarRecebido, type Recebida } from "@/lib/whatsapp";
import { startRun } from "@/lib/flow-runtime";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && chaveConfere(q.get("hub.verify_token")))
    return new Response(q.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  return new Response(null, { status: 403 });
}
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  if (!chaveConfere(q.get("chave"))) {
    console.error("Aviso do WhatsApp recusado: chave ausente ou diferente.");
    return new Response(null, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const recebida = interpretarRecebido(body);
  if (recebida) processar(recebida).catch((err) => console.error("Erro ao responder no WhatsApp:", err));
  return new Response("OK", { status: 200 });
}
// Executa o fluxo escolhido em Conexões com o texto recebido e devolve a resposta ao remetente.
export async function processar(m: Recebida): Promise<string | null> {
  setConfig("WHATSAPP_ULTIMA_RECEBIDA", JSON.stringify({ em: new Date().toISOString(), de: m.de }));
  const flowId = getConfig("WHATSAPP_FLOW_ID");
  if (!flowId) return null;
  let resposta: string;
  try {
    const r = await startRun(flowId, m.texto, true);
    resposta =
      r.status === "completed"
        ? r.output
        : r.status === "waiting"
          ? "Recebi sua mensagem. Ela está em análise e voltamos em breve."
          : "Não consegui concluir agora. Tente novamente em instantes.";
  } catch (err) {
    console.error("Fluxo do WhatsApp falhou:", err);
    resposta = "Não consegui concluir agora. Tente novamente em instantes.";
  }
  if (resposta.trim()) await enviarMensagem(m.de, resposta);
  return resposta;
}

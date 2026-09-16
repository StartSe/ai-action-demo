// "Enviar as notas ao CRM": cria no CRM conectado uma anotação com a nota e os pontos a melhorar da
// conversa analisada (lib/crm.ts). Erros do CRM já vêm com status e ação prontos para o ErrorBox.
import { enviarConversaParaCRM, ErroCRM } from "@/lib/crm";
import { respostaErro } from "@/lib/ai";

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const resultadoId = String(corpo?.resultadoId || "").trim();
  if (!resultadoId) return Response.json({ error: "Analise uma conversa antes de mandar as notas ao CRM." }, { status: 400 });
  try {
    const resposta = await enviarConversaParaCRM(resultadoId);
    return Response.json(resposta);
  } catch (err) {
    if (err instanceof ErroCRM) return Response.json({ error: err.message, acao: err.acao }, { status: err.status });
    return respostaErro(err);
  }
}

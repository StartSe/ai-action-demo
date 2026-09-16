import { respostaErro } from "@/lib/ai";
import { CampanhaNaoEncontrada, enviarLeadsParaCRM, ErroCRM, ErroDePedido } from "@/lib/crm";

/** { campanhaId, leadIds }: cria um contato no CRM conectado para cada lead escolhido. Devolve { enviados, falhas, mensagem }. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { campanhaId?: unknown; leadIds?: unknown };
  const campanhaId = String(corpo.campanhaId || "").trim();
  const leadIds = Array.isArray(corpo.leadIds) ? corpo.leadIds.map((x) => String(x)) : [];
  if (!campanhaId) return Response.json({ error: "Busque os leads antes de enviar ao CRM." }, { status: 400 });
  try {
    return Response.json(await enviarLeadsParaCRM(campanhaId, leadIds));
  } catch (err) {
    if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof CampanhaNaoEncontrada) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof ErroCRM) return Response.json({ error: err.message, acao: err.acao }, { status: err.status });
    return respostaErro(err);
  }
}

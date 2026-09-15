import { CampanhaNaoEncontrada, ErroDePedido } from "@/lib/leads";
import { escreverParaCampanha } from "@/lib/sequencias";

/** Escreve as sequências dos leads escolhidos ({ campanhaId, leadIds }) e devolve a campanha atualizada. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { campanhaId?: unknown; leadIds?: unknown };
  const campanhaId = String(corpo.campanhaId || "").trim();
  const leadIds = Array.isArray(corpo.leadIds) ? corpo.leadIds.map((x) => String(x)) : [];
  if (!campanhaId) return Response.json({ error: "Busque os leads antes de escrever as mensagens." }, { status: 400 });
  if (leadIds.length === 0) return Response.json({ error: "Selecione ao menos um lead para escrever as mensagens." }, { status: 400 });
  try {
    const { campanha, meta } = await escreverParaCampanha(campanhaId, leadIds);
    return Response.json({ campanha, meta });
  } catch (err) {
    if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof CampanhaNaoEncontrada) return Response.json({ error: err.message }, { status: 404 });
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível escrever as mensagens agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

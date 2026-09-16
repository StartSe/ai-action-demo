import { respostaErro } from "@/lib/ai";
import { CampanhaNaoEncontrada, ErroDePedido } from "@/lib/leads";
import { escreverParaCampanha } from "@/lib/sequencias";

/**
 * Escreve as sequências dos leads escolhidos ({ campanhaId, leadIds }) e devolve { campanha, meta, escritas, falhas }.
 * Falhas isoladas (um lead em 429, por exemplo) não derrubam as outras: voltam em `falhas` para a tela
 * oferecer "Escrever de novo". Erros da IA que atingem todos passam por respostaErro (401/402/429 com código e ação).
 */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { campanhaId?: unknown; leadIds?: unknown };
  const campanhaId = String(corpo.campanhaId || "").trim();
  const leadIds = Array.isArray(corpo.leadIds) ? corpo.leadIds.map((x) => String(x)) : [];
  if (!campanhaId) return Response.json({ error: "Busque os leads antes de escrever as mensagens." }, { status: 400 });
  if (leadIds.length === 0) return Response.json({ error: "Marque ao menos um lead para escrever as mensagens." }, { status: 400 });
  try {
    return Response.json(await escreverParaCampanha(campanhaId, leadIds));
  } catch (err) {
    if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof CampanhaNaoEncontrada) return Response.json({ error: err.message }, { status: 404 });
    return respostaErro(err);
  }
}

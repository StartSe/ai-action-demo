// O preço escolhido de um item num canal. Separado do PUT do item de propósito: a Bancada grava o
// preço com debounce enquanto a pessoa arrasta o marcador, e não queremos reenviar a ficha inteira
// a cada movimento.
import { precificarItem } from "@/lib/carteira";
import { obterCanal } from "@/lib/canais";
import { obterItem } from "@/lib/itens";
import { apagarPreco, definirPreco, historicoPreco } from "@/lib/precos";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: RouteContext<"/api/itens/[id]/preco">) {
  const { id } = await params;
  const canalId = new URL(req.url).searchParams.get("canal");
  if (!canalId) return Response.json({ error: "Informe o canal." }, { status: 400 });
  return Response.json({ historico: historicoPreco(id, canalId) });
}

export async function PUT(req: Request, { params }: RouteContext<"/api/itens/[id]/preco">) {
  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as { canalId?: string; preco?: number } | null;
  const preco = Number(corpo?.preco);
  if (!corpo?.canalId || !Number.isFinite(preco) || preco < 0) {
    return Response.json({ error: "Informe um canal e um preço válido." }, { status: 400 });
  }
  if (!obterItem(id)) return Response.json({ error: "Este item não existe mais." }, { status: 404 });
  if (!obterCanal(corpo.canalId)) return Response.json({ error: "Este canal de venda não existe mais." }, { status: 404 });

  try {
    // Guarda o custo total da época junto com o preço: é o que responde "quanto eu cobrava antes
    // de o insumo subir" sem deixar a resposta pela metade.
    const atual = precificarItem(id, corpo.canalId);
    const salvo = definirPreco(id, corpo.canalId, preco, atual?.precificacao.corredor.custo.total ?? 0);
    return Response.json({ preco: salvo });
  } catch (err) {
    console.error("Falha ao salvar o preço", err);
    return Response.json({ error: "Não foi possível salvar o preço agora. Tente de novo." }, { status: 500 });
  }
}

/** Volta o canal ao preço automático: apaga a escolha, mantém o histórico. */
export async function DELETE(req: Request, { params }: RouteContext<"/api/itens/[id]/preco">) {
  const { id } = await params;
  const canalId = new URL(req.url).searchParams.get("canal");
  if (!canalId) return Response.json({ error: "Informe o canal." }, { status: 400 });
  apagarPreco(id, canalId);
  return Response.json({ ok: true });
}

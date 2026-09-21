// Um item: o estado completo da Bancada (GET), a edição da ficha (PUT) e a exclusão (DELETE).
//
// O GET devolve tudo o que a tela precisa de uma vez — negócio, custos fixos, canais, item, ficha e
// preços. Daí em diante a Bancada recalcula no navegador com lib/precificacao e não volta ao
// servidor para mostrar um número novo (critério de aceite E5 do PRD).
import { estadoBancada } from "@/lib/carteira";
import { apagarItem, atualizarItem, definirInsumos, obterItem, type DadosInsumo, type DadosItem } from "@/lib/itens";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/api/itens/[id]">) {
  const { id } = await params;
  const estado = estadoBancada(id);
  if (!estado) return Response.json({ error: "Este item não existe mais." }, { status: 404 });
  return Response.json(estado);
}

type Corpo = DadosItem & { insumos?: DadosInsumo[] };

export async function PUT(req: Request, { params }: RouteContext<"/api/itens/[id]">) {
  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as Corpo | null;
  if (!corpo || typeof corpo !== "object") {
    return Response.json({ error: "Não foi possível ler os dados enviados." }, { status: 400 });
  }
  if (corpo.insumos && !Array.isArray(corpo.insumos)) {
    return Response.json({ error: "A ficha veio em um formato inesperado." }, { status: 400 });
  }
  if (!obterItem(id)) return Response.json({ error: "Este item não existe mais." }, { status: 404 });

  try {
    const { insumos, ...dados } = corpo;
    atualizarItem(id, dados);
    if (insumos) definirInsumos(id, insumos);
    const estado = estadoBancada(id);
    if (!estado) return Response.json({ error: "Este item não existe mais." }, { status: 404 });
    return Response.json(estado);
  } catch (err) {
    console.error("Falha ao salvar o item", err);
    return Response.json({ error: "Não foi possível salvar o item agora. Tente de novo." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext<"/api/itens/[id]">) {
  const { id } = await params;
  apagarItem(id);
  return Response.json({ ok: true });
}

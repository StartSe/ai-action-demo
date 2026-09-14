// Orçamento planejado: lista editável no painel principal ("Orçamento planejado", em Mais
// detalhes). GET devolve a lista salva; PUT substitui a lista inteira de uma vez (mesmo padrão já
// usado por financas-ia/app/api/orcamento/route.ts).
import { definir, listar } from "@/lib/orcamento";
import type { Orcamento } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ itens: listar() });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { itens?: unknown };
  const bruto = Array.isArray(body.itens) ? body.itens : [];
  const itens: Orcamento[] = bruto.map((i) => {
    const item = String((i as { item?: unknown })?.item || "").trim();
    const valorMensalBRL = Number((i as { valorMensalBRL?: unknown })?.valorMensalBRL);
    return { item, valorMensalBRL: Number.isFinite(valorMensalBRL) ? Math.max(valorMensalBRL, 0) : 0 };
  });
  const salvos = definir(itens);
  return Response.json({ itens: salvos });
}

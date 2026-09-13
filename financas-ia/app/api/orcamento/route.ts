import { getOrcamento, salvarOrcamento, type ItemOrcamento } from "@/lib/orcamento";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ itens: getOrcamento() });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { itens?: unknown };
  const bruto = Array.isArray(body.itens) ? body.itens : [];
  const itens: ItemOrcamento[] = bruto
    .map((i) => {
      const categoria = String((i as { categoria?: unknown })?.categoria || "").trim();
      const valorMensal = Number((i as { valorMensal?: unknown })?.valorMensal);
      return { categoria, valorMensal: Number.isFinite(valorMensal) ? Math.max(valorMensal, 0) : 0 };
    })
    .filter((i) => i.categoria);
  salvarOrcamento(itens);
  return Response.json({ itens });
}

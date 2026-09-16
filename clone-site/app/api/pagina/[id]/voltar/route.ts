// "Voltar para esta": copia a versão n como uma versão nova (as intermediárias continuam na lista).
import { ErroDePedido, PaginaNaoEncontrada, voltarParaVersao } from "@/lib/gerador";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: RouteContext<"/api/pagina/[id]/voltar">) {
  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as { n?: unknown } | null;
  try {
    const { pagina, versao } = voltarParaVersao(id, corpo?.n);
    return Response.json({ pagina, versao, id });
  } catch (err) {
    if (err instanceof PaginaNaoEncontrada) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
    console.error(err);
    return Response.json({ error: "Não foi possível voltar para essa versão agora. Tente de novo." }, { status: 500 });
  }
}

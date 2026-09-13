// "Encerrar" na lista "Pesquisas ativas": para de aceitar respostas novas, sem apagar as já recebidas.
import { encerrarPesquisa } from "@/lib/pesquisas";

export async function POST(_req: Request, { params }: RouteContext<"/api/pesquisas/[token]/encerrar">) {
  const { token } = await params;
  const ok = encerrarPesquisa(token);
  if (!ok) return Response.json({ error: "Pesquisa não encontrada." }, { status: 404 });
  return Response.json({ ok: true });
}

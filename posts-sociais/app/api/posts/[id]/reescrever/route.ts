import { respostaErro } from "@/lib/ai";
import { reescreverRascunhos } from "@/lib/posts";

/** "Reescrever com esse comentário" (painel Aprovados): reescreve todos os posts do rascunho com o pedido de
 * ajuste e deixa o resultado aguardando nova aprovação pelo mesmo link. */
export async function POST(req: Request, { params }: RouteContext<"/api/posts/[id]/reescrever">) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { comentario?: string };
  const comentario = String(body.comentario || "").trim();
  if (!comentario) {
    return Response.json({ error: "Não há comentário de ajuste para orientar a reescrita." }, { status: 400 });
  }
  try {
    const saida = await reescreverRascunhos(id, comentario);
    if (!saida) return Response.json({ error: "Este rascunho não existe mais." }, { status: 404 });
    return Response.json({ posts: saida.posts, aprovacao: saida.aprovacao });
  } catch (err) {
    return respostaErro(err);
  }
}

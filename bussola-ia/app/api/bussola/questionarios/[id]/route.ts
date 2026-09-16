import { questionarioEmUso } from "@/lib/link-avaliacao";
import { apagar, obter } from "@/lib/questionarios";

export async function GET(_req: Request, { params }: RouteContext<"/api/bussola/questionarios/[id]">) {
  const { id } = await params;
  const salvo = obter(id);
  if (!salvo) return Response.json({ error: "Questionário não encontrado." }, { status: 404 });
  return Response.json(salvo);
}

/** Apagar um questionário em uso por uma avaliação aberta deixaria as respostas sem perguntas: 409 com o que fazer. */
export async function DELETE(_req: Request, { params }: RouteContext<"/api/bussola/questionarios/[id]">) {
  const { id } = await params;
  const emUso = questionarioEmUso(id);
  if (emUso) {
    return Response.json({ error: `Este questionário está em uso pela avaliação "${emUso.titulo}", que ainda aceita respostas. Encerre a avaliação antes de apagar.` }, { status: 409 });
  }
  apagar(id);
  return Response.json({ ok: true });
}

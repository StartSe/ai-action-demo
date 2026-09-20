import { questionarioEmUso } from "@/lib/link-avaliacao";
import { apagar, obter } from "@/lib/questionarios";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/bussola/questionarios/[id]">,
) {
  const { id } = await params;
  const salvo = obter(id);
  if (!salvo)
    return Response.json(
      { error: "Questionário não encontrado." },
      { status: 404 },
    );
  return Response.json(salvo);
}

/** Apagar um questionário vinculado a uma avaliação deixaria as respostas sem perguntas: 409 com o que fazer. */
export async function DELETE(
  _req: Request,
  { params }: RouteContext<"/api/bussola/questionarios/[id]">,
) {
  const { id } = await params;
  const emUso = questionarioEmUso(id);
  if (emUso) {
    return Response.json(
      {
        error: `Este questionário está vinculado à avaliação "${emUso.titulo}". Ele precisa ser preservado para manter o histórico e interpretar as respostas.`,
      },
      { status: 409 },
    );
  }
  apagar(id);
  return Response.json({ ok: true });
}

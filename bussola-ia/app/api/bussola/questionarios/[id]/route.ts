import { apagar, obter } from "@/lib/questionarios";

export async function GET(_req: Request, { params }: RouteContext<"/api/bussola/questionarios/[id]">) {
  const { id } = await params;
  const salvo = obter(id);
  if (!salvo) return Response.json({ error: "Questionário não encontrado." }, { status: 404 });
  return Response.json(salvo);
}

export async function DELETE(_req: Request, { params }: RouteContext<"/api/bussola/questionarios/[id]">) {
  const { id } = await params;
  apagar(id);
  return Response.json({ ok: true });
}

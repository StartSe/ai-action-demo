import { apagarNegocio, obterNegocio } from "@/lib/negocios";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const registro = obterNegocio(id);
  if (!registro) return Response.json({ error: "Negócio não encontrado." }, { status: 404 });
  return Response.json({ id: registro.id, negocio: registro.saida, criadoEm: registro.criadoEm });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  apagarNegocio(id);
  return Response.json({ ok: true });
}

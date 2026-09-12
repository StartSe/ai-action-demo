import { limparConversa } from "@/lib/atendente";

export async function DELETE(_req: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  limparConversa(numero);
  return Response.json({ ok: true });
}

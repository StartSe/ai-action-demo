import { apagarConversa } from "@/lib/conversas";

export async function DELETE(_req: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  apagarConversa(numero);
  return Response.json({ ok: true });
}

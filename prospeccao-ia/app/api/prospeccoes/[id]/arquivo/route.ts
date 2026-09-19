import { definirArquivamento } from "@/lib/arquivo-prospeccoes";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const corpo = await req.json().catch(() => null);
  if (typeof corpo?.arquivada !== "boolean") return Response.json({ error: "Informe se a prospecção deve ser arquivada." }, { status: 400 });
  const { id } = await params;
  const resultado = definirArquivamento(id, corpo.arquivada);
  if (!resultado) return Response.json({ error: "Prospecção não encontrada." }, { status: 404 });
  return Response.json(resultado);
}

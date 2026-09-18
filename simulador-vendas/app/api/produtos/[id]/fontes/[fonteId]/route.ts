// Remover um material do produto (US-004/US-005).
//
// Tirar material muda o que a IA sabe: se a ficha já tinha sido gerada, ela deixa de valer e o produto
// volta a "rascunho" — melhor pedir para gerar de novo do que treinar o time com uma ficha que cita
// um material que não está mais lá.
import { atualizar, listarFontes, obter, removerFonte } from "@/lib/produtos";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fonteId: string }> }) {
  const { id, fonteId } = await params;
  const produto = obter(id);
  if (!produto) return Response.json({ error: "Esse produto não existe mais." }, { status: 404 });

  if (!listarFontes(id).some((f) => f.id === fonteId)) {
    return Response.json({ error: "Esse material já foi removido." }, { status: 404 });
  }

  removerFonte(fonteId);
  if (produto.status === "pronto") atualizar(id, { status: "rascunho" });
  return Response.json({ ok: true });
}

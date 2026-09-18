import { apagarProduto } from "@/lib/workspace";

/** Apaga um produto da lista ativa; prospecções e ICPs já criados continuam intactos (ver lib/workspace.ts). */
export async function DELETE(_req: Request, { params }: RouteContext<"/api/produtos/[id]">) {
  const { id } = await params;
  apagarProduto(id);
  return Response.json({ ok: true });
}

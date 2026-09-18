import { apagarProspeccao, obterProspeccao } from "@/lib/workspace";

/** Apaga uma prospecção (US-014): remove contas, leads e abordagens dela em cascata (lib/workspace.ts:apagarProspeccao). */
export async function DELETE(_req: Request, { params }: RouteContext<"/api/prospeccoes/[id]">) {
  const { id } = await params;
  if (!obterProspeccao(id)) return Response.json({ error: "Prospecção não encontrada." }, { status: 404 });
  apagarProspeccao(id);
  return Response.json({ ok: true });
}

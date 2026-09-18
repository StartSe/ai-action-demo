import { apagarLead, obterLead } from "@/lib/workspace";

/** "Apagar dados desta pessoa" (US-021, jornada B2C): remove o lead e as abordagens dele em cascata
 * (lib/workspace.ts:apagarLead), mesmo padrão de DELETE /api/prospeccoes/[id]. */
export async function DELETE(_req: Request, { params }: RouteContext<"/api/leads/[id]">) {
  const { id } = await params;
  if (!obterLead(id)) return Response.json({ error: "Pessoa não encontrada." }, { status: 404 });
  apagarLead(id);
  return Response.json({ ok: true });
}

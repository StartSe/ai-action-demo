import { atualizarLead, obterLead } from "@/lib/workspace";

/** "Marcar como abordado" leva a `abordado` (AC da US-030) — ação explícita do vendedor depois de enviar
 * a mensagem, separada da promoção automática para "selecionado" que acontece ao salvar a abordagem
 * (app/api/leads/[id]/abordagem/route.ts). */
export async function POST(_req: Request, { params }: RouteContext<"/api/leads/[id]/marcar-abordado">) {
  const { id } = await params;
  const lead = obterLead(id);
  if (!lead) return Response.json({ error: "Esta pessoa não existe mais." }, { status: 404 });
  return Response.json(atualizarLead(id, { status: "abordado" }));
}

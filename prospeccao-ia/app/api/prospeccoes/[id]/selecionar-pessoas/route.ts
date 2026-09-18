import { atualizarLead, listarLeads, obterProspeccao } from "@/lib/workspace";

/**
 * "Adicionar à prospecção" do modo "Explorar uma empresa" (US-018): as pessoas encontradas nascem com
 * `status: "novo"` (ver comentário de topo de lib/execucao-prospeccao.ts) — nenhuma entra de fato na
 * prospecção sem a pessoa marcar a caixa e confirmar aqui. Só aceita `leadId` que já pertence a esta
 * prospecção (devolvido por GET .../andamento); qualquer outro é ignorado em silêncio, sem 400 — não é
 * uma validação de formulário, é uma tela marcando o que já sabe que existe.
 */
export async function POST(req: Request, { params }: RouteContext<"/api/prospeccoes/[id]/selecionar-pessoas">) {
  const { id } = await params;
  const prospeccao = obterProspeccao(id);
  if (!prospeccao) return Response.json({ error: "Prospecção não encontrada." }, { status: 404 });

  const corpo = await req.json().catch(() => null);
  const leadIds = Array.isArray(corpo?.leadIds) ? corpo.leadIds.filter((v: unknown): v is string => typeof v === "string") : [];
  if (!leadIds.length) return Response.json({ error: "Selecione ao menos uma pessoa." }, { status: 400 });

  const idsDaProspeccao = new Set(listarLeads(id).map((l) => l.id));
  for (const leadId of leadIds) {
    if (idsDaProspeccao.has(leadId)) atualizarLead(leadId, { status: "selecionado" });
  }
  return Response.json({ leads: listarLeads(id) });
}

import { ROTULO_PAPEL } from "@/lib/rotulos";
import type { Papel } from "@/lib/types";
import { apagarLead, atualizarLead, obterConta, obterICP, obterLead, obterProspeccao } from "@/lib/workspace";

const PAPEIS = Object.keys(ROTULO_PAPEL) as Papel[];

/** Ficha do lead (US-027, `/leads/[id]` e o painel lateral de `ExploracaoEmpresa.tsx`): um único payload
 * com o lead, a conta vinculada (nula em B2C ou quando ainda não se sabe a empresa) e o que vem do ICP da
 * prospecção (`icpPersonas`/`jornada`) — mesmas duas informações que `GET /api/prospeccoes/[id]/andamento`
 * já devolve para a mesma finalidade (explicar o papel, esconder o campo em B2C), só que para UM lead. */
export async function GET(_req: Request, { params }: RouteContext<"/api/leads/[id]">) {
  const { id } = await params;
  const lead = obterLead(id);
  if (!lead) return Response.json({ error: "Pessoa não encontrada." }, { status: 404 });
  const conta = lead.contaId ? obterConta(lead.contaId) : null;
  const prospeccao = obterProspeccao(lead.prospeccaoId);
  const icp = prospeccao ? obterICP(prospeccao.icpId) : null;
  return Response.json({
    lead,
    conta,
    icpPersonas: icp?.personas ?? [],
    jornada: icp?.jornada ?? "b2b",
  });
}

/** "Apagar dados desta pessoa" (US-021, jornada B2C): remove o lead e as abordagens dele em cascata
 * (lib/workspace.ts:apagarLead), mesmo padrão de DELETE /api/prospeccoes/[id]. */
export async function DELETE(_req: Request, { params }: RouteContext<"/api/leads/[id]">) {
  const { id } = await params;
  if (!obterLead(id)) return Response.json({ error: "Pessoa não encontrada." }, { status: 404 });
  apagarLead(id);
  return Response.json({ ok: true });
}

/** Papel editado à mão pelo vendedor (US-026): a única escrita feita fora do pipeline, então nunca é
 * sobrescrita por uma nova execução da prospecção (que, ao repetir, nem recria este mesmo registro —
 * ver lib/execucao-prospeccao.ts:chaveLead). Só o campo `papel` é aceito aqui. */
export async function PUT(req: Request, { params }: RouteContext<"/api/leads/[id]">) {
  const { id } = await params;
  if (!obterLead(id)) return Response.json({ error: "Pessoa não encontrada." }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  if (!PAPEIS.includes(corpo?.papel)) return Response.json({ error: "Escolha um papel válido para esta pessoa." }, { status: 400 });
  return Response.json(atualizarLead(id, { papel: corpo.papel as Papel, papelManual: true }));
}

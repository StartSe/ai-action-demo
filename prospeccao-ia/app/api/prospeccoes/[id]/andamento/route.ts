import { listarContas, listarLeads, obterICP, obterProduto, obterProspeccao } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Andamento de uma prospecção (US-013): payload único que serve tanto a carga inicial da tela quanto o
 * poll a cada 2 s (components/ProspeccaoAndamento.tsx). produtoNome/icpNome vêm de obterProduto/obterICP,
 * que não filtram apagado (funciona mesmo se o produto tiver sido apagado depois de a prospecção existir,
 * mesmo critério já usado por GET /api/inicio — ver Codebase Patterns do progress.txt).
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/prospeccoes/[id]/andamento">) {
  const { id } = await params;
  const prospeccao = obterProspeccao(id);
  if (!prospeccao) return Response.json({ error: "Prospecção não encontrada." }, { status: 404 });
  const produto = obterProduto(prospeccao.produtoId);
  const icp = obterICP(prospeccao.icpId);
  return Response.json({
    prospeccao,
    produtoNome: produto?.nome ?? "Produto",
    icpNome: icp?.nome ?? "Perfil",
    contasEncontradas: listarContas(id).length,
    leadsEncontrados: listarLeads(id).length,
  });
}

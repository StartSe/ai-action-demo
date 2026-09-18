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
  const contas = listarContas(id);
  const leads = listarLeads(id);
  return Response.json({
    prospeccao,
    produtoNome: produto?.nome ?? "Produto",
    icpNome: icp?.nome ?? "Perfil",
    // Jornada do ICP (nunca persistida na prospecção, ver comentário de lib/execucao-prospeccao.ts):
    // components/ProspeccaoAndamento.tsx usa isto para desenhar a lista do modo "pessoas" em B2C
    // (Pessoa | Fit | Sinal | Contexto | Status) diferente da lista B2B (US-021).
    jornada: icp?.jornada ?? "b2b",
    // Personas do ICP (US-026): components/ProspeccaoAndamento.tsx/ExploracaoEmpresa.tsx usam isto só
    // para explicar (title do chip de papel) por que um cargo virou "champion" — a derivação em si já
    // aconteceu no pipeline (lib/execucao-prospeccao.ts), este array nunca recalcula `LeadProspeccao.papel`.
    icpPersonas: icp?.personas ?? [],
    // Array completo (não só a contagem): a lista de resultados do modo "Encontrar empresas" (US-017) e
    // as pessoas-chave do modo "Explorar uma empresa" (US-018) usam isto direto, sem uma segunda rota —
    // o volume é o mesmo teto da "quantidade alvo"/`TETO_PESSOAS_CHAVE` (até 50 contas, até 5 pessoas).
    contas,
    leads,
    contasEncontradas: contas.length,
    leadsEncontrados: leads.length,
  });
}

import { listarICPs, listarLeads, listarProdutos, listarProspeccoes } from "@/lib/workspace";
import type { StatusLead } from "@/lib/types";

/** Quantas prospecções o painel do Início mostra na lista "recentes". */
const RECENTES = 3;

const QUALIFICADOS_OU_DEPOIS: StatusLead[] = ["qualificado", "selecionado", "abordado", "respondeu"];

/** Números e prospecções recentes do Início (US-003): tudo calculado a partir das tabelas do workspace, nunca fixo. */
export async function GET() {
  const prospeccoes = listarProspeccoes();
  const leads = listarLeads();
  const produtos = listarProdutos();
  const icps = listarICPs();

  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const icpPorId = new Map(icps.map((i) => [i.id, i]));

  const qualificados = leads.filter((l) => QUALIFICADOS_OU_DEPOIS.includes(l.status)).length;
  const respostas = leads.filter((l) => l.status === "respondeu").length;

  const recentes = prospeccoes.slice(0, RECENTES).map((p) => {
    const leadsDaProspeccao = leads.filter((l) => l.prospeccaoId === p.id);
    return {
      id: p.id,
      nome: icpPorId.get(p.icpId)?.nome || "Prospecção",
      produto: produtoPorId.get(p.produtoId)?.nome || "Produto",
      criadoEm: p.criadoEm,
      encontrados: leadsDaProspeccao.length,
      qualificados: leadsDaProspeccao.filter((l) => QUALIFICADOS_OU_DEPOIS.includes(l.status)).length,
      abordagens: leadsDaProspeccao.filter((l) => l.status === "abordado" || l.status === "respondeu").length,
    };
  });

  return Response.json({ prospeccoes: prospeccoes.length, leadsEncontrados: leads.length, qualificados, respostas, recentes });
}

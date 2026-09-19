import { listarContas, listarLeads, listarProspeccoes, obterProduto } from "@/lib/workspace";
import { nomeProspeccao } from "@/lib/rotulos";

/**
 * Todos os leads de todas as prospecções (US-036, `/leads`) — path próprio (não `/api/leads`, já usado
 * pela rota antiga de busca de leads, `lib/historico.ts`) no mesmo padrão de sibling estático de
 * `/api/produtos/analisar` ao lado de `/api/produtos/[id]`. `prospeccaoNome` é resolvido aqui (mesmo
 * cálculo de `GET /api/prospeccoes`, US-035) para a tela nunca montar o nome sozinha.
 *
 * `site` (novo, US-037: "Exportar CSV" pede o site na exportação) vem da `Conta` vinculada — o lead não
 * tem esse campo próprio (mora na empresa). `listarContas()` sem filtro traz todas de uma vez, evitando
 * uma consulta por lead.
 */
export async function GET() {
  const prospeccoes = listarProspeccoes();
  const nomesPorProspeccao = new Map(
    prospeccoes.map((p) => {
      const produtoNome = obterProduto(p.produtoId)?.nome ?? "Produto";
      return [p.id, nomeProspeccao(produtoNome, p.modo, p.criterios)] as const;
    }),
  );
  const sitePorConta = new Map(listarContas().map((c) => [c.id, c.site] as const));
  const leads = listarLeads().map((l) => ({
    ...l,
    prospeccaoNome: nomesPorProspeccao.get(l.prospeccaoId) ?? "Prospecção",
    site: l.contaId ? sitePorConta.get(l.contaId) ?? null : null,
  }));
  const prospeccoesFiltro = prospeccoes.map((p) => ({ id: p.id, nome: nomesPorProspeccao.get(p.id) ?? "Prospecção" }));
  return Response.json({ leads, prospeccoes: prospeccoesFiltro });
}

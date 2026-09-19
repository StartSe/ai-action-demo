import { datasArquivamento } from "@/lib/arquivo-prospeccoes";
import { listarLeads, listarProspeccoes, obterProduto } from "@/lib/workspace";
import { criarProspeccaoValidada } from "@/lib/execucao-prospeccao";
import { formatarFunil, funilContagens } from "@/lib/qualificacao";
import { nomeProspeccao } from "@/lib/rotulos";

/** Lista todas as prospecções com o mesmo resumo de funil da página de detalhe (US-035,
 * components/Prospeccoes.tsx) — nome/funil calculados aqui, nunca na tela. */
export async function GET(req?: Request) {
  const situacao = req ? new URL(req.url).searchParams.get("situacao") || "todas" : "todas";
  if (!["ativas", "arquivadas", "todas"].includes(situacao)) return Response.json({ error: "Filtro de prospecções inválido." }, { status: 400 });
  const arquivo = datasArquivamento();
  const prospeccoes = listarProspeccoes().filter(p => situacao === "todas" || (situacao === "arquivadas" ? arquivo.has(p.id) : !arquivo.has(p.id)));
  const leads = listarLeads();
  const itens = prospeccoes.map((p) => {
    const leadsDaProspeccao = leads.filter((l) => l.prospeccaoId === p.id);
    const produtoNome = obterProduto(p.produtoId)?.nome ?? "Produto";
    return {
      id: p.id,
      arquivadaEm: arquivo.get(p.id) ?? null,
      nome: nomeProspeccao(produtoNome, p.modo, p.criterios),
      modo: p.modo,
      demo: p.demo,
      criadoEm: p.criadoEm,
      funil: formatarFunil(funilContagens(leadsDaProspeccao)),
    };
  });
  return Response.json(itens);
}

/**
 * Cria uma prospecção e devolve o registro na hora (US-013): `estado: "executando"` já gravado, sem
 * `await` do trabalho de verdade. A validação e o disparo do pipeline em segundo plano vivem em
 * `lib/execucao-prospeccao.ts:criarProspeccaoValidada`, mesma função usada pela ferramenta MCP
 * `criar_prospeccao` (US-039) — a tela acompanha por GET /api/prospeccoes/[id]/andamento.
 */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const resultado = criarProspeccaoValidada({
    produtoId: typeof corpo?.produtoId === "string" ? corpo.produtoId : "",
    icpId: typeof corpo?.icpId === "string" ? corpo.icpId : "",
    modo: corpo?.modo,
    criterios: corpo?.criterios,
  });
  if (!resultado.ok) return Response.json({ error: resultado.erro }, { status: resultado.status });
  return Response.json(resultado.prospeccao, { status: 201 });
}

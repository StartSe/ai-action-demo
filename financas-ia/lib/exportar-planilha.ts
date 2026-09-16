// Exportação da leitura como planilha .xlsx com uma aba por categoria (a primeira é o resumo).
// Roda no navegador (usa Blob/URL), a partir do menu "Mais" do resultado; o formato do arquivo é
// montado em lib/planilha-xlsx.ts, sem nenhuma dependência nova.
import { montarXlsx, type AbaPlanilha } from "./planilha-xlsx";
import { orcamentoDaCategoria, type ItemOrcamento } from "./orcamento-calculo";
import type { LancamentoResumo } from "./types";

// Acima disso o arquivo vira uma lista de abas que ninguém navega; o excedente entra em uma aba só.
const MAXIMO_DE_ABAS = 40;

function dataCurta(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Agrupa os lançamentos por categoria, da que mais gastou para a que menos gastou. */
function agrupar(lancamentos: LancamentoResumo[]): { categoria: string; total: number; itens: LancamentoResumo[] }[] {
  const mapa = new Map<string, LancamentoResumo[]>();
  for (const l of lancamentos) {
    const categoria = l.categoria || "Sem categoria";
    const lista = mapa.get(categoria);
    if (lista) lista.push(l);
    else mapa.set(categoria, [l]);
  }
  return [...mapa.entries()]
    .map(([categoria, itens]) => ({ categoria, itens, total: itens.reduce((s, i) => s + i.valor, 0) }))
    .sort((a, b) => b.total - a.total);
}

/** Uma aba por categoria, precedida da aba "Resumo" (com o orçamento do período quando houver). */
export function abasPorCategoria(lancamentos: LancamentoResumo[], orcamento?: ItemOrcamento[], mesesNoPeriodo = 1): AbaPlanilha[] {
  const grupos = agrupar(lancamentos);
  const meses = Math.max(mesesNoPeriodo, 1);
  const comOrcamento = Boolean(orcamento && orcamento.length);

  const resumo: AbaPlanilha = {
    nome: "Resumo",
    cabecalho: comOrcamento
      ? ["Categoria", "Lançamentos", "Total no período", "Orçamento do período", "Desvio"]
      : ["Categoria", "Lançamentos", "Total no período"],
    linhas: grupos.map((g) => {
      const mensal = comOrcamento ? orcamentoDaCategoria(orcamento!, g.categoria) : undefined;
      const orcado = mensal === undefined ? undefined : mensal * meses;
      const base: (string | number)[] = [g.categoria, g.itens.length, arredondar(g.total)];
      if (!comOrcamento) return base;
      return [...base, orcado === undefined ? "sem orçamento" : arredondar(orcado), orcado === undefined ? "" : arredondar(g.total - orcado)];
    }),
  };

  const cabecalhoCategoria = ["Data", "Descrição", "Valor"];
  const proprias = grupos.slice(0, MAXIMO_DE_ABAS).map((g) => ({
    nome: g.categoria,
    cabecalho: cabecalhoCategoria,
    linhas: g.itens
      .slice()
      .sort((a, b) => (a.data < b.data ? -1 : 1))
      .map((l) => [dataCurta(l.data), l.descricao || "", arredondar(l.valor)] as (string | number)[]),
  }));

  const restantes = grupos.slice(MAXIMO_DE_ABAS);
  if (restantes.length) {
    proprias.push({
      nome: "Outras categorias",
      cabecalho: ["Categoria", ...cabecalhoCategoria],
      linhas: restantes.flatMap((g) => g.itens.map((l) => [g.categoria, dataCurta(l.data), l.descricao || "", arredondar(l.valor)] as (string | number)[])),
    });
  }

  return [resumo, ...proprias];
}

function arredondar(v: number) {
  return Math.round(v * 100) / 100;
}

/** Gera o arquivo e dispara o download com o nome da planilha de origem. */
export function baixarPlanilhaPorCategoria(lancamentos: LancamentoResumo[], nomeArquivo: string, orcamento?: ItemOrcamento[], mesesNoPeriodo = 1): void {
  const bytes = montarXlsx(abasPorCategoria(lancamentos, orcamento, mesesNoPeriodo));
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo.replace(/\.csv$/i, "")}-por-categoria.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

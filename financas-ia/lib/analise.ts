// Cálculos sobre os lançamentos, feitos inteiramente no navegador.
// Recebe registros já normalizados: { data: Date, categoria: string, valor: number, descricao: string }
import { parseData, parseNumero } from "./csv";
import type { ComparacaoAno, Mapeamento, Registro, Resumo } from "./types";

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatoMes = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" });

export function formatarMoeda(v: number): string {
  return formatoMoeda.format(v || 0);
}

export function chaveDoMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function rotuloDoMes(chave: string): string {
  const [ano, mes] = chave.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, 1, 12));
  const rotulo = formatoMes.format(d);
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}

// Normaliza as linhas cruas do CSV (com o mapeamento de colunas escolhido) em
// registros prontos para análise, descartando linhas sem data ou valor válidos.
export function normalizarRegistros(linhas: string[][], mapeamento: Mapeamento): Registro[] {
  const registros: Registro[] = [];
  for (const linha of linhas) {
    const bruto = linha[mapeamento.valor];
    const valor = parseNumero(bruto);
    const data = parseData(linha[mapeamento.data]);
    if (data === null || valor === null) continue;
    registros.push({
      data,
      valor: Math.abs(valor),
      categoria: (mapeamento.categoria >= 0 ? linha[mapeamento.categoria] : "") || "Sem categoria",
      descricao: mapeamento.descricao >= 0 ? linha[mapeamento.descricao] || "" : "",
    });
  }
  return registros;
}

export function calcularResumo(registros: Registro[]): Resumo {
  const total = registros.reduce((s, r) => s + r.valor, 0);

  const porMesMapa = new Map<string, number>();
  for (const r of registros) {
    const chave = chaveDoMes(r.data);
    porMesMapa.set(chave, (porMesMapa.get(chave) || 0) + r.valor);
  }
  const meses = [...porMesMapa.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([chave, valorTotal]) => ({ mes: chave, rotulo: rotuloDoMes(chave), total: valorTotal }));

  const mediaMensal = meses.length ? total / meses.length : 0;

  let variacaoUltimoMes = 0;
  if (meses.length >= 2) {
    const ultimo = meses[meses.length - 1].total;
    const anterior = meses[meses.length - 2].total;
    variacaoUltimoMes = anterior > 0 ? ((ultimo - anterior) / anterior) * 100 : 0;
  }

  const porCategoriaMapa = new Map<string, number>();
  for (const r of registros) {
    porCategoriaMapa.set(r.categoria, (porCategoriaMapa.get(r.categoria) || 0) + r.valor);
  }
  const categoriasOrdenadas = [...porCategoriaMapa.entries()].sort((a, b) => b[1] - a[1]);
  const top8 = categoriasOrdenadas.slice(0, 8).map(([categoria, valorTotal]) => ({ categoria, total: valorTotal }));
  if (categoriasOrdenadas.length > 8) {
    const outros = categoriasOrdenadas.slice(8).reduce((s, [, v]) => s + v, 0);
    top8.push({ categoria: "Outros", total: outros });
  }

  const maioresLancamentos = [...registros]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
    .map((r) => ({
      data: r.data.toISOString().slice(0, 10),
      categoria: r.categoria,
      descricao: r.descricao,
      valor: r.valor,
    }));

  // Categorias que mais cresceram: compara os dois últimos meses com dados, por categoria.
  let categoriasQueCresceram: Resumo["categoriasQueCresceram"] = [];
  if (meses.length >= 2) {
    const mesA = meses[meses.length - 2].mes;
    const mesB = meses[meses.length - 1].mes;
    const porCategoriaMes = new Map<string, { a: number; b: number }>();
    for (const r of registros) {
      const chave = chaveDoMes(r.data);
      if (chave !== mesA && chave !== mesB) continue;
      if (!porCategoriaMes.has(r.categoria)) porCategoriaMes.set(r.categoria, { a: 0, b: 0 });
      const entrada = porCategoriaMes.get(r.categoria)!;
      if (chave === mesA) entrada.a += r.valor;
      else entrada.b += r.valor;
    }
    categoriasQueCresceram = [...porCategoriaMes.entries()]
      .map(([categoria, { a, b }]) => ({
        categoria,
        anterior: a,
        atual: b,
        variacao: a > 0 ? ((b - a) / a) * 100 : b > 0 ? 100 : 0,
      }))
      .filter((c) => c.anterior > 0 || c.atual > 0)
      .sort((a, b) => b.variacao - a.variacao)
      .slice(0, 3);
  }

  // Mesmo mês do ano anterior: só faz sentido quando a planilha cobre pelo menos 13 meses (senão não há
  // um ano inteiro para trás) E o mês equivalente tem lançamentos — um mês vazio não entra em `meses`.
  let comparacaoAnoAnterior: ComparacaoAno | undefined;
  if (meses.length >= 13) {
    const atual = meses[meses.length - 1];
    const [ano, mes] = atual.mes.split("-").map(Number);
    const chaveAnterior = `${ano - 1}-${String(mes).padStart(2, "0")}`;
    const totalAnterior = porMesMapa.get(chaveAnterior);
    if (totalAnterior !== undefined && totalAnterior > 0) {
      comparacaoAnoAnterior = {
        rotuloAtual: atual.rotulo,
        rotuloAnterior: rotuloDoMes(chaveAnterior),
        totalAtual: atual.total,
        totalAnterior,
        variacao: ((atual.total - totalAnterior) / totalAnterior) * 100,
      };
    }
  }

  return {
    quantidade: registros.length,
    total,
    mediaMensal,
    meses,
    categorias: top8,
    variacaoUltimoMes,
    maioresLancamentos,
    categoriasQueCresceram,
    comparacaoAnoAnterior,
    periodo:
      registros.length > 0
        ? {
            inicio: meses[0]?.rotulo || "",
            fim: meses[meses.length - 1]?.rotulo || "",
          }
        : { inicio: "", fim: "" },
  };
}

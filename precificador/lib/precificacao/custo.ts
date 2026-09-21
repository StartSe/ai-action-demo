// Custo de uma unidade do item: insumos convertidos, mão de obra e perda, mais o rateio fixo.
// Puro, sem node:*.
import { custoHora, rateioFixoPorUnidade } from "./rateio";
import { converter } from "./unidades";
import type { Cenario, LinhaInsumo } from "./tipos";

export type CustoLinha = {
  id: string;
  nome: string;
  /** Custo desta linha por unidade do item, em reais. */
  valor: number;
  /** Quando a conversão é impossível (ml para g, por exemplo), a linha vale zero e diz o motivo. */
  aviso?: string;
};

/**
 * Custo de uma linha de insumo: converte a quantidade usada para a unidade de compra e aplica a
 * regra de três sobre o preço de compra.
 *
 * Exemplo do critério de aceite: compra 1 kg por R$ 40 e usa 120 g → 120 g viram 0,12 kg →
 * 0,12 ÷ 1 × 40 = R$ 4,80.
 */
export function custoDaLinha(linha: LinhaInsumo): CustoLinha {
  const base = { id: linha.id, nome: linha.nome };
  const qtdCompra = Number(linha.qtdCompra) || 0;
  if (qtdCompra <= 0) {
    return { ...base, valor: 0, aviso: "Informe quanto vem na embalagem comprada." };
  }
  const usadaNaUnidadeDeCompra = converter(Number(linha.qtdUsada) || 0, linha.unidadeUso, linha.unidadeCompra);
  if (usadaNaUnidadeDeCompra === null) {
    return { ...base, valor: 0, aviso: `Não dá para converter ${linha.unidadeUso} em ${linha.unidadeCompra}. Use unidades da mesma medida.` };
  }
  return { ...base, valor: (usadaNaUnidadeDeCompra / qtdCompra) * (Number(linha.custoCompra) || 0) };
}

export type ComposicaoCusto = {
  /** Uma entrada por linha de insumo, para a barra de composição da ficha. */
  linhas: CustoLinha[];
  /** Soma dos insumos, antes da perda. */
  insumos: number;
  /** Pró-labore proporcional ao tempo gasto, antes da perda. */
  maoDeObra: number;
  /** O que a perda acrescenta sobre insumos + mão de obra. */
  perda: number;
  /** Insumos + mão de obra + perda. */
  direto: number;
  /** Custo fixo absorvido por unidade. */
  rateioFixo: number;
  /** Direto + rateio. É o custo total da unidade. */
  total: number;
};

/**
 * Composição completa do custo de uma unidade.
 *
 * Sem nenhuma linha de insumo, vale o `custoDiretoManual` do item: a ficha é opcional, e quem só
 * quer digitar "cada peça me custa R$ 12" consegue precificar sem montar receita nenhuma.
 */
export function comporCusto({ negocio, custosFixos, item, insumos }: Omit<Cenario, "canal">): ComposicaoCusto {
  const linhas = insumos.map(custoDaLinha);
  const somaInsumos = linhas.length ? linhas.reduce((s, l) => s + l.valor, 0) : Number(item.custoDiretoManual) || 0;
  const maoDeObra = ((Number(item.tempoMinutos) || 0) / 60) * custoHora(negocio, custosFixos).maoDeObra;
  const antesDaPerda = somaInsumos + maoDeObra;
  const perda = antesDaPerda * Math.max(0, Number(item.perdaPct) || 0);
  const direto = antesDaPerda + perda;
  const rateioFixo = rateioFixoPorUnidade(negocio, custosFixos, item.tipo, item.tempoMinutos);
  return { linhas, insumos: somaInsumos, maoDeObra, perda, direto, rateioFixo, total: direto + rateioFixo };
}

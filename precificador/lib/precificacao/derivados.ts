// O que um preço escolhido significa: lucro, margem real, markup, margem de contribuição, ponto de
// equilíbrio e desconto máximo. Puro, sem node:*.
//
// Nenhum destes números é opinião: cada um tem uma conta de uma linha, e é essa conta que o
// "por quê?" da tela abre com os valores do próprio usuário.
import type { Corredor } from "./corredor";
import { estadoDoPreco } from "./corredor";
import type { Estado } from "./tipos";

export type Derivados = {
  preco: number;
  /** O que sai em imposto e taxa percentual do canal, em reais. */
  taxas: number;
  /** A taxa fixa por transação do canal, em reais. */
  taxaFixa: number;
  /** Preço menos taxas menos custo total. Pode ser negativo. */
  lucro: number;
  /** Lucro sobre o preço, em fração. */
  margemLiquidaPct: number;
  /** Preço sobre o custo total. Infinity quando o custo é zero. */
  markup: number;
  /** O que sobra para pagar os custos fixos depois do imposto, da taxa e do custo direto. */
  margemContribuicao: number;
  /** Quantas unidades por mês pagam os fixos do balde deste item. `null` quando a contribuição é
   * zero ou negativa: nesse preço, nenhum volume fecha a conta. */
  pontoEquilibrio: number | null;
  /** Quanto dá para descontar antes de zerar o lucro, em fração. Zero quando já está no prejuízo. */
  descontoMaximoPct: number;
  /** O menor preço que ainda não dá prejuízo (o mesmo piso do corredor). */
  precoLucroZero: number;
  estado: Estado;
};

export function calcularDerivados(corredor: Corredor, preco: number): Derivados {
  const p = Number.isFinite(preco) ? Math.max(0, preco) : 0;
  const taxas = p * corredor.taxaTotalPct;
  const taxaFixa = corredor.taxaFixaCanal;
  const liquido = p - taxas - taxaFixa;
  const lucro = liquido - corredor.custo.total;
  const margemContribuicao = liquido - corredor.custo.direto;

  return {
    preco: p,
    taxas,
    taxaFixa,
    lucro,
    margemLiquidaPct: p > 0 ? lucro / p : 0,
    markup: corredor.custo.total > 0 ? p / corredor.custo.total : Infinity,
    margemContribuicao,
    pontoEquilibrio: margemContribuicao > 0 ? corredor.fixosDoBalde / margemContribuicao : null,
    descontoMaximoPct: p > 0 ? Math.max(0, (p - corredor.pisoPrejuizo) / p) : 0,
    precoLucroZero: corredor.pisoPrejuizo,
    estado: estadoDoPreco(corredor, p),
  };
}

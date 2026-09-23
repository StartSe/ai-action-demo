// O corredor de preço: os quatro marcadores numa chamada só. Puro, sem node:*.
//
// A ideia do produto inteira está aqui. Custo é piso, mercado é referência, valor é teto — e nenhum
// dos três vira o preço sozinho. O que o usuário escolhe é um ponto entre eles.
import { comporCusto, type ComposicaoCusto } from "./custo";
import { faixaDeMercado, type FaixaMercado } from "./mercado";
import { fixosDoBalde, taxaTotalPct } from "./rateio";
import type { Cenario, Estado } from "./tipos";

/**
 * A margem-alvo não cabe: imposto + taxa do canal + margem chegam ou passam de 100% do preço, e a
 * conta do markup divisor não tem solução. Em vez de quebrar a tela, o corredor devolve
 * `margemMaximaPct` e o painel explica o teto.
 */
export class PrecoImpossivelError extends Error {
  readonly taxaTotalPct: number;
  readonly margemAlvoPct: number;
  /** Margem que a conta jamais alcança com essa taxa total: 1 − taxa. */
  readonly margemMaximaPct: number;

  constructor(taxaTotal: number, margemAlvo: number) {
    super(`Com ${(taxaTotal * 100).toFixed(1)}% saindo em imposto e taxa, a margem de ${(margemAlvo * 100).toFixed(1)}% não cabe no preço.`);
    this.name = "PrecoImpossivelError";
    this.taxaTotalPct = taxaTotal;
    this.margemAlvoPct = margemAlvo;
    this.margemMaximaPct = Math.max(0, 1 - taxaTotal);
  }
}

/** Preço em que o lucro é exatamente zero: o custo total mais o que sai em imposto e taxa. */
export function precoLucroZero(custoTotal: number, taxaFixaCanal: number, taxaTotal: number): number {
  const sobra = 1 - taxaTotal;
  if (sobra <= 0) return Infinity;
  return (custoTotal + taxaFixaCanal) / sobra;
}

/** Markup divisor: o preço que entrega a margem-alvo depois de imposto, taxa e custo. */
export function precoDaMargem(custoTotal: number, taxaFixaCanal: number, taxaTotal: number, margemAlvo: number): number {
  const sobra = 1 - (taxaTotal + margemAlvo);
  if (sobra <= 0) throw new PrecoImpossivelError(taxaTotal, margemAlvo);
  return (custoTotal + taxaFixaCanal) / sobra;
}

export type Corredor = {
  custo: ComposicaoCusto;
  taxaTotalPct: number;
  taxaFixaCanal: number;
  margemAlvoPct: number;
  /** Abaixo disto o item dá prejuízo neste canal. Sempre existe. */
  pisoPrejuizo: number;
  /** Onde a margem-alvo é atingida. `null` quando a margem não cabe (ver `impossivel`). */
  pisoMargemAlvo: number | null;
  /** O que os concorrentes cobram. `null` quando nenhum preço foi cadastrado. */
  mercado: FaixaMercado | null;
  /** Teto declarado pelo usuário (nunca calculado). `null` quando não foi declarado. */
  tetoValor: number | null;
  /** Presente quando a margem-alvo não cabe na taxa total. */
  impossivel: PrecoImpossivelError | null;
  /** Fixos do balde do item, para o ponto de equilíbrio. */
  fixosDoBalde: number;
  /** Extremos sugeridos da régua, já com folga: o que a Bancada desenha. */
  escala: { min: number; max: number };
};

/** Um preço de partida honesto para um item recém-criado: a margem-alvo, ou o lucro zero quando ela
 * não cabe. */
export function precoSugerido(corredor: Corredor): number {
  return corredor.pisoMargemAlvo ?? corredor.pisoPrejuizo;
}

export function calcularCorredor(cenario: Cenario): Corredor {
  const { negocio, item, canal } = cenario;
  const custo = comporCusto(cenario);
  const taxaTotal = taxaTotalPct(negocio, item.tipo, canal.taxaPct);
  const taxaFixa = Math.max(0, Number(canal.taxaFixa) || 0);
  const margemAlvo = Math.max(0, item.margemAlvoPct ?? negocio.margemAlvoPadraoPct ?? 0);

  const pisoPrejuizo = precoLucroZero(custo.total, taxaFixa, taxaTotal);
  let pisoMargemAlvo: number | null = null;
  let impossivel: PrecoImpossivelError | null = null;
  try {
    pisoMargemAlvo = precoDaMargem(custo.total, taxaFixa, taxaTotal, margemAlvo);
  } catch (err) {
    if (err instanceof PrecoImpossivelError) impossivel = err;
    else throw err;
  }

  const mercado = faixaDeMercado(item);
  const tetoValor = Number.isFinite(Number(item.precoValorTeto)) && Number(item.precoValorTeto) > 0 ? Number(item.precoValorTeto) : null;

  const pontos = [pisoPrejuizo, pisoMargemAlvo, mercado?.min, mercado?.max, tetoValor].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0
  );
  const menor = pontos.length ? Math.min(...pontos) : 0;
  const maior = pontos.length ? Math.max(...pontos) : 1;
  const escala = { min: Math.max(0, menor * 0.8), max: maior * 1.25 || 1 };

  return {
    custo,
    taxaTotalPct: taxaTotal,
    taxaFixaCanal: taxaFixa,
    margemAlvoPct: margemAlvo,
    pisoPrejuizo,
    pisoMargemAlvo,
    mercado,
    tetoValor,
    impossivel,
    fixosDoBalde: fixosDoBalde(negocio, cenario.custosFixos, item.tipo),
    escala,
  };
}

/**
 * Em que degrau da escala de estado um preço cai. Quatro degraus, o mesmo significado na régua, nas
 * abas de canal e na lista de itens — e em nenhum outro lugar.
 */
export function estadoDoPreco(corredor: Corredor, preco: number): Estado {
  if (!Number.isFinite(preco) || preco < corredor.pisoPrejuizo) return "prejuizo";
  if (corredor.tetoValor !== null && preco > corredor.tetoValor) return "acima-do-teto";
  if (corredor.pisoMargemAlvo !== null && preco < corredor.pisoMargemAlvo) return "abaixo-do-alvo";
  if (corredor.pisoMargemAlvo === null) return "abaixo-do-alvo";
  return "saudavel";
}

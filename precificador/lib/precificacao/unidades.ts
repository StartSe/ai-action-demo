// Conversão entre a unidade em que o insumo é comprado e a unidade em que ele é usado.
// Puro, sem node:*: a ficha do item converte a cada tecla, no navegador.
//
// A tabela é deliberadamente curta (peso, volume, comprimento e unidade avulsa). Converter entre
// famílias diferentes — 200 ml de farinha para gramas — depende da densidade do insumo, que o app
// não tem e não vai pedir; nesses casos a conversão falha e a linha pede que as duas unidades sejam
// da mesma família.
import type { Unidade } from "./tipos";

export type Familia = "peso" | "volume" | "comprimento" | "unidade";

/** Quanto vale 1 unidade desta medida na unidade base da família (g, ml, cm, un). */
const FATOR: Record<Unidade, { familia: Familia; base: number }> = {
  kg: { familia: "peso", base: 1000 },
  g: { familia: "peso", base: 1 },
  mg: { familia: "peso", base: 0.001 },
  L: { familia: "volume", base: 1000 },
  ml: { familia: "volume", base: 1 },
  m: { familia: "comprimento", base: 100 },
  cm: { familia: "comprimento", base: 1 },
  un: { familia: "unidade", base: 1 },
};

export const UNIDADES = Object.keys(FATOR) as Unidade[];

export function familiaDa(unidade: Unidade): Familia {
  return FATOR[unidade].familia;
}

export function mesmaFamilia(a: Unidade, b: Unidade): boolean {
  return familiaDa(a) === familiaDa(b);
}

/**
 * Converte `qtd` de `de` para `para`. Devolve `null` quando as unidades são de famílias diferentes
 * (ex.: ml para g) — quem chama decide o que dizer na tela, em vez de receber um número errado.
 */
export function converter(qtd: number, de: Unidade, para: Unidade): number | null {
  if (!mesmaFamilia(de, para)) return null;
  return (qtd * FATOR[de].base) / FATOR[para].base;
}

/** Rótulo da unidade para a tela (as siglas já são o rótulo; existe para um único ponto de verdade). */
export function rotuloUnidade(unidade: Unidade): string {
  return unidade;
}

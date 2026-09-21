// Faixa de preço praticada pelos concorrentes cadastrados no item. Puro, sem node:*.
import type { Item } from "./tipos";

/** Com um único preço cadastrado, a "faixa" vira um ponto com esta tolerância para cada lado. */
export const TOLERANCIA_PRECO_UNICO = 0.05;

export type FaixaMercado = {
  min: number;
  max: number;
  /** Quantos preços de concorrente sustentam a faixa. Com 1, ela foi aberta pela tolerância. */
  quantidade: number;
};

/**
 * Mínimo e máximo dos preços de concorrente. Devolve `null` quando não há nenhum: o marcador de
 * mercado simplesmente não aparece no corredor, em vez de aparecer vazio.
 */
export function faixaDeMercado(item: Pick<Item, "precosConcorrentes">): FaixaMercado | null {
  const precos = (item.precosConcorrentes || []).map(Number).filter((p) => Number.isFinite(p) && p > 0);
  if (precos.length === 0) return null;
  if (precos.length === 1) {
    const p = precos[0];
    return { min: p * (1 - TOLERANCIA_PRECO_UNICO), max: p * (1 + TOLERANCIA_PRECO_UNICO), quantidade: 1 };
  }
  return { min: Math.min(...precos), max: Math.max(...precos), quantidade: precos.length };
}

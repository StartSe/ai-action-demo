// Orçamento mensal por categoria, cadastrado uma vez em /setup (components/OrcamentoCategorias.tsx).
// Usado para marcar, em cada leitura, as categorias que estouraram o orçamento (gráfico e resumo mensal).
// Server-only (importa lib/store.ts, que usa node:sqlite): componentes "use client" devem importar
// o tipo e o cálculo puro direto de lib/orcamento-calculo.ts, nunca deste arquivo.
import { getConfig, setConfig } from "./store";
import { orcamentoDaCategoria, type ItemOrcamento } from "./orcamento-calculo";

export type { ItemOrcamento };
export { orcamentoDaCategoria };

const CHAVE = "ORCAMENTO_CATEGORIAS";

export function getOrcamento(): ItemOrcamento[] {
  const bruto = getConfig(CHAVE);
  if (!bruto) return [];
  try {
    const salvo = JSON.parse(bruto) as ItemOrcamento[];
    return Array.isArray(salvo) ? salvo : [];
  } catch (err) {
    console.error("Falha ao ler o orçamento por categoria", err);
    return [];
  }
}

export function salvarOrcamento(itens: ItemOrcamento[]): void {
  setConfig(CHAVE, JSON.stringify(itens));
}

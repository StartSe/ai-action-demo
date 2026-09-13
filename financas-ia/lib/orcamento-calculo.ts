// Tipo e cálculo puros do orçamento por categoria, sem nenhum import de node:* — pode ser
// importado tanto por lib/orcamento.ts (server-only, lê/grava via lib/store.ts) quanto por
// componentes "use client" (GraficoCategorias, app/page.tsx) que só precisam comparar valores.
export type ItemOrcamento = { categoria: string; valorMensal: number };

/** Orçamento mensal cadastrado para uma categoria (comparação sem diferenciar maiúsculas/espaços), ou undefined se não houver. */
export function orcamentoDaCategoria(itens: ItemOrcamento[], categoria: string): number | undefined {
  const alvo = categoria.trim().toLowerCase();
  return itens.find((i) => i.categoria.trim().toLowerCase() === alvo)?.valorMensal;
}

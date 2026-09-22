// Formatação de moeda pt-BR, num arquivo sem nenhum import `node:*` (mesmo motivo de lib/formato.ts):
// lib/classificador.ts importa lib/historico.ts (node:sqlite) e não pode ser importado por valor a
// partir de um Client Component (app/page.tsx) sem quebrar o bundle do navegador — ver CLAUDE.md.
export function formatarMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

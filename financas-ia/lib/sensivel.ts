// Valor puro (sem node:sqlite/fs) para poder ser importado tanto por Client Components (app/page.tsx)
// quanto por lib/historico.ts (Server-only). Reexportado por lib/historico.ts.
// Financeiro lida com dados sensíveis (lançamentos e categorias de despesas); só salva com opt-in explícito (ver components/ui.tsx OptInGuardar).
export const SENSIVEL = true;

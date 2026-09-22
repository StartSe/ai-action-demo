// Valor puro (sem node:sqlite/fs) para poder ser importado tanto por Client Components (app/page.tsx)
// quanto por lib/historico.ts (Server-only). Reexportado por lib/historico.ts.
// true porque o histórico e os lançamentos novos são dados financeiros da empresa: só ficam salvos
// com opt-in explícito (OptInGuardar) e por prazo limitado (mesmo desenho de financas-ia/contratos-ia).
export const SENSIVEL = true;

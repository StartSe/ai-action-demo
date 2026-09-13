// Valor puro (sem node:sqlite/fs) para poder ser importado tanto por Client Components (app/page.tsx)
// quanto por lib/historico.ts (Server-only). Reexportado por lib/historico.ts.
// Voz do Cliente não está na lista de apps sensíveis do PRD (só Contratos e Financeiro).
export const SENSIVEL = false;

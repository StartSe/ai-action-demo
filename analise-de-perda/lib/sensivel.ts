// Valor puro (sem node:sqlite/fs) para poder ser importado tanto por Client Components (app/page.tsx)
// quanto por lib/historico.ts (Server-only). Reexportado por lib/historico.ts.
// As notas de perda podem citar clientes e valores de negócio reais: só ficam salvas com opt-in explícito.
export const SENSIVEL = true;

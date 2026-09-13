// Valor puro (sem node:sqlite/fs) para poder ser importado tanto por Client Components (app/page.tsx)
// quanto por lib/historico.ts (Server-only). Reexportado por lib/historico.ts.
// Contratos lida com dados sensíveis (o texto do contrato); só salva com opt-in explícito (ver components/ui.tsx OptInGuardar).
export const SENSIVEL = true;

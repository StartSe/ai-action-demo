// Chave do perfil acompanhado (temas + setor), sem imports node:*: usada por lib/rotinas-do-app.ts (servidor) e por
// app/page.tsx (reconhecer a rotina semanal já criada para os mesmos temas). Mesmo espírito de chavePerfil em
// prospeccao-ia/lib/leads-vistos.ts.
export function chavePerfil(temas: string[], setor?: string): string {
  return [...temas.map((t) => t.trim().toLowerCase()).sort(), (setor || "").trim().toLowerCase()].join("|");
}

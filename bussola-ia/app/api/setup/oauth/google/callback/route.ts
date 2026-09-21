// Integração removida do Bússola. URLs antigas não executam ações.
const removido = () => Response.json({ error: "Este recurso foi removido do Bússola de IA." }, { status: 410 });
export const GET = removido;

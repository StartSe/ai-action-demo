// Recurso removido do simulador. Não executa envios nem processa agentes externos.
export async function POST() { return Response.json({ error: "Este recurso foi removido do simulador." }, { status: 410 }); }

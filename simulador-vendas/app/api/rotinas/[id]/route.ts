// Recurso removido do simulador. Não executa envios nem processa agentes externos.
export async function PATCH() { return Response.json({ error: "Este recurso foi removido do simulador." }, { status: 410 }); }
export async function DELETE() { return Response.json({ error: "Este recurso foi removido do simulador." }, { status: 410 }); }

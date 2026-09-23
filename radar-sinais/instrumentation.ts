export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { limparExpirados } = await import("@/lib/historico");
    limparExpirados();
    const { limparExpirados: limparFormulariosExpirados } = await import("@/lib/formularios");
    limparFormulariosExpirados();

    const { listarRadares } = await import("@/lib/radares");
    listarRadares(); // Migra vínculos antes de iniciar agendas antigas.
    await import("@/lib/rotinas-do-app");
    const { executarVencidas } = await import("@/lib/rotinas");
    const { sincronizarAgendas } = await import("@/lib/agendas-radar");
    const atualizar = async () => { await sincronizarAgendas(); await executarVencidas(); };
    void atualizar().catch(err => console.error("Falha ao iniciar monitoramento", err));
    setInterval(() => { void atualizar().catch(err => console.error("Falha ao executar rotinas vencidas", err)); }, 60_000).unref();
  }
}

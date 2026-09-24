export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { limparExpirados } = await import("@/lib/historico");
    limparExpirados();
    const { limparExpirados: limparFormulariosExpirados } = await import("@/lib/formularios");
    limparFormulariosExpirados();
    const { limparPlanilhasExpiradas } = await import("@/lib/dados-store");
    limparPlanilhasExpiradas();

    await import("@/lib/rotinas-do-app");
    const { executarVencidas } = await import("@/lib/rotinas");
    setInterval(() => {
      executarVencidas().catch((err) => console.error("Falha ao executar rotinas vencidas", err));
    }, 60_000);
  }
}

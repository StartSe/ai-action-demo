export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { limparExpirados } = await import("@/lib/historico");
    limparExpirados();
    const { limparExpirados: limparFormulariosExpirados } = await import("@/lib/formularios");
    limparFormulariosExpirados();
    // O áudio e a foto que o cliente mandou moram no disco do app: o que passou de 90 dias sai de cena
    // (lib/anexos.ts). A própria limpeza só roda de 6 em 6 horas, mesmo sendo chamada a cada minuto.
    const { limparAntigos: limparAnexosAntigos } = await import("@/lib/anexos");
    limparAnexosAntigos({ forcar: true });

    await import("@/lib/rotinas-do-app");
    const { executarVencidas } = await import("@/lib/rotinas");
    setInterval(() => {
      executarVencidas().catch((err) => console.error("Falha ao executar rotinas vencidas", err));
      limparAnexosAntigos();
    }, 60_000);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { limparExpirados } = await import("@/lib/historico");
    limparExpirados();
    const { limparExpirados: limparFormulariosExpirados } = await import("@/lib/formularios");
    limparFormulariosExpirados();
    const { limparExpirados: limparSalasExpiradas } = await import("@/lib/salas");
    limparSalasExpiradas();

    // A demonstração (US-030) é semeada na subida do servidor, e não na primeira leitura de uma tela:
    // é uma vez por instalação, e o painel e a evolução precisam estar prontos antes da primeira
    // abertura. `semearDemonstracao` confere sozinha se pode semear e nunca lança.
    const { semearDemonstracao } = await import("@/lib/semear-demo");
    semearDemonstracao();

  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { limparExpirados } = await import("@/lib/historico");
    limparExpirados();
    const { limparExpirados: limparFormulariosExpirados } = await import("@/lib/formularios");
    limparFormulariosExpirados();

    // Vaga → Candidato → Entrevista (US-002): `banco()` cria as tabelas e roda, uma vez por
    // instalação, a migração dos scorecards antigos. Fica na subida, e não na primeira leitura de uma
    // tela, para ninguém pagar a varredura de `resultados` esperando uma página carregar. A migração
    // trata os próprios erros e nunca lança — o app sobe mesmo se ela falhar.
    const { banco } = await import("@/lib/banco");
    banco();

    await import("@/lib/rotinas-do-app");
    const { executarVencidas } = await import("@/lib/rotinas");
    setInterval(() => {
      executarVencidas().catch((err) => console.error("Falha ao executar rotinas vencidas", err));
    }, 60_000);
  }
}

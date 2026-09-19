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

    // Dados de exemplo (US-004): o app nasce cheio enquanto a IA não está conectada. Também é
    // chamado na primeira leitura de qualquer lista (lib/vagas.ts, lib/candidatos.ts,
    // lib/entrevistas.ts) — a marca em `config` é que garante "uma vez por instalação", venha o
    // gatilho de onde vier. Aqui na subida para que as telas já abram cheias, sem a primeira pessoa
    // esperar a semeadura; lá na leitura para a instalação que subiu antes desta versão existir.
    // Trata os próprios erros e nunca lança.
    const { semearDemonstracao } = await import("@/lib/semear-demo");
    semearDemonstracao();

    await import("@/lib/rotinas-do-app");
    const { executarVencidas } = await import("@/lib/rotinas");
    setInterval(() => {
      executarVencidas().catch((err) => console.error("Falha ao executar rotinas vencidas", err));
    }, 60_000);
  }
}

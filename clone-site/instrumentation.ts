export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { limparExpirados } = await import("@/lib/historico");
    limparExpirados();
    const { limparExpirados: limparFormulariosExpirados } = await import("@/lib/formularios");
    limparFormulariosExpirados();

    // Sites que estavam "gerando" quando o processo anterior morreu (deploy, plano gratuito adormecendo)
    // viram "falhou" com o motivo em português; a promessa em segundo plano não sobrevive ao reinício.
    const { encerrarAbandonados } = await import("@/lib/projetos");
    const encerrados = encerrarAbandonados({ naSubida: true });
    if (encerrados) console.error(`Sites encerrados por reinício do servidor: ${encerrados}`);

    await import("@/lib/rotinas-do-app");
    const { executarVencidas } = await import("@/lib/rotinas");
    setInterval(() => {
      executarVencidas().catch((err) => console.error("Falha ao executar rotinas vencidas", err));
      // Geração que passou de 15 minutos é encerrada como falha, para a tela não ficar "gerando" para sempre.
      try { encerrarAbandonados(); } catch (err) { console.error("Falha ao encerrar sites presos em geração", err); }
    }, 60_000);
  }
}

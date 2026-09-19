import type { AoProgressoConvite } from "./progresso-convite";
type Resultado = { ok: true; [chave: string]: unknown } | { ok: false; erro: string; status: number; codigo?: string; acao?: { rotulo: string; url: string } };
export async function respostaConvite(req: Request, executar: (progresso: AoProgressoConvite) => Promise<Resultado>) {
  if (!req.headers.get("accept")?.includes("application/x-ndjson")) {
    const r = await executar(() => {});
    if (!r.ok) return Response.json({ error: r.erro, codigo: r.codigo, acao: r.acao }, { status: r.status });
    return Response.json(Object.fromEntries(Object.entries(r).filter(([chave]) => chave !== "ok")));
  }
  let aberta = true;
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const enviar = (evento: unknown) => {
        if (aberta) { try { controller.enqueue(encoder.encode(JSON.stringify(evento) + "\n")); } catch { aberta = false; } }
      };
      const pulso = setInterval(() => enviar({ tipo: "aguardando" }), 10000);
      try {
        const r = await executar(etapa => enviar({ tipo: "progresso", etapa }));
        if (!r.ok) enviar({ tipo: "erro", error: r.erro, codigo: r.codigo, acao: r.acao });
        else enviar({ tipo: "resultado", dados: Object.fromEntries(Object.entries(r).filter(([chave]) => chave !== "ok")) });
      } catch (err) {
        console.error("Falha ao preparar convite:", err);
        enviar({ tipo: "erro", error: "Não foi possível concluir o convite. Seus dados foram mantidos; tente novamente." });
      } finally { clearInterval(pulso); if (aberta) controller.close(); }
    },
    // Fechar o diálogo não desfaz gravações nem interrompe a preparação no servidor.
    cancel() { aberta = false; },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}

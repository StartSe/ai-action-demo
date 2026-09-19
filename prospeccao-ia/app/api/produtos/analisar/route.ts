import type { EventoProduto } from "@/lib/produto-progresso";
import { responderErro } from "@/app/api/erros";
import { sugerirProdutoDoSite } from "@/lib/produto-ia";

/** Sugere produto + ICP a partir do site (ou de um parágrafo colado), para o formulário de edição do
 * "Criar com IA" em /produtos/novo?ia=1 (US-007). Nunca cria o produto: só devolve a sugestão. */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const entrada = typeof corpo?.entrada === "string" ? corpo.entrada.trim() : "";
  if (!entrada) {
    return Response.json({ error: "Cole o endereço do site ou escreva um parágrafo sobre o produto." }, { status: 400 });
  }
  if (req.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder();
    const abortar = new AbortController();
    const signal = AbortSignal.any([req.signal, abortar.signal, AbortSignal.timeout(300_000)]);
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream({
      start(controller) {
        const enviar = (evento: EventoProduto) => {
          if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(evento) + "\n"));
        };
        // Linhas vazias mantêm a conexão aberta durante a leitura externa mais demorada.
        heartbeat = setInterval(() => {
          if (!signal.aborted) controller.enqueue(encoder.encode("\n"));
        }, 15_000);
        void (async () => {
          try {
            enviar({ tipo: "progresso", etapa: "preparacao" });
            const resultado = await sugerirProdutoDoSite(entrada, etapa => enviar({ tipo: "progresso", etapa }), signal);
            enviar({ tipo: "resultado", resultado });
          } catch (erro) {
            if (!signal.aborted) {
              const resposta = await responderErro(erro, "Não foi possível analisar agora. Confira o link ou cole uma descrição do produto.").json();
              enviar({ tipo: "erro", error: resposta.error });
            }
          } finally {
            clearInterval(heartbeat);
            if (!abortar.signal.aborted) controller.close();
          }
        })();
      },
      cancel() { clearInterval(heartbeat); abortar.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  }
  try {
    const resultado = await sugerirProdutoDoSite(entrada);
    return Response.json(resultado);
  } catch (err) {
    return responderErro(err, "Não foi possível analisar agora. Tente de novo em um minuto.");
  }
}

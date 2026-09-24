/**
 * Fluxo de eventos do servidor para as telas abertas (0.3.0, US-004). Cada aba aberta mantém UMA
 * conexão aqui (`text/event-stream`, o `EventSource` do navegador, ver components/useEventos.ts) e
 * recebe um aviso curto sempre que algo muda no banco — quem escreve publica em lib/eventos.ts. O
 * aviso não traz a conversa: ele só diz "esta conversa mudou", e a tela consulta a rota que já existia.
 *
 * Por que eventos do servidor e não WebSocket: o fluxo é de mão única, não precisa de dependência nova
 * e é um GET comum, então a sessão e o proxy (proxy.ts) valem para ele como para qualquer rota privada.
 *
 * O `: ping` a cada 25 s existe para o proxy do Render (e qualquer intermediário) não derrubar uma
 * conexão parada: linha de comentário do protocolo, que o `EventSource` descarta sozinho.
 */
import { assinar, registrarConexao, type Evento } from "@/lib/eventos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** De quanto em quanto tempo sai a linha de vida. Bem abaixo do tempo ocioso de qualquer proxy comum. */
const PING_MS = 25_000;

export function GET(req: Request) {
  const codificador = new TextEncoder();
  let fechar = () => {};

  const fluxo = new ReadableStream<Uint8Array>({
    start(controller) {
      let fechado = false;
      let cancelarAssinatura = () => {};
      let tirarDoRegistro = () => {};

      const escrever = (texto: string) => {
        if (fechado) return;
        try {
          controller.enqueue(codificador.encode(texto));
        } catch {
          // A aba foi embora no meio da escrita: encerra em silêncio, sem estourar no log do servidor.
          fechar();
        }
      };

      fechar = () => {
        if (fechado) return;
        fechado = true;
        clearInterval(ping);
        cancelarAssinatura();
        tirarDoRegistro();
        try {
          controller.close();
        } catch {
          /* o fluxo já tinha sido encerrado do outro lado */
        }
      };

      const ping = setInterval(() => escrever(": ping\n\n"), PING_MS);
      escrever(": conectado\n\n");
      cancelarAssinatura = assinar((evento: Evento) => escrever(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`));
      // Registrado para o desligamento do processo fechar todas as conexões de uma vez: um fluxo
      // aberto seguraria o encerramento até o proxy desistir.
      tirarDoRegistro = registrarConexao(() => fechar());
      req.signal.addEventListener("abort", () => fechar());
    },
    cancel() {
      fechar();
    },
  });

  return new Response(fluxo, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      // Desliga o buffer de quem estiver na frente (nginx e parentes): com buffer, o aviso só chegaria
      // à tela quando a resposta fechasse, ou seja, nunca.
      "X-Accel-Buffering": "no",
    },
  });
}

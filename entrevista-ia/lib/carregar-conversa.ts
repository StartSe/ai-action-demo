/** Só repete a leitura da conversa. Reenviar respostas automaticamente poderia concorrer
 * com um turno ainda em processamento quando o proxy perde a conexão. */
export async function carregarConversaComRecuperacao(url: string, signal?: AbortSignal): Promise<Response> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      if (tentativa === 2 || ![502, 503, 504].includes(res.status)) return res;
      await res.body?.cancel();
    } catch (err) {
      if (signal?.aborted || tentativa === 2) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (tentativa + 1)));
    signal?.throwIfAborted();
  }
}

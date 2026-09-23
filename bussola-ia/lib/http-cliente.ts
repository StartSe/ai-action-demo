export async function requisitar<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, options);
  } catch (erro) {
    if (options?.signal?.aborted) {
      if (options.signal.reason?.name === "TimeoutError") {
        throw new Error(
          "A resposta demorou mais que o esperado. Verifique sua conexão e tente novamente.",
        );
      }
      throw erro;
    }
    throw new Error(
      "Não conseguimos falar com o app. Verifique sua conexão e tente novamente.",
    );
  }
  const d = await r.json().catch(() => {
    if (options?.signal?.aborted) {
      if (options.signal.reason?.name === "TimeoutError") {
        throw new Error(
          "A resposta demorou mais que o esperado. Verifique sua conexão e tente novamente.",
        );
      }
      options.signal.throwIfAborted();
    }
    throw new Error(
      "O servidor não respondeu como esperado. Tente novamente em instantes.",
    );
  });
  options?.signal?.throwIfAborted();
  if (!r.ok) {
    throw new Error(
      typeof d?.error === "string"
        ? d.error
        : "Não foi possível concluir. Tente novamente.",
    );
  }
  return d as T;
}

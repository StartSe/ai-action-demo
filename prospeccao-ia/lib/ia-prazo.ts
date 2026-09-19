/** Limita a espera local; uma resposta tardia não pode substituir a versão salva. */
export async function comPrazoIA<T>(operacao: Promise<T>, prazo = 180_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("A IA demorou além do esperado. Tente novamente em alguns minutos.")), prazo);
  });
  try { return await Promise.race([operacao, timeout]); }
  finally { clearTimeout(timer!); }
}

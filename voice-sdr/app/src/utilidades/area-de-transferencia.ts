/**
 * Copia e diz se conseguiu. A área de transferência depende de permissão do
 * navegador, e falhar nela não pode esconder o link de quem precisa dele.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}

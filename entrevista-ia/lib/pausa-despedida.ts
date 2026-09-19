/** A pausa começa depois que o áudio termina, nunca ao gerar o texto. */
export const PAUSA_DESPEDIDA_MS = 8000;
export function criarPausaDespedida(concluir: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelar = () => { clearTimeout(timer); timer = undefined; };
  return {
    cancelar,
    aguardar() { cancelar(); timer = setTimeout(() => { timer = undefined; concluir(); }, PAUSA_DESPEDIDA_MS); },
  };
}

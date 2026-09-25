// Se o tutorial já apareceu nesta carga da aplicação. É o que deixa o painel
// respeitar quem fechou o tutorial agora: a entrada seguinte (um recarregamento,
// outro login) volta a abri-lo onde parou. Vive na memória de propósito.

let apareceu = false

export function marcarTutorialVisto(): void {
  apareceu = true
}

export function tutorialVistoNestaCarga(): boolean {
  return apareceu
}

/** Uma carga nova da aplicação. Só `montarAplicacao` chama: cada montagem de teste é uma carga. */
export function esquecerTutorialVisto(): void {
  apareceu = false
}

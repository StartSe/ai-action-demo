// Entregar um arquivo que o servidor mandou no corpo da resposta, sem navegar.
//
// A exportação de leads (`lead-export`) devolve o CSV como texto, e não como
// um endereço para abrir: o pedido é POST e leva a sessão no cabeçalho, então
// não existe URL que alguém possa seguir. O jeito de transformar texto em
// arquivo salvo é o âncora com `download` sobre um endereço de objeto.
//
// **Em jsdom não há download**, e por isso `baixarTexto` devolve `false` ali em
// vez de fingir. `URL.createObjectURL` não existe no ambiente dos testes de
// componente, e um âncora clicado com endereço real faria o jsdom reclamar de
// navegação não implementada. O que o teste de tela mede é o que ele pode
// medir: que a exportação pediu o recorte certo e que a tela relatou o que
// voltou. O download em si é do navegador, e a verificação dele é manual, como
// diz docs/PRD-implementacao.md seção 9.1.

/** O tipo do CSV que a borda devolve, com a codificação declarada. */
export const TIPO_CSV = 'text/csv;charset=utf-8'

/**
 * Salva `conteudo` como um arquivo chamado `nome`. Devolve `false` quando o
 * ambiente não sabe criar endereço de objeto — jsdom é o caso —, e aí nada
 * acontece.
 */
export function baixarTexto(
  nome: string,
  conteudo: string,
  tipo: string = TIPO_CSV,
): boolean {
  if (typeof URL.createObjectURL !== 'function') return false

  // O `try` não é zelo genérico: o ambiente dos testes tem a função e ela
  // levanta, porque o `Blob` dali não é o que o shim espera. Falha em criar o
  // endereço é ambiente sem download, e a tela precisa de um booleano, não de
  // uma exceção subindo por uma ação que já terminou no servidor.
  try {
    const endereco = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
    const ancora = document.createElement('a')
    ancora.href = endereco
    ancora.download = nome
    ancora.click()

    // O endereço de objeto segura o conteúdo em memória até ser revogado, e o
    // clique já copiou o que precisava.
    URL.revokeObjectURL(endereco)
    return true
  } catch {
    return false
  }
}

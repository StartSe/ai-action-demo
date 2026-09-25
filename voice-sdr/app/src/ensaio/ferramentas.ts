import type { FerramentaDoEnsaio } from '@/ensaio/tipos'

/**
 * As ferramentas na ordem do instante em que foram acionadas (`at` de
 * `call_tool_invocations`), e não na ordem em que a leitura as trouxe.
 *
 * É assim que a fatia fecha o critério: a tela mostra o que o provedor fez. As
 * nossas ferramentas gravam durante a conversa e as de sistema só na
 * finalização (US-107), então a ordem de chegada mente sobre a de execução.
 * Instante empatado ou ilegível mantém a ordem recebida.
 */
export function emOrdemDoInstante(
  lista: readonly FerramentaDoEnsaio[],
): FerramentaDoEnsaio[] {
  return lista
    .map((item, indice) => ({ item, indice, instante: Date.parse(item.em) }))
    .sort((a, b) => {
      const diferenca =
        (Number.isNaN(a.instante) ? Infinity : a.instante) -
        (Number.isNaN(b.instante) ? Infinity : b.instante)
      return Number.isNaN(diferenca) || diferenca === 0 ? a.indice - b.indice : diferenca
    })
    .map(({ item }) => item)
}

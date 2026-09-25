// O que uma ferramenta nossa declara sobre si mesma, num lugar que o compilador
// da publicação, o esqueleto e os testes leem juntos (US-137).
//
// **O descritor é dado.** Nome, descrição, esquema de entrada, propósitos e
// prazo de resposta ficam numa constante por ferramenta, e quem decide o
// conjunto de cada publicação continua sendo o catálogo em
// `../agente/compilador.ts`, que lê o descritor em vez de repetir a lista de
// propósitos. Duas cópias da mesma lista divergem no primeiro ajuste, e a
// divergência só aparece como 409 no meio de uma ligação.
//
// **O prazo mora aqui** porque é propriedade da ferramenta publicada
// (`response_timeout_secs`, P-01), e o compilador o reexporta com o nome de
// sempre. Com ele no compilador, o descritor precisaria importar o compilador
// que o importa.
//
// Módulo portável: sem `Deno`, sem rede, sem banco.

import type { Proposito } from '../playbook/camada-um.ts'

/**
 * Prazo de resposta de ferramenta, em segundos, explícito na publicação (P-01).
 *
 * A premissa frágil era "acima de 3 s o provedor corta a conexão", apresentada
 * como fato externo. O prazo é configurável e o padrão do provedor é maior: o
 * corte é escolha nossa, e por isso viaja escrito. A meta de experiência
 * continua sendo 2 s no p95, e quem a mede é a sonda.
 */
export const PRAZO_DE_FERRAMENTA_SEGUNDOS = 5

/** Um campo que o modelo manda no corpo de uma ferramenta nossa. */
export type CampoDaFerramenta = {
  readonly chave: string
  readonly descricao: string
  readonly obrigatorio: boolean
  /** Valores aceitos, quando o campo é código. */
  readonly valores?: readonly string[]
  /**
   * O tipo do valor. Ausente é texto, que é o caso de quase todo campo; só
   * entra quando o módulo da ferramenta lê número ou objeto, porque o modelo
   * manda o que o esquema declara.
   */
  readonly tipo?: 'number' | 'object'
}

/** O que o modelo lê sobre uma ferramenta nossa: para que serve e o que mandar. */
export type DescricaoDaFerramenta = {
  readonly descricao: string
  readonly campos: readonly CampoDaFerramenta[]
}

/** O descritor inteiro de uma ferramenta nossa. */
export type DescritorDeFerramenta = DescricaoDaFerramenta & {
  /** O nome da função de borda, como ele viaja na publicação. */
  readonly nome: string
  /** Os propósitos em que ela existe (docs/PRD-implementacao.md seção 5). */
  readonly propositos: readonly Proposito[]
  readonly prazoDeRespostaSegundos: number
}

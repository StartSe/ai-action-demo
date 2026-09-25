// Pontuação e temperatura do lead, com a régua em configuração (US-133).
//
// **A régua é dado, não código.** Critérios, pesos e os dois cortes de
// temperatura entram por parâmetro; o módulo não carrega peso embutido e recusa
// régua cujos pesos não somem 100 (`regua_invalida`). Ajustar os pesos é editar
// configuração.
//
// **REGUA_DE_EXEMPLO É PROVISÓRIA.** DEPENDE DA PERGUNTA 1 EM ABERTO (seção 13
// de docs/PRD.md): os critérios objetivos de qualificação e os pesos concretos
// saem da definição de lead qualificado. O que está aqui é o mecanismo, a
// validação e uma régua para a conta nova não nascer sem nenhuma.
//
// **Resposta não confirmada vai vazia e não pontua** (seção 9 de docs/PRD.md):
// critério sem resposta conta como faltando, nunca como negativo. "Perguntei e
// a resposta desqualifica" é outra coisa, e vai em `criteriosReprovados`.
//
// **Temperatura não é sentimento.** Temperatura mede o quanto o lead serve;
// sentimento mede como a conversa correu. Uma conversa simpática com quem não
// tem orçamento é fria e positiva ao mesmo tempo.
//
// Módulo portável, sem Deno e sem import de rede, importável pela interface por
// `@compartilhado/qualificacao/pontuacao.ts`.

export const TEMPERATURAS = ['frio', 'morno', 'quente'] as const
export type Temperatura = (typeof TEMPERATURAS)[number]

export interface CriterioDaRegua {
  readonly key: string
  readonly peso: number
}

export interface Regua {
  readonly criterios: readonly CriterioDaRegua[]
  /** Score a partir do qual o lead é morno, e a partir do qual é quente. */
  readonly cortes: { readonly morno: number; readonly quente: number }
}

/**
 * O que a conversa confirmou, por chave de critério. `true` atende, `false`
 * foi perguntado e desqualifica, ausente ou `null` não foi confirmado.
 */
export type Respostas = Readonly<Record<string, boolean | null | undefined>>

export type Pontuacao =
  | {
      readonly ok: true
      readonly score: number
      readonly temperatura: Temperatura
      readonly criteriosAtendidos: readonly string[]
      readonly criteriosFaltando: readonly string[]
      readonly criteriosReprovados: readonly string[]
    }
  | { readonly ok: false; readonly motivo: 'regua_invalida' }

/** PROVISÓRIA: depende da pergunta 1 da seção 13 de docs/PRD.md. */
export const REGUA_DE_EXEMPLO: Regua = Object.freeze({
  criterios: Object.freeze([
    { key: 'dor_confirmada', peso: 30 },
    { key: 'orcamento', peso: 25 },
    { key: 'decisor', peso: 25 },
    { key: 'prazo', peso: 20 },
  ]),
  cortes: Object.freeze({ morno: 40, quente: 70 }),
})

const INTEIRO_NA_FAIXA = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max

/** A régua é válida: chaves únicas, pesos inteiros que somam 100, cortes em ordem. */
export function reguaValida(regua: Regua): boolean {
  if (!regua || !Array.isArray(regua.criterios) || regua.criterios.length === 0) return false
  const chaves = new Set<string>()
  let soma = 0
  for (const criterio of regua.criterios) {
    if (typeof criterio?.key !== 'string' || criterio.key.trim() === '') return false
    if (chaves.has(criterio.key)) return false
    if (!INTEIRO_NA_FAIXA(criterio.peso, 0, 100)) return false
    chaves.add(criterio.key)
    soma += criterio.peso
  }
  if (soma !== 100) return false
  const cortes = regua.cortes
  return (
    INTEIRO_NA_FAIXA(cortes?.morno, 1, 100) &&
    INTEIRO_NA_FAIXA(cortes?.quente, 1, 100) &&
    cortes.morno < cortes.quente
  )
}

export function temperaturaDoScore(score: number, cortes: Regua['cortes']): Temperatura {
  if (score >= cortes.quente) return 'quente'
  if (score >= cortes.morno) return 'morno'
  return 'frio'
}

export function calcularPontuacao(respostas: Respostas, regua: Regua): Pontuacao {
  if (!reguaValida(regua)) return { ok: false, motivo: 'regua_invalida' }

  const atendidos: string[] = []
  const faltando: string[] = []
  const reprovados: string[] = []
  let score = 0

  for (const criterio of regua.criterios) {
    const resposta = Object.prototype.hasOwnProperty.call(respostas, criterio.key)
      ? respostas[criterio.key]
      : undefined
    if (resposta === true) {
      atendidos.push(criterio.key)
      score += criterio.peso
    } else if (resposta === false) {
      reprovados.push(criterio.key)
    } else {
      faltando.push(criterio.key)
    }
  }

  return {
    ok: true,
    score,
    temperatura: temperaturaDoScore(score, regua.cortes),
    criteriosAtendidos: atendidos,
    criteriosFaltando: faltando,
    criteriosReprovados: reprovados,
  }
}

// O aviso de gravação lido da transcrição (L-23, RF-420, RF-810).
//
// `consent_notice_at` é o instante do turno em que a Sarah **disse** o aviso, e
// não o início da chamada nem a hora da finalização: consentimento só vale se o
// aviso veio antes da conversa, e a prova disso é o turno.
//
// **Aviso não encontrado é ausente, nunca presumido.** A primeira fala da conta
// pode ter sido reescrita sem o aviso, a ligação pode ter caído antes de a
// Sarah falar, o provedor pode ter transcrito outra coisa. Em todos esses casos
// `consent_notice_at` fica nulo e `consent_records` registra a ausência com
// `granted` falso — um registro que diz "avisamos" sem o turno que o prove é
// pior do que registro nenhum, porque é ele que se apresenta numa reclamação.
//
// **Como se reconhece o aviso.** O modelo é o texto da conta
// (`account_settings.recording_notice_text`) ou, sem ele, a frase da camada 1.
// Os marcadores (`{nome_do_lead}`, `{empresa}`) variam por chamada, então o
// que se procura é o **maior trecho literal** do modelo, normalizado sem acento,
// caixa e pontuação. Na frase padrão é "antes da gente começar: essa ligação é
// gravada, tudo bem?" — o pedaço que diz que há gravação, e o único que não
// depende de quem é o lead.
//
// **`granted` é o aviso seguido de resposta do lead.** A frase termina em
// pergunta; quem respondeu e seguiu na ligação consentiu, e a resposta vai na
// evidência. Aviso dado sem nenhuma fala do lead depois (caixa postal, queda)
// é aviso dado e consentimento não obtido, e fica registrado assim.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { FALAS_DE_TODO_PROPOSITO } from '../_shared/speech/todos-os-propositos.ts'

import type { TurnoDaConversa } from './formato-do-provedor.ts'

const MARCADOR = /\{[a-z_]+\}/g

/** O que `consent_records` recebe, com as chaves da tabela. */
export interface LeituraDoAviso {
  /** O turno do aviso, em segundos desde o início. Nulo é aviso ausente. */
  readonly segundo: number | null
  readonly concedido: boolean
  readonly evidencia: Readonly<Record<string, unknown>>
}

/** Texto sem acento, sem caixa e sem pontuação, com um espaço entre palavras. */
export function normalizarFala(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** O maior trecho literal do modelo, normalizado. Vazio quando o modelo é só marcador. */
export function trechoDoAviso(modelo: string): string {
  let maior = ''
  for (const pedaco of modelo.split(MARCADOR)) {
    const normalizado = normalizarFala(pedaco)
    if (normalizado.length > maior.length) maior = normalizado
  }
  return maior
}

/** O modelo que vale para a conta: o texto dela, ou a frase da camada 1. */
export function modeloDoAviso(textoDaConta: string | null): string {
  const proprio = textoDaConta?.trim()
  return proprio ? proprio : FALAS_DE_TODO_PROPOSITO.avisoDeGravacao
}

/**
 * Os trechos que reconhecem o aviso: o maior trecho literal do modelo da conta
 * e os do critério `aviso_gravacao` da conta (`evaluation_criteria.trechos`).
 * É a mesma lista que a avaliação automática aplica, e é por isso que o turno
 * do consentimento e o do critério aprovado são o mesmo (US-142).
 */
export function trechosDoAviso(textoDaConta: string | null, trechosDoCriterio: readonly string[] = []): string[] {
  const doModelo = trechoDoAviso(modeloDoAviso(textoDaConta))
  const todos = [doModelo, ...trechosDoCriterio.map(normalizarFala)].filter((trecho) => trecho !== '')
  return [...new Set(todos)]
}

/** Procura o aviso nos turnos da Sarah, na ordem em que foram ditos. */
export function lerAvisoDeGravacao(
  turnos: readonly TurnoDaConversa[],
  textoDaConta: string | null,
  trechosDoCriterio: readonly string[] = [],
): LeituraDoAviso {
  const trechos = trechosDoAviso(textoDaConta, trechosDoCriterio)
  const indice = turnos.findIndex(
    (turno) => turno.quem === 'agent' && trechos.some((trecho) => normalizarFala(turno.texto).includes(trecho)),
  )

  const turno = indice >= 0 ? turnos[indice] : undefined
  if (!turno) {
    return { segundo: null, concedido: false, evidencia: { aviso: 'ausente' } }
  }

  const resposta = turnos.slice(indice + 1).find((seguinte) => seguinte.quem === 'lead')
  return {
    segundo: turno.segundo,
    concedido: resposta !== undefined,
    evidencia: {
      aviso: 'encontrado',
      turno: indice,
      segundo: turno.segundo,
      fala: turno.texto,
      resposta_do_lead: resposta?.texto ?? null,
    },
  }
}

// Falas do resgate de reunião (RF-604): a ligação para quem tinha uma conversa
// marcada que não aconteceu.
//
// **A fala NUNCA afirma que a pessoa faltou: ela pergunta (T-17).** A ligação
// que acusa falta sem atestado é a mais destrutiva do produto: o especialista
// pode ter atrasado, o link pode ter quebrado, a reunião pode ter acontecido
// por outro canal. Por isso o resgate só existe depois de a falta ser atestada
// por gente (US-197), e mesmo assim a Sarah pergunta como foi, não informa o
// que houve. `resgate.test.ts` varre as falas atrás de uma lista de
// expressões proibidas.
//
// O horário sai do mesmo formatador do lembrete e da marcação (`falarHorario`,
// no fuso do lead, T-21). Módulo portável: sem Deno, sem rede, sem banco.

import { falarHorario } from './agenda.ts'
import type { ReuniaoFalada } from './lembrete.ts'

function comQuem(nome: string | null): string {
  const limpo = nome?.trim() ?? ''
  return limpo === '' ? 'com o nosso especialista' : `com ${limpo}`
}

/**
 * O motivo da ligação de resgate, dito depois da abertura: a conversa que
 * estava marcada, a pergunta aberta sobre como foi, e a oferta de um horário
 * novo.
 */
export function montarFalaDeResgate(reuniao: ReuniaoFalada, agora: string): string {
  return (
    `A gente tinha uma conversa marcada ${comQuem(reuniao.nomeDoEspecialista)} ${falarHorario(reuniao, agora)},` +
    ' e eu queria saber como ficou pra você. Se ainda fizer sentido, eu já vejo um horário novo, pode ser?'
  )
}

export const FALAS_DO_RESGATE = {
  /** A pessoa não quer um horário novo. Agradece e não insiste. */
  semInteresse: 'Tranquilo, valeu por me contar. Se mudar de ideia, é só chamar a gente.',
} as const

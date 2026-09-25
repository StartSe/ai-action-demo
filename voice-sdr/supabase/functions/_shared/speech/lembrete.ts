// Falas do lembrete de reunião (RF-601 a RF-603): o motivo da ligação, a
// presença confirmada, a remarcação e o cancelamento feitos na mesma ligação.
//
// Quem as emite é o servidor: o contexto da chamada de lembrete
// (`call-init`) e as respostas de `tool-confirm-meeting` e `tool-reschedule`.
// Por isso moram aqui, e não em `app/src/copy/`. O registro é o da fala
// (docs/padrao-de-interface.md seção 4): frase curta, contração, a razão dita.
//
// **O horário tem um formatador só**, `falarHorario` de `./agenda.ts`: no
// fuso do lead, com o relógio do especialista quando é outro (T-21). Quem
// ouviu "terça às 14h" na marcação não pode ouvir "dia 6, 14:00" no lembrete.
//
// **As frases são função de dado**, não texto com buraco: o nome do lead e o
// do especialista entram só quando existem, e a frase sem eles é outra frase
// inteira, pela doutrina de `todos-os-propositos.ts` (marcador que some deixa
// buraco).
//
// Nenhuma fala cita identificador: a chamada se identifica por cabeçalho, e o
// esqueleto das ferramentas recusa fala que carregue um (T-09).
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { falarHorario, type HorarioFalado } from './agenda.ts'
import { FALAS_DAS_FERRAMENTAS } from './ferramentas.ts'

/** O que a fala do lembrete precisa saber da reunião. */
export interface ReuniaoFalada extends HorarioFalado {
  /** `specialists.name`. Nulo quando a conta não o cadastrou. */
  readonly nomeDoEspecialista: string | null
  /** `meetings.modality`: `video`, `telefone` ou `presencial`. */
  readonly modalidade: string
}

const MODALIDADES_FALADAS: Readonly<Record<string, string>> = {
  video: 'por vídeo',
  telefone: 'por telefone',
  presencial: 'presencial',
}

function comQuem(nome: string | null): string {
  const limpo = nome?.trim() ?? ''
  return limpo === '' ? 'com o nosso especialista' : `com ${limpo}`
}

function como(modalidade: string): string {
  const falada = MODALIDADES_FALADAS[modalidade]
  return falada === undefined ? '' : `, ${falada}`
}

/**
 * O motivo da ligação de lembrete, dito logo depois da abertura: com quem é a
 * conversa, quando, e as duas saídas (confirmar ou pedir outro horário).
 */
export function montarFalaDeLembrete(reuniao: ReuniaoFalada, agora: string): string {
  return (
    `Tô ligando pra lembrar da sua conversa ${comQuem(reuniao.nomeDoEspecialista)}` +
    ` ${falarHorario(reuniao, agora)}${como(reuniao.modalidade)}.` +
    ' Tá tudo certo pra você participar, ou prefere que eu veja outro horário?'
  )
}

/** A presença confirmada por `tool-confirm-meeting`. */
export function falarPresencaConfirmada(reuniao: ReuniaoFalada, agora: string): string {
  return `Perfeito, tá confirmado: ${falarHorario(reuniao, agora)}. Até lá!`
}

/** A reunião remarcada por `tool-reschedule`, no horário novo. */
export function falarRemarcacao(horario: HorarioFalado, agora: string): string {
  return `Pronto, remarquei pra ${falarHorario(horario, agora)}. Vou te mandar o convite novo por e-mail.`
}

export const FALAS_DO_LEMBRETE = {
  /** A reunião cancelada a pedido do lead. Não insiste. */
  cancelada: 'Tudo bem, cancelei a conversa. Se quiser marcar de novo, é só chamar a gente.',
  /**
   * A chamada não tem reunião que se possa confirmar: não há reunião ligada a
   * ela, ou a reunião já foi cancelada ou remarcada por outro caminho. A Sarah
   * não inventa estado nenhum e segue a conversa.
   */
  semReuniao: FALAS_DAS_FERRAMENTAS.falha,
  /** A reunião já não está de pé (cancelada, remarcada ou já aconteceu). */
  naoEstaMaisMarcada: 'Vi aqui que essa conversa não tá mais marcada. Quer que eu veja um horário novo pra você?',
  /** O pedido de remarcação sem ação conhecida. */
  remarcarOuCancelar: 'Você prefere que eu veja outro horário ou que cancele a conversa?',
} as const

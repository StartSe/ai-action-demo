// A decisão do lembrete de reunião (RF-601, primeiro critério de aceite da F6).
//
// A cada minuto, `cron-meeting-reminder` olha as reuniões da conta e liga para
// quem tem reunião começando daqui a pouco. Este módulo diz quais entram e por
// quê, e quais ficam de fora e por quê.
//
// Três decisões atravessam o arquivo:
//
// 1. **A janela é relativa ao começo da reunião, e o fuso não muda a conta.**
//    Entra a reunião que começa entre `agora + inicio` e `agora + fim`, as duas
//    bordas inclusive. Instante é instante: "daqui a 20 minutos" é o mesmo
//    número em São Paulo e em Manaus. O fuso do lead volta na decisão porque é
//    nele que a fala diz o horário (T-21), e não porque decide alguma coisa.
// 2. **O que já passou nunca é lembrado.** A rotina parada por uma hora e
//    retomada lembra só o que ainda está na janela; o resto sai com
//    `depois_da_janela`. Uma queda de 30 minutos não vira uma enxurrada de
//    lembretes atrasados para reuniões que já começaram.
// 3. **A mesma regra vive no SQL** (`enfileirar_lembretes_de_reuniao`), que
//    reivindica e enfileira na mesma transação. A ponte é
//    `casos-de-lembrete.ts`, exercitada pelos dois lados.
//
// Motivo é código, nunca frase. Módulo portável (`_shared/`): sem Deno, sem
// rede e sem banco; o relógio entra por parâmetro.

import { resolverFuso } from '../discagem/janela.ts'

export type MotivoDoLembrete =
  | 'na_janela'
  | 'antes_da_janela'
  | 'depois_da_janela'
  | 'ja_lembrada'
  | 'status_nao_elegivel'
  | 'sem_telefone'

/** `reminder_window_start_minutes` e `reminder_window_end_minutes` da conta. */
export interface JanelaDoLembrete {
  readonly inicioEmMinutos: number
  readonly fimEmMinutos: number
}

/** Uma reunião no recorte que a decisão lê. */
export interface ReuniaoParaLembrete {
  readonly id: string
  /** `meetings.status`. Só `scheduled` é lembrada. */
  readonly status: string
  /** `meetings.starts_at`, ISO-8601. */
  readonly startsAt: string
  /** `meetings.reminder_sent_at`. */
  readonly reminderSentAt: string | null
  /** `leads.phone_e164`. */
  readonly telefoneDoLead: string | null
  /** `leads.timezone`. */
  readonly fusoDoLead: string | null
}

export interface ReuniaoEscolhida {
  readonly reuniao: ReuniaoParaLembrete
  readonly motivo: 'na_janela'
  /** O fuso em que a fala diz o horário: o do lead, ou o da conta. */
  readonly fuso: string
}

export interface ReuniaoRecusada {
  readonly reuniao: ReuniaoParaLembrete
  readonly motivo: Exclude<MotivoDoLembrete, 'na_janela'>
}

export interface PedidoDeLembretes {
  readonly reunioes: readonly ReuniaoParaLembrete[]
  readonly agora?: () => number
  readonly janela: JanelaDoLembrete
  readonly fusoDaConta: string
}

export interface DecisaoDeLembretes {
  readonly lembrar: readonly ReuniaoEscolhida[]
  readonly recusadas: readonly ReuniaoRecusada[]
}

const MINUTO_MS = 60_000

/** O motivo de uma reunião, na ordem em que as regras se aplicam. */
export function motivoDoLembrete(
  reuniao: ReuniaoParaLembrete,
  agora: number,
  janela: JanelaDoLembrete,
): MotivoDoLembrete {
  if (reuniao.reminderSentAt !== null) return 'ja_lembrada'
  if (reuniao.status !== 'scheduled') return 'status_nao_elegivel'
  if (reuniao.telefoneDoLead === null || reuniao.telefoneDoLead.trim() === '') return 'sem_telefone'
  const inicio = Date.parse(reuniao.startsAt)
  if (Number.isNaN(inicio)) throw new Error(`starts_at não é instante ISO-8601: ${reuniao.startsAt}`)
  if (inicio < agora + janela.inicioEmMinutos * MINUTO_MS) return 'depois_da_janela'
  if (inicio > agora + janela.fimEmMinutos * MINUTO_MS) return 'antes_da_janela'
  return 'na_janela'
}

/** Quais reuniões lembrar agora, e por que cada uma das outras fica de fora. */
export function decidirLembretes(pedido: PedidoDeLembretes): DecisaoDeLembretes {
  const { janela } = pedido
  conferirJanela(janela)
  const agora = (pedido.agora ?? Date.now)()

  const lembrar: ReuniaoEscolhida[] = []
  const recusadas: ReuniaoRecusada[] = []
  for (const reuniao of pedido.reunioes) {
    const motivo = motivoDoLembrete(reuniao, agora, janela)
    if (motivo === 'na_janela') {
      lembrar.push({ reuniao, motivo, fuso: resolverFuso(reuniao.fusoDoLead, pedido.fusoDaConta) })
    } else {
      recusadas.push({ reuniao, motivo })
    }
  }
  return { lembrar, recusadas }
}

function conferirJanela(janela: JanelaDoLembrete): void {
  const { inicioEmMinutos: inicio, fimEmMinutos: fim } = janela
  if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio < 0 || fim <= inicio) {
    throw new RangeError(`janela do lembrete inválida: de ${inicio} a ${fim} minutos`)
  }
}

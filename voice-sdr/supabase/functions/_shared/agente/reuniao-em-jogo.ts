// A reunião em jogo numa chamada de lembrete ou de resgate, como as bordas a
// leem de `public.reuniao_em_jogo` (US-194 a US-196).
//
// `call-init` a transforma no motivo da ligação, que vai no contexto do lead;
// `tool-confirm-meeting` e `tool-reschedule` agem sobre ela. Um leitor só da
// linha, para as três bordas não lerem a mesma função SQL de três jeitos.
//
// **O motivo da ligação vai em `contexto_do_lead`**, a variável que o prompt
// publicado já cita (`VARIAVEIS_DA_CHAMADA`): o roteiro de camada 2 do
// lembrete e do resgate manda dizê-lo logo depois da abertura. Uma variável
// nova mudaria o hash de todas as publicações para dizer uma coisa que o
// contexto já carrega.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import type { ReuniaoFalada } from '../speech/lembrete.ts'
import { montarFalaDeLembrete } from '../speech/lembrete.ts'
import { montarFalaDeResgate } from '../speech/resgate.ts'

/** Uma linha de `reuniao_em_jogo`, lida. */
export interface ReuniaoEmJogo extends ReuniaoFalada {
  readonly id: string
  readonly contaId: string
  readonly leadId: string | null
  readonly status: string
  readonly fim: string
  readonly especialistaId: string
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

function instante(valor: unknown, campo: string): string {
  const bruto = typeof valor === 'string' ? valor : valor instanceof Date ? valor.toISOString() : ''
  const ms = Date.parse(bruto)
  if (Number.isNaN(ms)) throw new Error(`reuniao_em_jogo devolveu ${campo} ilegível`)
  return new Date(ms).toISOString()
}

/** A linha crua da função SQL, ou nula quando ela não devolveu nada. */
export function lerReuniaoEmJogo(linha: Readonly<Record<string, unknown>> | null | undefined): ReuniaoEmJogo | null {
  if (!linha) return null
  const id = texto(linha.meeting_id)
  const contaId = texto(linha.account_id)
  const especialistaId = texto(linha.specialist_id)
  const status = texto(linha.status)
  const fusoDoLead = texto(linha.lead_timezone)
  const fusoDoEspecialista = texto(linha.specialist_timezone)
  if (!id || !contaId || !especialistaId || !status || !fusoDoLead || !fusoDoEspecialista) {
    throw new Error('reuniao_em_jogo devolveu linha incompleta')
  }
  return {
    id,
    contaId,
    leadId: texto(linha.lead_id),
    status,
    inicio: instante(linha.starts_at, 'starts_at'),
    fim: instante(linha.ends_at, 'ends_at'),
    modalidade: texto(linha.modality) ?? '',
    especialistaId,
    nomeDoEspecialista: texto(linha.specialist_name),
    fusoDoLead,
    fusoDoEspecialista,
  }
}

/** Os propósitos cuja ligação é sobre uma reunião que já existe. */
export const PROPOSITOS_DE_REUNIAO = ['reminder', 'rescue'] as const

export function propositoDeReuniao(proposito: string): proposito is (typeof PROPOSITOS_DE_REUNIAO)[number] {
  return (PROPOSITOS_DE_REUNIAO as readonly string[]).includes(proposito)
}

/**
 * O que vai em `contexto_do_lead` numa ligação de lembrete ou de resgate: o
 * motivo da ligação, já com o horário no fuso do lead, para o roteiro mandar
 * dizer depois da abertura. Nulo nos outros propósitos.
 */
export function contextoDaReuniao(proposito: string, reuniao: ReuniaoFalada, agora: string): string | null {
  if (proposito === 'reminder') {
    return `Motivo da ligação, para dizer logo depois da abertura: ${montarFalaDeLembrete(reuniao, agora)}`
  }
  if (proposito === 'rescue') {
    return `Motivo da ligação, para dizer logo depois da abertura: ${montarFalaDeResgate(reuniao, agora)}`
  }
  return null
}

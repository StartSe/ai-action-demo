// O que o desfecho decide antes de desenhar (US-181): as marcações lidas da
// trilha, com o status reconstruído quando a marcação não o mudou; o motivo
// obrigatório só no cancelamento; e a reunião passada sem marcação como não
// apurada, nunca como falta (RF-516).

import { describe, expect, it } from 'vitest'

import {
  aguardaApuracao,
  marcacoesDaTrilha,
  problemaDoPedido,
  traduzirCodigoDoDesfecho,
  type LinhaDaTrilha,
} from '@/reunioes/desfecho'

function linha(
  instante: string,
  campos: string[],
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  extras: Partial<LinhaDaTrilha> = {},
): LinhaDaTrilha {
  return { actor_id: 'u-1', reason: null, created_at: instante, payload: { campos, antes, depois }, ...extras }
}

const PRIMEIRA = linha(
  '2026-10-01T18:00:00Z',
  ['attestation_status', 'attested_at', 'attested_by', 'attested_source', 'cancel_reason', 'status'],
  { status: 'scheduled', attestation_status: 'pending', attested_at: null },
  { status: 'canceled', attestation_status: 'attested', attested_at: '2026-10-01T18:00:00Z' },
  { reason: 'O lead pediu.' },
)

describe('marcacoesDaTrilha', () => {
  it('uma marcação: desfecho, autor, hora e motivo, sem troca', () => {
    expect(marcacoesDaTrilha([PRIMEIRA], 'canceled')).toEqual([
      { instante: '2026-10-01T18:00:00Z', autorId: 'u-1', desfecho: 'canceled', motivo: 'O lead pediu.', sobrescreveu: false },
    ])
  })

  it('a segunda que repete o status (outro motivo) herda o status de depois dela', () => {
    const segunda = linha(
      '2026-10-01T19:00:00Z',
      ['attested_at', 'attested_by', 'cancel_reason'],
      { attestation_status: 'attested', attested_at: '2026-10-01T18:00:00Z' },
      { attestation_status: 'attested', attested_at: '2026-10-01T19:00:00Z' },
      { actor_id: 'u-2', reason: 'Especialista doente.' },
    )
    const marcacoes = marcacoesDaTrilha([PRIMEIRA, segunda], 'canceled')
    expect(marcacoes.map((m) => [m.desfecho, m.autorId, m.sobrescreveu])).toEqual([
      ['canceled', 'u-1', false],
      ['canceled', 'u-2', true],
    ])
  })

  it('mudança de status sem apuração (a rotina remarcou) entra na conta e não vira marcação', () => {
    const daRotina = linha(
      '2026-10-02T10:00:00Z',
      ['status'],
      { status: 'attended' },
      { status: 'rescheduled' },
      { actor_id: null },
    )
    const realizada = linha(
      '2026-10-01T18:00:00Z',
      ['attestation_status', 'attested_at', 'status'],
      { status: 'scheduled', attestation_status: 'pending', attested_at: null },
      { status: 'attended', attestation_status: 'attested', attested_at: '2026-10-01T18:00:00Z' },
    )
    const nota = linha('2026-10-01T18:30:00Z', ['notes'], { notes: null }, { notes: 'x' })
    const marcacoes = marcacoesDaTrilha([realizada, nota, daRotina], 'rescheduled')
    expect(marcacoes).toHaveLength(1)
    expect(marcacoes[0]!.desfecho).toBe('attended')
  })

  it('marcação de rotina (sem autor) sai com autor nulo; payload torto não derruba a leitura', () => {
    const semAutor = { ...PRIMEIRA, actor_id: null }
    const torta: LinhaDaTrilha = { actor_id: 'u-1', reason: null, created_at: 'x', payload: 'não é objeto' }
    expect(marcacoesDaTrilha([torta, semAutor], 'canceled')).toEqual([
      expect.objectContaining({ autorId: null, desfecho: 'canceled' }),
    ])
  })

  it('reunião que ninguém apurou não tem marcação nenhuma', () => {
    expect(marcacoesDaTrilha([], 'scheduled')).toEqual([])
  })
})

describe('o pedido', () => {
  it('motivo é obrigatório só no cancelamento, e espaço não conta', () => {
    expect(problemaDoPedido({ desfecho: 'canceled', motivo: null })).toBe('motivo-obrigatorio')
    expect(problemaDoPedido({ desfecho: 'canceled', motivo: '   ' })).toBe('motivo-obrigatorio')
    expect(problemaDoPedido({ desfecho: 'canceled', motivo: 'O lead pediu.' })).toBeNull()
    expect(problemaDoPedido({ desfecho: 'attended', motivo: null })).toBeNull()
    expect(problemaDoPedido({ desfecho: 'no_show', motivo: null })).toBeNull()
  })

  it('código desconhecido ou que nem é texto vira falha de comunicação', () => {
    expect(traduzirCodigoDoDesfecho('marcada')).toEqual({ ok: true })
    expect(traduzirCodigoDoDesfecho('constructor')).toEqual({ ok: false, motivo: 'falha-de-comunicacao' })
    expect(traduzirCodigoDoDesfecho(null)).toEqual({ ok: false, motivo: 'falha-de-comunicacao' })
  })
})

describe('não apurada, nunca falta (RF-516)', () => {
  const agora = Date.parse('2026-10-01T18:00:00Z')

  it('passou do fim sem marcação: aguarda apuração', () => {
    expect(aguardaApuracao({ fim: '2026-10-01T17:30:00Z', apuracao: 'pending' }, agora)).toBe(true)
  })

  it('ainda não acabou, ou já foi apurada: não aguarda', () => {
    expect(aguardaApuracao({ fim: '2026-10-01T18:30:00Z', apuracao: 'pending' }, agora)).toBe(false)
    expect(aguardaApuracao({ fim: '2026-10-01T17:30:00Z', apuracao: 'attested' }, agora)).toBe(false)
  })
})

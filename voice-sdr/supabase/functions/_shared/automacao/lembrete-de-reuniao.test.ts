import { describe, expect, test } from 'vitest'

import { CASOS_DE_LEMBRETE } from './casos-de-lembrete.ts'
import {
  decidirLembretes,
  motivoDoLembrete,
  type ReuniaoParaLembrete,
} from './lembrete-de-reuniao.ts'
import { JANELA_DO_LEMBRETE_PADRAO } from './padroes.ts'

const AGORA = Date.parse('2026-10-05T13:00:00.000Z')

function reuniao(
  id: string,
  segundos: number,
  extra: Partial<ReuniaoParaLembrete> = {},
): ReuniaoParaLembrete {
  return {
    id,
    status: 'scheduled',
    startsAt: new Date(AGORA + segundos * 1000).toISOString(),
    reminderSentAt: null,
    telefoneDoLead: '+5511990000001',
    fusoDoLead: null,
    ...extra,
  }
}

describe('a tabela de casos, que o banco também cobra', () => {
  test('tem ao menos 18 casos e cobre os seis motivos', () => {
    expect(CASOS_DE_LEMBRETE.length).toBeGreaterThanOrEqual(18)
    expect(new Set(CASOS_DE_LEMBRETE.map((c) => c.esperado)).size).toBe(6)
  })

  for (const caso of CASOS_DE_LEMBRETE) {
    test(caso.nome, () => {
      const r = reuniao('r', caso.segundosAteComecar, {
        status: caso.status,
        reminderSentAt: caso.lembrada ? new Date(AGORA - 60_000).toISOString() : null,
        telefoneDoLead: caso.comTelefone ? '+5511990000001' : null,
      })
      expect(motivoDoLembrete(r, AGORA, caso.janela)).toBe(caso.esperado)
    })
  }
})

describe('decidirLembretes', () => {
  const pedido = (reunioes: readonly ReuniaoParaLembrete[], agora = AGORA) => ({
    reunioes,
    agora: () => agora,
    janela: JANELA_DO_LEMBRETE_PADRAO,
    fusoDaConta: 'America/Sao_Paulo',
  })

  test('separa as escolhidas das recusadas, com o motivo de cada uma', () => {
    const decisao = decidirLembretes(
      pedido([reuniao('a', 20 * 60), reuniao('b', 120 * 60), reuniao('c', 10 * 60, { status: 'canceled' })]),
    )
    expect(decisao.lembrar.map((e) => [e.reuniao.id, e.motivo])).toEqual([['a', 'na_janela']])
    expect(decisao.recusadas.map((e) => [e.reuniao.id, e.motivo])).toEqual([
      ['b', 'antes_da_janela'],
      ['c', 'status_nao_elegivel'],
    ])
  })

  test('o fuso da fala é o do lead, e sem ele o da conta; o fuso não muda a janela', () => {
    const decisao = decidirLembretes(
      pedido([reuniao('manaus', 15 * 60, { fusoDoLead: 'America/Manaus' }), reuniao('sp', 15 * 60)]),
    )
    expect(decisao.lembrar.map((e) => [e.reuniao.id, e.fuso])).toEqual([
      ['manaus', 'America/Manaus'],
      ['sp', 'America/Sao_Paulo'],
    ])
  })

  test('duas chamadas com o mesmo relógio devolvem a mesma lista', () => {
    const reunioes = [reuniao('a', 20 * 60), reuniao('b', 6 * 60), reuniao('c', 30 * 60)]
    expect(decidirLembretes(pedido(reunioes))).toEqual(decidirLembretes(pedido(reunioes)))
  })

  test('de novo, com as reuniões já marcadas, a lista é vazia e o motivo é ja_lembrada', () => {
    const reunioes = [reuniao('a', 20 * 60), reuniao('b', 6 * 60)]
    const primeira = decidirLembretes(pedido(reunioes))
    expect(primeira.lembrar).toHaveLength(2)
    const marcadas = reunioes.map((r) => ({ ...r, reminderSentAt: new Date(AGORA).toISOString() }))
    const segunda = decidirLembretes(pedido(marcadas))
    expect(segunda.lembrar).toEqual([])
    expect(segunda.recusadas.map((r) => r.motivo)).toEqual(['ja_lembrada', 'ja_lembrada'])
  })

  test('o relógio avança: cedo, na janela e depois tarde, sem lembrete atrasado', () => {
    const r = [reuniao('a', 60 * 60)]
    const motivo = (minutos: number) => {
      const d = decidirLembretes(pedido(r, AGORA + minutos * 60_000))
      return d.lembrar.length > 0 ? 'na_janela' : d.recusadas[0]!.motivo
    }
    expect(motivo(0)).toBe('antes_da_janela')
    expect(motivo(40)).toBe('na_janela')
    expect(motivo(55)).toBe('na_janela')
    // A rotina ficou parada e voltou: a reunião está a 2 minutos.
    expect(motivo(58)).toBe('depois_da_janela')
    expect(motivo(120)).toBe('depois_da_janela')
  })

  test('a entrada congelada não é alterada', () => {
    const r = Object.freeze([Object.freeze(reuniao('a', 20 * 60))])
    expect(() => decidirLembretes(pedido(r))).not.toThrow()
  })

  test('o relógio padrão é Date.now', () => {
    const decisao = decidirLembretes({
      reunioes: [reuniao('a', 0, { startsAt: new Date(Date.now() + 15 * 60_000).toISOString() })],
      janela: JANELA_DO_LEMBRETE_PADRAO,
      fusoDaConta: 'America/Sao_Paulo',
    })
    expect(decisao.lembrar).toHaveLength(1)
  })

  test('janela torta e horário ilegível são exceção', () => {
    expect(() =>
      decidirLembretes({ ...pedido([]), janela: { inicioEmMinutos: 20, fimEmMinutos: 5 } }),
    ).toThrow(RangeError)
    expect(() =>
      decidirLembretes({ ...pedido([]), janela: { inicioEmMinutos: -1, fimEmMinutos: 5 } }),
    ).toThrow(RangeError)
    expect(() => decidirLembretes(pedido([reuniao('a', 0, { startsAt: 'amanhã' })]))).toThrow()
  })
})

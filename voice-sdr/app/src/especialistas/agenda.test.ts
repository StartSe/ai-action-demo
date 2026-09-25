// As regras da agenda do especialista (US-176). O que importa provar aqui é o
// fuso: o bloqueio digitado vale no relógio do especialista, e a sabotagem de
// somar horas fixas passaria em São Paulo e cairia em Manaus. Por isso os
// casos usam fuso diferente de UTC−3, e datas de 2026 (sem horário de verão).

import { describe, expect, it } from 'vitest'

import {
  faixasDoDia,
  lerBloqueio,
  problemaDaFaixa,
  rotularNoFuso,
  separarBloqueios,
} from '@/especialistas/agenda'

describe('problemaDaFaixa', () => {
  it.each([
    ['09:00', '12:00', null],
    ['12:00', '09:00', 'ordem'],
    // Duração zero não é agenda.
    ['09:00', '09:00', 'ordem'],
    ['', '12:00', 'hora'],
    ['9:00', '12:00', 'hora'],
  ] as const)('%s às %s', (inicio, fim, esperado) => {
    expect(problemaDaFaixa(inicio, fim)).toBe(esperado)
  })
})

describe('lerBloqueio', () => {
  const rascunho = {
    dataInicio: '2026-10-07',
    horaInicio: '14:00',
    dataFim: '2026-10-07',
    horaFim: '16:30',
    motivo: '  Consulta  ',
  }

  it('lê o relógio no fuso do especialista, não no do navegador', () => {
    // Manaus é UTC−4: 14h lá são 18h em UTC.
    expect(lerBloqueio(rascunho, 'America/Manaus')).toEqual({
      ok: true,
      inicio: '2026-10-07T18:00:00.000Z',
      fim: '2026-10-07T20:30:00.000Z',
      motivo: 'Consulta',
    })
    expect(lerBloqueio(rascunho, 'America/Noronha')).toMatchObject({
      inicio: '2026-10-07T16:00:00.000Z',
    })
  })

  it('motivo em branco vira nulo, que o check da tabela aceita', () => {
    expect(lerBloqueio({ ...rascunho, motivo: '   ' }, 'America/Sao_Paulo')).toMatchObject({
      ok: true,
      motivo: null,
    })
  })

  it.each([
    [{ dataInicio: '' }, 'inicio'],
    [{ dataInicio: '2026-02-31' }, 'inicio'],
    [{ horaFim: '' }, 'fim'],
    [{ horaFim: '13:00' }, 'ordem'],
    [{ horaFim: '14:00' }, 'ordem'],
  ] as const)('%o é recusado por %s', (mudanca, problema) => {
    expect(lerBloqueio({ ...rascunho, ...mudanca }, 'America/Sao_Paulo')).toEqual({
      ok: false,
      problema,
    })
  })
})

describe('rotularNoFuso', () => {
  it('o mesmo instante lido em dois fusos', () => {
    expect(rotularNoFuso('2026-10-07T18:00:00Z', 'America/Manaus')).toBe('07/10/2026 14:00')
    expect(rotularNoFuso('2026-10-07T18:00:00Z', 'America/Sao_Paulo')).toBe('07/10/2026 15:00')
  })
})

describe('separarBloqueios', () => {
  const agora = Date.parse('2026-10-10T12:00:00Z')
  const bloqueio = (id: string, inicio: string, fim: string) => ({ id, inicio, fim, motivo: null })

  it('próximos do mais perto ao mais longe, passados recolhidos à parte', () => {
    const { proximos, passados } = separarBloqueios(
      [
        bloqueio('longe', '2026-12-01T00:00:00Z', '2026-12-10T00:00:00Z'),
        bloqueio('velho', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
        bloqueio('perto', '2026-10-11T00:00:00Z', '2026-10-12T00:00:00Z'),
        // Em curso ainda fecha a agenda: conta como próximo.
        bloqueio('agora', '2026-10-10T10:00:00Z', '2026-10-10T14:00:00Z'),
        bloqueio('ontem', '2026-10-09T00:00:00Z', '2026-10-10T12:00:00Z'),
      ],
      agora,
    )

    expect(proximos.map((item) => item.id)).toEqual(['agora', 'perto', 'longe'])
    expect(passados.map((item) => item.id)).toEqual(['ontem', 'velho'])
  })
})

describe('faixasDoDia', () => {
  it('só as do dia, da mais cedo para a mais tarde', () => {
    const faixas = [
      { id: 't', diaDaSemana: 2, inicio: '14:00', fim: '18:00' },
      { id: 'q', diaDaSemana: 3, inicio: '08:00', fim: '10:00' },
      { id: 'm', diaDaSemana: 2, inicio: '09:00', fim: '12:00' },
    ]
    expect(faixasDoDia(faixas, 2).map((faixa) => faixa.id)).toEqual(['m', 't'])
  })
})

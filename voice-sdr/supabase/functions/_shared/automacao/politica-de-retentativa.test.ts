import { describe, expect, test } from 'vitest'

import { CASOS_DE_RETENTATIVA } from './casos-de-retentativa.ts'
import { POLITICA_PADRAO, TURNOS_PADRAO } from './padroes.ts'
import {
  decidirRetentativa,
  diasDaJanela,
  lerTurnos,
  resultadoDoFim,
  type PedidoDeRetentativa,
} from './politica-de-retentativa.ts'

describe('a tabela de casos, que o banco também cobra', () => {
  test('tem ao menos 24 casos e cobre os quatro resultados e as três recusas', () => {
    expect(CASOS_DE_RETENTATIVA.length).toBeGreaterThanOrEqual(24)
    const resultados = new Set(CASOS_DE_RETENTATIVA.map((c) => c.resultado))
    expect([...resultados].sort()).toEqual(['caixa_postal', 'numero_invalido', 'ocupado', 'sem_atendimento'])
    const recusas = new Set(
      CASOS_DE_RETENTATIVA.flatMap((c) => (c.esperado.reprogramar ? [] : [c.esperado.motivo])),
    )
    expect([...recusas].sort()).toEqual(['fora_de_turno', 'numero_invalido', 'teto_de_tentativas'])
  })

  for (const caso of CASOS_DE_RETENTATIVA) {
    test(caso.nome, () => {
      const decisao = decidirRetentativa({
        resultado: caso.resultado,
        tentativa: caso.tentativa,
        politica: caso.politica,
        agora: () => Date.parse(caso.agora),
        fusoDoLead: caso.fuso,
        turnos: caso.turnos,
      })
      if (caso.esperado.reprogramar) {
        expect(decisao).toEqual({
          reprogramar: true,
          quando: caso.esperado.quando,
          turno: caso.esperado.turno,
          motivo: caso.resultado,
        })
      } else {
        expect(decisao).toEqual({ reprogramar: false, motivo: caso.esperado.motivo })
      }
    })
  }
})

describe('a decisão', () => {
  const base: PedidoDeRetentativa = {
    resultado: 'caixa_postal',
    tentativa: 1,
    politica: POLITICA_PADRAO,
    agora: () => Date.parse('2026-10-05T13:00:00Z'),
    fusoDoLead: 'America/Sao_Paulo',
    turnos: TURNOS_PADRAO,
  }

  test('caixa postal nunca volta ao turno da tentativa que falhou', () => {
    for (let minuto = 0; minuto < 24 * 60; minuto += 7) {
      const agora = Date.parse('2026-10-05T03:00:00Z') + minuto * 60_000
      const decisao = decidirRetentativa({ ...base, agora: () => agora })
      if (!decisao.reprogramar) throw new Error('caixa postal dentro do teto reprograma')
      expect(Date.parse(decisao.quando)).toBeGreaterThan(agora)
      const local = new Date(agora - 3 * 3600_000).getUTCHours()
      const turnoDeAgora = local >= 9 && local < 12 ? 'manha' : local >= 12 && local < 15 ? 'tarde' : local >= 15 && local < 18 ? 'fim_de_tarde' : null
      if (turnoDeAgora !== null && Date.parse(decisao.quando) - agora < 12 * 3600_000) {
        expect(decisao.turno).not.toBe(turnoDeAgora)
      }
    }
  })

  test('o relógio padrão é Date.now, e a decisão nunca é nula', () => {
    const decisao = decidirRetentativa({ ...base, agora: undefined, resultado: 'numero_invalido' })
    expect(decisao).toEqual({ reprogramar: false, motivo: 'numero_invalido' })
  })

  test('a entrada congelada não é alterada', () => {
    const turnos = Object.freeze(TURNOS_PADRAO.map((t) => Object.freeze({ ...t })))
    const politica = Object.freeze({ ...POLITICA_PADRAO })
    expect(() => decidirRetentativa({ ...base, turnos, politica })).not.toThrow()
  })

  test('tentativa zero, resultado desconhecido e política torta são exceção', () => {
    expect(() => decidirRetentativa({ ...base, tentativa: 0 })).toThrow(RangeError)
    expect(() => decidirRetentativa({ ...base, resultado: 'atendida' as never })).toThrow(RangeError)
    expect(() => decidirRetentativa({ ...base, politica: { ...POLITICA_PADRAO, recuosEmMinutos: [] } })).toThrow(
      RangeError,
    )
    expect(() => decidirRetentativa({ ...base, politica: { ...POLITICA_PADRAO, tetoDeTentativas: 0 } })).toThrow(
      RangeError,
    )
  })

  test('fuso que não existe é exceção, não UTC calado', () => {
    expect(() => decidirRetentativa({ ...base, fusoDoLead: 'America/Atlantida' })).toThrow(RangeError)
  })
})

describe('os turnos', () => {
  test('os padrões são válidos e ficam dentro da janela padrão', () => {
    expect(lerTurnos(TURNOS_PADRAO).map((t) => t.nome)).toEqual(['manha', 'tarde', 'fim_de_tarde'])
  })

  test('sobreposição, fora de ordem, sem duração, hora torta e nome repetido são recusados', () => {
    expect(() => lerTurnos([{ name: 'a', start: '09:00', end: '12:00' }, { name: 'b', start: '11:00', end: '13:00' }])).toThrow()
    expect(() => lerTurnos([{ name: 'a', start: '13:00', end: '15:00' }, { name: 'b', start: '09:00', end: '12:00' }])).toThrow()
    expect(() => lerTurnos([{ name: 'a', start: '09:00', end: '09:00' }])).toThrow()
    expect(() => lerTurnos([{ name: 'a', start: '9:00', end: '12:00' }])).toThrow()
    expect(() => lerTurnos([{ name: 'a', start: '09:00', end: '10:00' }, { name: 'a', start: '10:00', end: '11:00' }])).toThrow()
    expect(() => lerTurnos([{ name: ' ', start: '09:00', end: '10:00' }])).toThrow()
  })

  test('turnos colados são aceitos', () => {
    expect(lerTurnos([{ name: 'a', start: '09:00', end: '12:00' }, { name: 'b', start: '12:00', end: '13:00' }])).toHaveLength(2)
  })
})

describe('as entradas que vêm do banco', () => {
  test('resultadoDoFim traduz os quatro motivos de fim e ignora o resto', () => {
    expect(resultadoDoFim('no_answer')).toBe('sem_atendimento')
    expect(resultadoDoFim('busy')).toBe('ocupado')
    expect(resultadoDoFim('voicemail')).toBe('caixa_postal')
    expect(resultadoDoFim('invalid_number')).toBe('numero_invalido')
    expect(resultadoDoFim('completed')).toBeNull()
    expect(resultadoDoFim('dial_lost')).toBeNull()
    expect(resultadoDoFim(null)).toBeNull()
  })

  test('diasDaJanela lê as chaves da janela de discagem', () => {
    expect(diasDaJanela({ '1': {}, '5': {}, '3': {} })).toEqual([1, 3, 5])
    expect(diasDaJanela({})).toEqual([])
    expect(diasDaJanela(null)).toEqual([])
    expect(diasDaJanela({ '9': {}, x: {} })).toEqual([])
  })
})

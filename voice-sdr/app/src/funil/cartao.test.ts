import { describe, expect, it } from 'vitest'

import {
  destinosDoCartao,
  movidoPelaSarah,
  ultimaMudancaPorLead,
} from '@/funil/cartao'
import type { EtapaDoFunil } from '@/leads/tipos'

const ETAPAS: EtapaDoFunil[] = [
  { chave: 'new', rotulo: 'Novo' },
  { chave: 'contacted', rotulo: 'Contatado' },
  { chave: 'qualified', rotulo: 'Qualificado' },
]

describe('o sinal da Sarah no cartão', () => {
  it('acende quando a última mudança de etapa foi do agente', () => {
    expect(
      movidoPelaSarah({ ultimaMudancaDeEtapa: { ator: 'agent', em: '2026-09-24T10:00:00Z' } }),
    ).toBe(true)
  })

  it('apaga quando a última foi de gente ou da rotina, e quando não houve mudança', () => {
    expect(
      movidoPelaSarah({ ultimaMudancaDeEtapa: { ator: 'user', em: '2026-09-24T10:00:00Z' } }),
    ).toBe(false)
    expect(
      movidoPelaSarah({ ultimaMudancaDeEtapa: { ator: 'system', em: '2026-09-24T10:00:00Z' } }),
    ).toBe(false)
    expect(movidoPelaSarah({ ultimaMudancaDeEtapa: null })).toBe(false)
  })

  it('vale a mudança mais recente pelo instante, não pela ordem de chegada', () => {
    // A Sarah qualificou, e depois alguém devolveu: o cartão não é mais dela.
    const ultimas = ultimaMudancaPorLead([
      { leadId: 'a', ator: 'agent', em: '2026-09-24T09:00:00Z' },
      { leadId: 'a', ator: 'user', em: '2026-09-24T11:00:00Z' },
      { leadId: 'b', ator: 'user', em: '2026-09-24T08:00:00Z' },
      { leadId: 'b', ator: 'agent', em: '2026-09-24T12:00:00Z' },
    ])

    expect(ultimas.get('a')).toEqual({ ator: 'user', em: '2026-09-24T11:00:00Z' })
    expect(ultimas.get('b')).toEqual({ ator: 'agent', em: '2026-09-24T12:00:00Z' })
    expect(ultimas.has('c')).toBe(false)
  })
})

describe('para onde o cartão vai pelo teclado', () => {
  it('oferece toda etapa menos a atual, na ordem das colunas', () => {
    expect(
      destinosDoCartao(ETAPAS, { etapa: ETAPAS[1]! }).map((etapa) => etapa.chave),
    ).toEqual(['new', 'qualified'])
  })

  it('lead sem etapa pode ir para qualquer uma', () => {
    expect(destinosDoCartao(ETAPAS, { etapa: null })).toHaveLength(3)
  })
})

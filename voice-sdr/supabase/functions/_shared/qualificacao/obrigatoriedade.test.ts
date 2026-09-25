// Provas da obrigatoriedade da qualificação (US-138). Ambiente node, sem banco
// e sem rede: o que se mede é a decisão, a regra da camada 1 aparecer só onde a
// ferramenta existe, e o critério que reprova.
//
// A prova de que o agente publicado de fato insiste em qualificar antes de
// encerrar exige o provedor de voz e uma ligação, e é dívida do degrau 3.

import { describe, expect, test } from 'vitest'

import { avaliarChamada, type PortaDeAvaliacao } from './avaliacao.ts'
import {
  CRITERIO_QUALIFICACAO_REGISTRADA,
  FERRAMENTA_DE_QUALIFICACAO,
  PROPOSITOS_QUE_EXIGEM_QUALIFICACAO,
  avaliarQualificacao,
  exigeQualificacao,
  faltouQualificar,
  type ChamadaParaQualificacao,
  type InvocacaoRegistrada,
} from './obrigatoriedade.ts'
import { DESCRITOR_DA_QUALIFICACAO } from '../ferramentas/tool-qualify.ts'
import { PROPOSITOS } from '../playbook/camada-um.ts'

const DESCOBERTA_ATENDIDA: ChamadaParaQualificacao = Object.freeze({
  purpose: 'discovery',
  direction: 'outbound',
  answered_at: '2026-09-24T12:00:00Z',
})

const QUALIFICOU: InvocacaoRegistrada = Object.freeze({ tool: 'tool-qualify', error: null })
const ENCERROU: InvocacaoRegistrada = Object.freeze({ tool: 'system:end_call', error: null })

describe('faltouQualificar', () => {
  test('descoberta atendida sem invocação de tool-qualify: faltou', () => {
    expect(faltouQualificar(DESCOBERTA_ATENDIDA, [])).toBe(true)
    expect(faltouQualificar(DESCOBERTA_ATENDIDA, [ENCERROU])).toBe(true)
  })

  test('descoberta atendida com invocação de tool-qualify: não faltou', () => {
    expect(faltouQualificar(DESCOBERTA_ATENDIDA, [QUALIFICOU, ENCERROU])).toBe(false)
  })

  test('ensaio nunca falta, com ou sem invocação', () => {
    const ensaio = { ...DESCOBERTA_ATENDIDA, direction: 'rehearsal' }
    expect(faltouQualificar(ensaio, [])).toBe(false)
    expect(faltouQualificar(ensaio, [QUALIFICOU])).toBe(false)
  })

  test('chamada não atendida não falta', () => {
    expect(faltouQualificar({ ...DESCOBERTA_ATENDIDA, answered_at: null }, [])).toBe(false)
  })

  test.each(['reminder', 'rescue', 'followup'])('propósito %s não exige, então não falta', (purpose) => {
    expect(faltouQualificar({ ...DESCOBERTA_ATENDIDA, purpose }, [])).toBe(false)
  })

  test('ligação recebida de descoberta também exige', () => {
    expect(faltouQualificar({ ...DESCOBERTA_ATENDIDA, direction: 'inbound' }, [])).toBe(true)
  })

  test('invocação que voltou com erro não conta como qualificação', () => {
    expect(faltouQualificar(DESCOBERTA_ATENDIDA, [{ tool: 'tool-qualify', error: 'timeout' }])).toBe(true)
  })

  test('encerrar por regra travada sem qualificar ainda dispara a retaguarda', () => {
    // O lead continua sem etapa: a retaguarda é quem a dá.
    expect(faltouQualificar(DESCOBERTA_ATENDIDA, [{ tool: 'tool-dnc', error: null }])).toBe(true)
  })

  test('a decisão não mexe na entrada', () => {
    const invocacoes = Object.freeze([Object.freeze({ tool: 'tool-dnc', error: null })])
    const antes = structuredClone(invocacoes)
    faltouQualificar(DESCOBERTA_ATENDIDA, invocacoes)
    avaliarQualificacao(DESCOBERTA_ATENDIDA, invocacoes)
    expect(invocacoes).toEqual(antes)
  })
})

describe('exigeQualificacao', () => {
  test('os propósitos que exigem têm a ferramenta no descritor', () => {
    // Exigir qualificação onde tool-qualify não existe seria reprovar toda
    // chamada daquele propósito por uma ferramenta que ninguém publicou.
    for (const proposito of PROPOSITOS_QUE_EXIGEM_QUALIFICACAO) {
      expect(DESCRITOR_DA_QUALIFICACAO.propositos).toContain(proposito)
    }
    expect(FERRAMENTA_DE_QUALIFICACAO).toBe(DESCRITOR_DA_QUALIFICACAO.nome)
  })

  test('descoberta com a ferramenta no conjunto exige; sem ela, não', () => {
    expect(exigeQualificacao('discovery', ['tool-transfer', 'tool-qualify'])).toBe(true)
    expect(exigeQualificacao('discovery', ['tool-transfer', 'tool-dnc'])).toBe(false)
  })

  test.each(PROPOSITOS.filter((p) => p !== 'discovery'))('%s não exige nem com a ferramenta', (proposito) => {
    expect(exigeQualificacao(proposito, ['tool-qualify'])).toBe(false)
  })
})

describe('critério qualificacao_registrada', () => {
  const porta: PortaDeAvaliacao = {
    julgar: () => Promise.reject(new Error('critério por registro não vai ao modelo')),
  }

  test('é obrigatório e decidido pelo registro, não pela fala', () => {
    expect(CRITERIO_QUALIFICACAO_REGISTRADA).toMatchObject({
      key: 'qualificacao_registrada',
      obrigatorio: true,
      como: 'registro',
    })
  })

  test('descoberta sem qualificação reprova e a nota vai a zero', async () => {
    const item = avaliarQualificacao(DESCOBERTA_ATENDIDA, [ENCERROU])
    expect(item).toMatchObject({ criterio: 'qualificacao_registrada', aprovado: false })

    const avaliacao = await avaliarChamada([], [CRITERIO_QUALIFICACAO_REGISTRADA], porta, [item!])
    expect(avaliacao.nota).toBe(0)
    expect(avaliacao.reprovados()).toEqual(['qualificacao_registrada'])
  })

  test('descoberta com qualificação aprova', async () => {
    const item = avaliarQualificacao(DESCOBERTA_ATENDIDA, [QUALIFICOU])
    const avaliacao = await avaliarChamada([], [CRITERIO_QUALIFICACAO_REGISTRADA], porta, [item!])
    expect(avaliacao.itens).toEqual([
      { criterio: 'qualificacao_registrada', aprovado: true, evidencia: 'tool-qualify' },
    ])
    expect(avaliacao.nota).toBe(10)
  })

  test('encerramento por regra travada fica sem decisão, em vez de reprovar quem obedeceu', () => {
    expect(avaliarQualificacao(DESCOBERTA_ATENDIDA, [{ tool: 'tool-dnc', error: null }])).toEqual({
      criterio: 'qualificacao_registrada',
      aprovado: null,
      evidencia: null,
      motivo: 'nao_se_aplica',
    })
  })

  test('ensaio, não atendida e outro propósito: o critério não vale', () => {
    expect(avaliarQualificacao({ ...DESCOBERTA_ATENDIDA, direction: 'rehearsal' }, [])).toBeNull()
    expect(avaliarQualificacao({ ...DESCOBERTA_ATENDIDA, answered_at: null }, [])).toBeNull()
    expect(avaliarQualificacao({ ...DESCOBERTA_ATENDIDA, purpose: 'reminder' }, [])).toBeNull()
  })

  test('sem item decidido, o critério por registro fica sem decisão', async () => {
    const avaliacao = await avaliarChamada([], [CRITERIO_QUALIFICACAO_REGISTRADA], porta)
    expect(avaliacao.itens).toEqual([
      { criterio: 'qualificacao_registrada', aprovado: null, evidencia: null, motivo: 'nao_informado' },
    ])
  })
})

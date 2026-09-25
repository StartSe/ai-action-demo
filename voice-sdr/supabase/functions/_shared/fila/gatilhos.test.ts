import { describe, expect, test } from 'vitest'

import {
  itensDaChamada,
  type ChamadaParaGatilhos,
  type HistoricoDaChamada,
  type LimiaresDaFila,
} from './gatilhos.ts'

const LIMIARES: LimiaresDaFila = {
  sentiment_floor: -0.5,
  consecutive_failures_cap: 3,
  failed_criteria_cap: 1,
  credit_alert_cents: null,
}

const CHAMADA: ChamadaParaGatilhos = {
  id: 'chamada-1',
  direction: 'outbound',
  atendida: true,
  sentimento: 0.2,
  criteriosReprovados: [],
  telefone: '+5548999990001',
  dia: '2026-09-24',
  leadId: 'lead-1',
  trecho: 'Não gostei.',
}

const SEM_HISTORICO: HistoricoDaChamada = { falhasConsecutivas: 0, credito: null }

const generos = (itens: ReturnType<typeof itensDaChamada>) => itens.map((i) => i.kind)

describe('sentimento (quinto critério de aceite da F4, como função pura)', () => {
  const negativa = { ...CHAMADA, sentimento: -0.6 }

  test('-0,6 gera item com o piso em -0,5', () => {
    const itens = itensDaChamada(negativa, LIMIARES, SEM_HISTORICO)
    expect(generos(itens)).toEqual(['sentimento_negativo'])
    expect(itens[0]).toMatchObject({
      deduplicacaoKey: 'sentimento:chamada-1',
      thresholdSnapshot: { sentiment_floor: -0.5 },
      context: { call_id: 'chamada-1', sentimento: -0.6, trecho: 'Não gostei.' },
    })
  })

  test('a mesma chamada não gera item com o piso em -0,8', () => {
    expect(itensDaChamada(negativa, { ...LIMIARES, sentiment_floor: -0.8 }, SEM_HISTORICO)).toEqual([])
  })

  test('e volta a gerar quando o piso sobe de novo', () => {
    expect(generos(itensDaChamada(negativa, { ...LIMIARES, sentiment_floor: -0.2 }, SEM_HISTORICO))).toEqual([
      'sentimento_negativo',
    ])
  })

  test('igual ao piso gera; acima não gera; sem sentimento não gera', () => {
    expect(generos(itensDaChamada({ ...CHAMADA, sentimento: -0.5 }, LIMIARES, SEM_HISTORICO))).toEqual([
      'sentimento_negativo',
    ])
    expect(itensDaChamada({ ...CHAMADA, sentimento: -0.49 }, LIMIARES, SEM_HISTORICO)).toEqual([])
    expect(itensDaChamada({ ...CHAMADA, sentimento: null }, LIMIARES, SEM_HISTORICO)).toEqual([])
  })
})

describe('avaliação reprovada', () => {
  test('um critério reprovado com o teto 1 gera item', () => {
    const itens = itensDaChamada({ ...CHAMADA, criteriosReprovados: ['aviso_gravacao'] }, LIMIARES, SEM_HISTORICO)
    expect(itens[0]).toMatchObject({
      kind: 'avaliacao_reprovada',
      deduplicacaoKey: 'avaliacao:chamada-1',
      thresholdSnapshot: { failed_criteria_cap: 1 },
    })
  })

  test('com o teto 2, um reprovado não gera e dois geram', () => {
    const limiares = { ...LIMIARES, failed_criteria_cap: 2 }
    expect(itensDaChamada({ ...CHAMADA, criteriosReprovados: ['a'] }, limiares, SEM_HISTORICO)).toEqual([])
    expect(generos(itensDaChamada({ ...CHAMADA, criteriosReprovados: ['a', 'b'] }, limiares, SEM_HISTORICO))).toEqual([
      'avaliacao_reprovada',
    ])
  })
})

describe('falha repetida', () => {
  const naoAtendida = { ...CHAMADA, atendida: false, sentimento: null }

  test('três falhas consecutivas com o teto 3 geram item por número e dia', () => {
    const itens = itensDaChamada(naoAtendida, LIMIARES, { falhasConsecutivas: 3 })
    expect(itens[0]).toMatchObject({
      kind: 'falha_repetida',
      deduplicacaoKey: 'falha:+5548999990001:2026-09-24',
      thresholdSnapshot: { consecutive_failures_cap: 3 },
    })
  })

  test('duas falhas não geram; com o teto 2, geram', () => {
    expect(itensDaChamada(naoAtendida, LIMIARES, { falhasConsecutivas: 2 })).toEqual([])
    expect(
      generos(itensDaChamada(naoAtendida, { ...LIMIARES, consecutive_failures_cap: 2 }, { falhasConsecutivas: 2 })),
    ).toEqual(['falha_repetida'])
  })

  test('chamada não atendida não gera sentimento nem avaliação', () => {
    const itens = itensDaChamada(
      { ...naoAtendida, sentimento: -1, criteriosReprovados: ['a', 'b'] },
      LIMIARES,
      SEM_HISTORICO,
    )
    expect(itens).toEqual([])
  })
})

describe('crédito baixo', () => {
  const credito = { provedor: 'voz', saldoCents: 500 }

  test('sem limiar de crédito, não gera, mesmo com saldo zero', () => {
    expect(itensDaChamada(CHAMADA, LIMIARES, { falhasConsecutivas: 0, credito: { provedor: 'voz', saldoCents: 0 } })).toEqual([])
  })

  test('abaixo do limiar gera por provedor e dia; igual não gera', () => {
    const itens = itensDaChamada(CHAMADA, { ...LIMIARES, credit_alert_cents: 1000 }, { falhasConsecutivas: 0, credito })
    expect(itens[0]).toMatchObject({ kind: 'credito_baixo', deduplicacaoKey: 'credito:voz:2026-09-24' })
    expect(
      itensDaChamada(CHAMADA, { ...LIMIARES, credit_alert_cents: 500 }, { falhasConsecutivas: 0, credito }),
    ).toEqual([])
  })
})

describe('idempotência, ensaio e o que não nasce aqui', () => {
  const tudo = { ...CHAMADA, sentimento: -0.9, criteriosReprovados: ['a'] }

  test('rodar duas vezes produz as mesmas chaves', () => {
    const a = itensDaChamada(tudo, LIMIARES, SEM_HISTORICO).map((i) => i.deduplicacaoKey)
    const b = itensDaChamada(tudo, LIMIARES, SEM_HISTORICO).map((i) => i.deduplicacaoKey)
    expect(a).toEqual(b)
    expect(a).toEqual(['sentimento:chamada-1', 'avaliacao:chamada-1'])
  })

  test('ensaio não gera item nenhum', () => {
    expect(
      itensDaChamada({ ...tudo, direction: 'rehearsal' }, { ...LIMIARES, credit_alert_cents: 99999 }, {
        falhasConsecutivas: 10,
        credito: { provedor: 'voz', saldoCents: 0 },
      }),
    ).toEqual([])
  })

  test('pedido de humano e de bloqueio não nascem na finalização', () => {
    const todos = itensDaChamada(tudo, { ...LIMIARES, credit_alert_cents: 99999 }, {
      falhasConsecutivas: 10,
      credito: { provedor: 'voz', saldoCents: 0 },
    })
    for (const item of todos) {
      expect(['pedido_humano', 'pedido_bloqueio', 'human_requested', 'dnc_requested']).not.toContain(item.kind)
    }
  })

  test('o módulo não tem limiar embutido', async () => {
    const { readFile } = await import('node:fs/promises')
    const fonte = await readFile(new URL('./gatilhos.ts', import.meta.url), 'utf8')
    const codigo = fonte.replace(/\/\/.*$/gm, '')
    expect(codigo).not.toMatch(/-0\.5|-0\.8/)
    expect(codigo).not.toMatch(/\bDeno\./)
  })
})

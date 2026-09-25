// Provas do sentimento e da fila no fim da finalização (US-141), com a porta
// dublada: de onde vem o sentimento, o que conta como critério reprovado, o dia
// no fuso da conta, e o limiar que chega da porta, nunca de constante.

import { describe, expect, test } from 'vitest'

import type { ItemDeFila } from '../_shared/fila/gatilhos.ts'

import {
  aplicarSentimentoEFila,
  criteriosReprovados,
  diaNoFuso,
  sentimentoDaChamada,
  type PortaDaFila,
  type ResultadoGravado,
} from './sentimento-e-fila.ts'

const CHAMADA = {
  id: '22222222-2222-4222-8222-222222222222',
  account_id: '11111111-1111-4111-8111-111111111111',
  lead_id: '33333333-3333-4333-8333-333333333333',
  direction: 'outbound',
} as const

const VAZIO: ResultadoGravado = { classification_source: null, classification: {}, sentiment: null, evaluation: null }

function porta(resultado: ResultadoGravado, piso: number) {
  const tocados: string[] = []
  const registrados: ItemDeFila[] = []
  const sentimentos: unknown[] = []
  const real: PortaDaFila = {
    async lerResultadoDaChamada() {
      return resultado
    },
    async gravarSentimento(...args) {
      sentimentos.push(args)
    },
    async limiaresDaFila() {
      return {
        limiares: { sentiment_floor: piso, consecutive_failures_cap: 3, failed_criteria_cap: 1, credit_alert_cents: null },
        fuso: 'America/Manaus',
      }
    },
    async falhasConsecutivas() {
      return null
    },
    async registrarItemDeFila(_conta, item) {
      if (registrados.some((r) => r.deduplicacaoKey === item.deduplicacaoKey)) return 'ja_aberto'
      registrados.push(item)
      return 'criado'
    },
  }
  const dublada = new Proxy(real, {
    get(alvo, membro, receptor) {
      tocados.push(String(membro))
      return Reflect.get(alvo, membro, receptor) as unknown
    },
  })
  return { porta: dublada, tocados, registrados, sentimentos }
}

const FIM = { atendidaPor: 'human', instante: '2026-03-20T02:30:00.000Z' } as const

describe('sentimentoDaChamada', () => {
  test('da ferramenta, lido da classificação', () => {
    expect(sentimentoDaChamada({ ...VAZIO, classification_source: 'tool', classification: { sentiment: -0.6 } })).toEqual({
      valor: -0.6,
      fonte: 'tool',
    })
  })

  test('da retaguarda, lido da coluna que o modelo escreveu', () => {
    expect(sentimentoDaChamada({ ...VAZIO, classification_source: 'backfill', sentiment: 0.4 })).toEqual({
      valor: 0.4,
      fonte: 'backfill',
    })
  })

  test('sem classificação, fora da faixa ou corrigida por humano: nada', () => {
    expect(sentimentoDaChamada(VAZIO)).toBeNull()
    expect(sentimentoDaChamada({ ...VAZIO, classification_source: 'tool', classification: { sentiment: 3 } })).toBeNull()
    expect(sentimentoDaChamada({ ...VAZIO, classification_source: 'human', sentiment: -0.9 })).toBeNull()
  })
})

test('criteriosReprovados lê o juízo do modelo, os itens e as medições, sem repetir', () => {
  expect(
    criteriosReprovados({
      criterios: { aviso_gravacao: { aprovado: false }, identificacao: { aprovado: true }, base: { aprovado: null } },
      itens: [{ criterio: 'aviso_gravacao', aprovado: false }, { criterio: 'escuta', aprovado: false }],
      medicoes: { encerramento_pessoa_errada: { conforme: false } },
    }),
  ).toEqual(['aviso_gravacao', 'escuta', 'encerramento_pessoa_errada'])
  expect(criteriosReprovados(null)).toEqual([])
  expect(criteriosReprovados([1, 2])).toEqual([])
})

test('diaNoFuso é o dia da conta, e não o de UTC', () => {
  expect(diaNoFuso('2026-03-20T02:30:00.000Z', 'America/Manaus')).toBe('2026-03-19')
  expect(diaNoFuso('2026-03-20T02:30:00.000Z', 'UTC')).toBe('2026-03-20')
  expect(diaNoFuso('2026-03-20T02:30:00.000Z', 'Fuso/Inexistente')).toBe('2026-03-20')
})

describe('aplicarSentimentoEFila', () => {
  const PELA_FERRAMENTA: ResultadoGravado = {
    ...VAZIO,
    classification_source: 'tool',
    classification: { sentiment: -0.6 },
  }

  test('o piso vem da porta: -0,6 gera com -0,5 e não gera com -0,8', async () => {
    const com = porta(PELA_FERRAMENTA, -0.5)
    expect((await aplicarSentimentoEFila(CHAMADA, FIM, com.porta)).fila).toEqual({
      situacao: 'avaliada',
      criados: ['sentimento_negativo'],
      jaAbertos: [],
    })
    const sem = porta(PELA_FERRAMENTA, -0.8)
    expect((await aplicarSentimentoEFila(CHAMADA, FIM, sem.porta)).fila).toEqual({
      situacao: 'avaliada',
      criados: [],
      jaAbertos: [],
    })
  })

  test('grava o sentimento na chamada e no lead, com a fonte', async () => {
    const b = porta(PELA_FERRAMENTA, -0.8)
    expect((await aplicarSentimentoEFila(CHAMADA, FIM, b.porta)).sentimento).toBe('tool')
    expect(b.sentimentos).toEqual([[CHAMADA.account_id, CHAMADA.id, CHAMADA.lead_id, -0.6, 'tool']])
  })

  test('a segunda passagem não cria segundo item', async () => {
    const b = porta(PELA_FERRAMENTA, -0.5)
    await aplicarSentimentoEFila(CHAMADA, FIM, b.porta)
    const segunda = await aplicarSentimentoEFila(CHAMADA, FIM, b.porta)
    expect(segunda.fila).toEqual({ situacao: 'avaliada', criados: [], jaAbertos: ['sentimento_negativo'] })
    expect(b.registrados).toHaveLength(1)
  })

  test('corrigida por humano não reescreve o sentimento, e a fila lê o valor corrigido', async () => {
    const b = porta({ ...VAZIO, classification_source: 'human', sentiment: -0.7 }, -0.5)
    const desfecho = await aplicarSentimentoEFila(CHAMADA, FIM, b.porta)
    expect(desfecho.sentimento).toBe('corrigido_por_humano')
    expect(b.tocados).not.toContain('gravarSentimento')
    expect(b.registrados.map((i) => i.kind)).toEqual(['sentimento_negativo'])
  })

  test('o ensaio não toca a porta', async () => {
    const b = porta(PELA_FERRAMENTA, -0.5)
    const desfecho = await aplicarSentimentoEFila({ ...CHAMADA, direction: 'rehearsal' }, FIM, b.porta)
    expect(desfecho).toEqual({ sentimento: 'nao_se_aplica', fila: { situacao: 'nao_se_aplica' } })
    expect(b.tocados).toEqual([])
  })
})

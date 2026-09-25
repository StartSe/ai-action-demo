import { describe, expect, it } from 'vitest'

import {
  LIMIARES_PADRAO,
  limiaresDaLinha,
  limiaresMudaram,
  linhaDosLimiares,
  rascunhoDe,
  validarLimiares,
  valorLegivel,
  type RascunhoDosLimiares,
} from '@/conta/limiares'

const VALIDO: RascunhoDosLimiares = {
  pisoDeSentimento: '-0,5',
  tetoDeFalhas: '3',
  tetoDeCriterios: '1',
  avisoDeCreditoCentavos: '',
}

function com(mudanca: Partial<RascunhoDosLimiares>) {
  return validarLimiares({ ...VALIDO, ...mudanca })
}

describe('validarLimiares', () => {
  it('o rascunho dos padrões volta aos padrões', () => {
    expect(validarLimiares(rascunhoDe(LIMIARES_PADRAO))).toEqual({ ok: true, limiares: LIMIARES_PADRAO })
  })

  it.each([
    ['-1', -1],
    ['1', 1],
    ['0', 0],
    ['-0,75', -0.75],
    ['-0.3', -0.3],
    [' 0,2 ', 0.2],
    ['-0', 0],
  ])('o piso %s é aceito como %s', (texto, valor) => {
    const resultado = com({ pisoDeSentimento: texto })
    expect(resultado.ok && resultado.limiares.pisoDeSentimento).toBe(valor)
  })

  it.each(['-1,01', '1,5', '2', '', 'abc', '-0,555', '0,', ','])('o piso %j é recusado', (texto) => {
    expect(com({ pisoDeSentimento: texto })).toEqual({
      ok: false,
      erros: { pisoDeSentimento: 'fora-do-dominio' },
    })
  })

  it.each(['0', '-1', '1,5', '', 'três', '32768'])('o teto de falhas %j é recusado', (texto) => {
    expect(com({ tetoDeFalhas: texto })).toEqual({ ok: false, erros: { tetoDeFalhas: 'fora-do-dominio' } })
  })

  it.each(['0', '2,0', ''])('o teto de critérios %j é recusado', (texto) => {
    expect(com({ tetoDeCriterios: texto })).toEqual({
      ok: false,
      erros: { tetoDeCriterios: 'fora-do-dominio' },
    })
  })

  it('crédito em branco é "sem aviso", nulo, e nunca zero', () => {
    for (const texto of ['', '   ']) {
      const resultado = com({ avisoDeCreditoCentavos: texto })
      expect(resultado).toEqual({ ok: true, limiares: { ...LIMIARES_PADRAO, avisoDeCreditoCentavos: null } })
    }
  })

  it.each([
    ['50', 5000],
    ['12,5', 1250],
    ['12,50', 1250],
    ['0,01', 1],
  ])('o crédito %s vira %s centavos', (texto, centavos) => {
    const resultado = com({ avisoDeCreditoCentavos: texto })
    expect(resultado.ok && resultado.limiares.avisoDeCreditoCentavos).toBe(centavos)
  })

  it.each(['0', '0,00', '-5', '12,345', 'R$ 50', '50.00'])('o crédito %j é recusado', (texto) => {
    expect(com({ avisoDeCreditoCentavos: texto })).toEqual({
      ok: false,
      erros: { avisoDeCreditoCentavos: 'fora-do-dominio' },
    })
  })

  it('diz todos os campos fora do domínio de uma vez', () => {
    expect(
      validarLimiares({
        pisoDeSentimento: '3',
        tetoDeFalhas: '0',
        tetoDeCriterios: '0',
        avisoDeCreditoCentavos: '0',
      }),
    ).toEqual({
      ok: false,
      erros: {
        pisoDeSentimento: 'fora-do-dominio',
        tetoDeFalhas: 'fora-do-dominio',
        tetoDeCriterios: 'fora-do-dominio',
        avisoDeCreditoCentavos: 'fora-do-dominio',
      },
    })
  })
})

describe('rascunhoDe e valorLegivel', () => {
  it('o rascunho escreve com vírgula e o crédito em reais', () => {
    expect(
      rascunhoDe({ pisoDeSentimento: -0.35, tetoDeFalhas: 4, tetoDeCriterios: 2, avisoDeCreditoCentavos: 1250 }),
    ).toEqual({ pisoDeSentimento: '-0,35', tetoDeFalhas: '4', tetoDeCriterios: '2', avisoDeCreditoCentavos: '12,50' })
    expect(rascunhoDe(LIMIARES_PADRAO).avisoDeCreditoCentavos).toBe('')
  })

  it('o valor legível tem duas casas no piso, reais no crédito e nulo sem aviso', () => {
    const limiares = { ...LIMIARES_PADRAO, avisoDeCreditoCentavos: 5000 }
    expect(valorLegivel('pisoDeSentimento', limiares)).toBe('-0,50')
    expect(valorLegivel('tetoDeFalhas', limiares)).toBe('3')
    expect(valorLegivel('avisoDeCreditoCentavos', limiares)).toMatch(/^R\$\s50,00$/)
    expect(valorLegivel('avisoDeCreditoCentavos', LIMIARES_PADRAO)).toBeNull()
  })
})

describe('a linha de account_settings', () => {
  it('lê as quatro colunas, com numeric em texto, e grava pelas mesmas chaves', () => {
    const linha = {
      sentiment_floor: '-0.25',
      consecutive_failures_cap: 5,
      failed_criteria_cap: 2,
      credit_alert_cents: null,
    }
    const limiares = limiaresDaLinha(linha)
    expect(limiares).toEqual({
      pisoDeSentimento: -0.25,
      tetoDeFalhas: 5,
      tetoDeCriterios: 2,
      avisoDeCreditoCentavos: null,
    })
    expect(linhaDosLimiares(limiares)).toEqual({ ...linha, sentiment_floor: -0.25 })
  })

  it('limiaresMudaram compara os quatro', () => {
    expect(limiaresMudaram(LIMIARES_PADRAO, { ...LIMIARES_PADRAO })).toBe(false)
    expect(limiaresMudaram(LIMIARES_PADRAO, { ...LIMIARES_PADRAO, avisoDeCreditoCentavos: 100 })).toBe(true)
  })
})

import { describe, expect, test } from 'vitest'

import {
  calcularPontuacao,
  REGUA_DE_EXEMPLO,
  reguaValida,
  temperaturaDoScore,
  type Regua,
} from './pontuacao.ts'

const TODOS = { dor_confirmada: true, orcamento: true, decisor: true, prazo: true }

const OUTRA_REGUA: Regua = {
  criterios: [
    { key: 'dor_confirmada', peso: 10 },
    { key: 'orcamento', peso: 60 },
    { key: 'decisor', peso: 20 },
    { key: 'prazo', peso: 10 },
  ],
  cortes: { morno: 30, quente: 80 },
}

describe('régua inválida é recusada', () => {
  test.each<[string, Regua]>([
    ['pesos somando 90', { criterios: [{ key: 'a', peso: 90 }], cortes: { morno: 40, quente: 70 } }],
    ['pesos somando 110', { criterios: [{ key: 'a', peso: 60 }, { key: 'b', peso: 50 }], cortes: { morno: 40, quente: 70 } }],
    ['sem critério', { criterios: [], cortes: { morno: 40, quente: 70 } }],
    ['chave repetida', { criterios: [{ key: 'a', peso: 50 }, { key: 'a', peso: 50 }], cortes: { morno: 40, quente: 70 } }],
    ['chave vazia', { criterios: [{ key: ' ', peso: 100 }], cortes: { morno: 40, quente: 70 } }],
    ['peso negativo', { criterios: [{ key: 'a', peso: -10 }, { key: 'b', peso: 110 }], cortes: { morno: 40, quente: 70 } }],
    ['peso fracionado', { criterios: [{ key: 'a', peso: 50.5 }, { key: 'b', peso: 49.5 }], cortes: { morno: 40, quente: 70 } }],
    ['cortes invertidos', { criterios: [{ key: 'a', peso: 100 }], cortes: { morno: 70, quente: 40 } }],
    ['cortes iguais', { criterios: [{ key: 'a', peso: 100 }], cortes: { morno: 50, quente: 50 } }],
    ['corte acima de 100', { criterios: [{ key: 'a', peso: 100 }], cortes: { morno: 50, quente: 150 } }],
  ])('%s', (_nome, regua) => {
    expect(reguaValida(regua)).toBe(false)
    expect(calcularPontuacao(TODOS, regua)).toEqual({ ok: false, motivo: 'regua_invalida' })
  })

  test('a régua de exemplo é válida', () => {
    expect(reguaValida(REGUA_DE_EXEMPLO)).toBe(true)
    expect(reguaValida(OUTRA_REGUA)).toBe(true)
  })
})

describe('score e temperatura', () => {
  test('tudo atendido é 100 e quente', () => {
    expect(calcularPontuacao(TODOS, REGUA_DE_EXEMPLO)).toMatchObject({ ok: true, score: 100, temperatura: 'quente' })
  })

  test('nada confirmado é 0, frio, e tudo faltando', () => {
    expect(calcularPontuacao({}, REGUA_DE_EXEMPLO)).toEqual({
      ok: true,
      score: 0,
      temperatura: 'frio',
      criteriosAtendidos: [],
      criteriosFaltando: ['dor_confirmada', 'orcamento', 'decisor', 'prazo'],
      criteriosReprovados: [],
    })
  })

  test('morno entre os cortes', () => {
    const r = calcularPontuacao({ dor_confirmada: true, orcamento: true }, REGUA_DE_EXEMPLO)
    expect(r).toMatchObject({ ok: true, score: 55, temperatura: 'morno' })
  })

  test.each([
    [0, 'frio'],
    [39, 'frio'],
    [40, 'morno'],
    [69, 'morno'],
    [70, 'quente'],
    [100, 'quente'],
  ] as const)('score %s é %s nos cortes da régua de exemplo', (score, temperatura) => {
    expect(temperaturaDoScore(score, REGUA_DE_EXEMPLO.cortes)).toBe(temperatura)
  })

  test('não perguntei é faltando; perguntei e desqualifica é reprovado', () => {
    const naoPerguntei = calcularPontuacao({ dor_confirmada: true }, REGUA_DE_EXEMPLO)
    const desqualifica = calcularPontuacao({ dor_confirmada: true, orcamento: false }, REGUA_DE_EXEMPLO)
    expect(naoPerguntei).toMatchObject({ score: 30, criteriosFaltando: ['orcamento', 'decisor', 'prazo'], criteriosReprovados: [] })
    expect(desqualifica).toMatchObject({ score: 30, criteriosFaltando: ['decisor', 'prazo'], criteriosReprovados: ['orcamento'] })
  })

  test('resposta nula conta como faltando, nunca como negativa', () => {
    const r = calcularPontuacao({ dor_confirmada: null, orcamento: undefined }, REGUA_DE_EXEMPLO)
    expect(r).toMatchObject({ score: 0, criteriosReprovados: [] })
  })

  test('critério com peso zero é atendido e não soma', () => {
    const regua: Regua = { criterios: [{ key: 'a', peso: 100 }, { key: 'b', peso: 0 }], cortes: { morno: 40, quente: 70 } }
    expect(calcularPontuacao({ b: true }, regua)).toMatchObject({ score: 0, criteriosAtendidos: ['b'], temperatura: 'frio' })
  })

  test('resposta a critério fora da régua é ignorada', () => {
    expect(calcularPontuacao({ inventado: true }, REGUA_DE_EXEMPLO)).toMatchObject({ score: 0 })
  })

  test('chave de protótipo na resposta não pontua', () => {
    const regua: Regua = { criterios: [{ key: 'constructor', peso: 100 }], cortes: { morno: 40, quente: 70 } }
    expect(calcularPontuacao({}, regua)).toMatchObject({ score: 0, criteriosFaltando: ['constructor'] })
  })

  test('a mesma entrada sob duas réguas dá scores diferentes', () => {
    const respostas = { orcamento: true, decisor: true }
    const a = calcularPontuacao(respostas, REGUA_DE_EXEMPLO)
    const b = calcularPontuacao(respostas, OUTRA_REGUA)
    expect(a).toMatchObject({ score: 50, temperatura: 'morno' })
    expect(b).toMatchObject({ score: 80, temperatura: 'quente' })
  })

  test('a entrada não é alterada', () => {
    const respostas = Object.freeze({ dor_confirmada: true })
    expect(() => calcularPontuacao(respostas, REGUA_DE_EXEMPLO)).not.toThrow()
  })
})

// O que falta para o portão abrir, nas quatro combinações das duas condições.
// A prova de que `guard_dial` aplica a mesma regra está em
// `testes/banco/portao-de-lead-real.test.ts`; aqui se prova a regra que a borda
// e o discador leem.

import { describe, expect, it } from 'vitest'

import { faltaParaAbrir, portaoAberto, type EstadoDoPortao, type FaltaNoPortao } from './portao.ts'

const LIGACAO_DE_TESTE = '2026-09-23T17:00:00Z'

describe('as quatro combinações', () => {
  const casos: ReadonlyArray<readonly [string, EstadoDoPortao, readonly FaltaNoPortao[]]> = [
    [
      'sem bandeira e sem ligação de teste',
      { realDialing: false, primeiraChamadaDeTesteEm: null },
      ['liberacao_da_fase', 'primeira_chamada_de_teste'],
    ],
    [
      'com bandeira e sem ligação de teste',
      { realDialing: true, primeiraChamadaDeTesteEm: null },
      ['primeira_chamada_de_teste'],
    ],
    [
      'sem bandeira e com ligação de teste',
      { realDialing: false, primeiraChamadaDeTesteEm: LIGACAO_DE_TESTE },
      ['liberacao_da_fase'],
    ],
    ['com as duas', { realDialing: true, primeiraChamadaDeTesteEm: LIGACAO_DE_TESTE }, []],
  ]

  it.each(casos)('%s', (_nome, estado, falta) => {
    expect(faltaParaAbrir(estado)).toEqual(falta)
    expect(portaoAberto(estado)).toBe(falta.length === 0)
  })
})

it('instante em branco não conta como ligação de teste', () => {
  expect(portaoAberto({ realDialing: true, primeiraChamadaDeTesteEm: '' })).toBe(false)
})

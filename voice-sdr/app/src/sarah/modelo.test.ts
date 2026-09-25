// O preço do modelo, do formato do provedor ao que cabe numa lista (US-246).
//
// O provedor cota por token, em dólares, e como texto. O que se compara entre
// modelos é o milhão de tokens — é assim que ele mesmo anuncia os preços.

import { describe, expect, test } from 'vitest'

import { descreverPreco, escreverPreco, precoPorMilhao } from '@/sarah/modelo'

describe('precoPorMilhao', () => {
  test('converte o preço por token em preço por milhão', () => {
    expect(precoPorMilhao('0.000015')).toBe(15)
    expect(precoPorMilhao('0.000075')).toBe(75)
    expect(precoPorMilhao('0.0000005')).toBe(0.5)
  })

  test('zero é zero, e não ausência', () => {
    // Grátis é um preço; ausente não é. Confundir os dois afirmaria o que
    // ninguém disse.
    expect(precoPorMilhao('0')).toBe(0)
    expect(precoPorMilhao(null)).toBeNull()
    expect(precoPorMilhao('')).toBeNull()
  })

  test('o que não é número não vira preço', () => {
    expect(precoPorMilhao('grátis')).toBeNull()
    expect(precoPorMilhao('-0.001')).toBeNull()
    expect(precoPorMilhao('NaN')).toBeNull()
  })
})

describe('escreverPreco', () => {
  test('duas casas abaixo de dez dólares, nenhuma acima', () => {
    // A diferença entre US$ 0,25 e US$ 0,30 decide uma escolha; a entre
    // US$ 15 e US$ 15,40 não decide nenhuma.
    expect(escreverPreco(0.5)).toBe('US$ 0,50')
    expect(escreverPreco(3.75)).toBe('US$ 3,75')
    expect(escreverPreco(15)).toBe('US$ 15')
    expect(escreverPreco(1500)).toBe('US$ 1.500')
  })

  test('zero é grátis, escrito', () => {
    expect(escreverPreco(0)).toBe('grátis')
  })
})

describe('descreverPreco', () => {
  test('o par entrada/saída, na ordem', () => {
    expect(descreverPreco('0.000015', '0.000075')).toBe('US$ 15 / US$ 75')
  })

  test('com um só, mostra o que há', () => {
    expect(descreverPreco('0.000015', null)).toBe('US$ 15')
    expect(descreverPreco(null, '0.000075')).toBe('US$ 75')
  })

  test('sem nenhum, não inventa', () => {
    expect(descreverPreco(null, null)).toBeNull()
    expect(descreverPreco('sei lá', null)).toBeNull()
  })

  test('modelo grátis diz que é grátis nos dois lados', () => {
    expect(descreverPreco('0', '0')).toBe('grátis / grátis')
  })
})

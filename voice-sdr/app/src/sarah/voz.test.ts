import { describe, expect, it } from 'vitest'

import {
  ajustesIniciais,
  aparar,
  estadoDaTelaDeVoz,
  fonteDaAmostra,
  mesmaEscolha,
  vozInicial,
} from '@/sarah/voz'
import { catalogoDeExemplo } from '@/testes/servico-da-sarah-dublado'

const catalogo = catalogoDeExemplo()
const bento = catalogo.vozes[1]!
const velocidade = bento.ajustesAceitos.find((ajuste) => ajuste.nome === 'velocidade')!

describe('estadoDaTelaDeVoz', () => {
  it('espera enquanto o pedido viaja, e só então diz o que o servidor observou', () => {
    expect(estadoDaTelaDeVoz(true, catalogo)).toBe('esperando')
    expect(estadoDaTelaDeVoz(false, null)).toBe('esperando')
    expect(estadoDaTelaDeVoz(false, { ...catalogo, estado: 'erro' })).toBe('erro')
    expect(estadoDaTelaDeVoz(false, { ...catalogo, estado: 'indisponivel' })).toBe(
      'indisponivel',
    )
  })
})

describe('aparar', () => {
  it('mantém o valor dentro da faixa do provedor', () => {
    expect(aparar(velocidade, 2)).toBe(1.2)
    expect(aparar(velocidade, 0.1)).toBe(0.7)
    expect(aparar(velocidade, Number.NaN)).toBe(velocidade.padrao)
  })
})

describe('ajustesIniciais e vozInicial', () => {
  it('abre no gravado, senão no padrão daquela voz', () => {
    expect(ajustesIniciais(bento, { velocidade: 1.1 })).toEqual({
      estabilidade: 0.8,
      similaridade: 0.75,
      velocidade: 1.1,
    })
  })

  it('só seleciona a voz gravada, e só se ela ainda está no catálogo', () => {
    expect(vozInicial(catalogo, null)).toBeNull()
    expect(vozInicial(catalogo, 'voz-sumida')).toBeNull()
    expect(vozInicial(catalogo, 'voz-bento')?.nome).toBe('Bento')
  })
})

describe('mesmaEscolha', () => {
  it('vê o ajuste que existe só de um lado', () => {
    const gravada = { vozId: 'voz-bento', ajustes: { velocidade: 1 } }
    expect(mesmaEscolha(gravada, { vozId: 'voz-bento', ajustes: { velocidade: 1 } })).toBe(true)
    expect(
      mesmaEscolha(gravada, { vozId: 'voz-bento', ajustes: { velocidade: 1, estabilidade: 0.5 } }),
    ).toBe(false)
    expect(mesmaEscolha(gravada, { vozId: 'voz-clara', ajustes: { velocidade: 1 } })).toBe(false)
    expect(mesmaEscolha(null, null)).toBe(true)
  })
})

describe('fonteDaAmostra', () => {
  it('monta o endereço data: com o tipo que o provedor devolveu', () => {
    expect(
      fonteDaAmostra({
        vozId: 'v',
        texto: 't',
        ajustes: {},
        formato: 'audio/mpeg',
        audioBase64: 'QUJD',
      }),
    ).toBe('data:audio/mpeg;base64,QUJD')
  })
})

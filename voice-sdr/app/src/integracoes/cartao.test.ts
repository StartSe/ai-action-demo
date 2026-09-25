import { describe, expect, it } from 'vitest'

import {
  algumaChaveCadastrada,
  descreverCota,
  descreverCredito,
  estadoDoCartao,
  podeSalvar,
  valoresParaSalvar,
} from '@/integracoes/cartao'
import type { Integracao } from '@/integracoes/tipos'
import { integracoesDeExemplo } from '@/testes/servico-de-integracoes-dublado'

function integracao(provedor: string): Integracao {
  const achada = integracoesDeExemplo().find(
    (item) => item.provedor === provedor,
  )
  if (!achada) throw new Error(`provedor ${provedor} não existe no exemplo`)
  return achada
}

describe('estado do cartão', () => {
  it('mostra o estado do servidor quando não há pedido em voo', () => {
    expect(estadoDoCartao(integracao('voz'), false)).toBe('conectado')
    expect(estadoDoCartao(integracao('telefonia'), false)).toBe('erro')
    expect(estadoDoCartao(integracao('calendario'), false)).toBe(
      'nao_configurado',
    )
    expect(estadoDoCartao(integracao('email'), false)).toBe('indisponivel')
  })

  it('cobre o estado anterior enquanto o teste está em voo', () => {
    // Dizer "com erro" durante o teste manda agir sobre um resultado que já
    // está sendo refeito.
    expect(estadoDoCartao(integracao('telefonia'), true)).toBe('testando')
    expect(estadoDoCartao(integracao('voz'), true)).toBe('testando')
  })
})

describe('valores do formulário', () => {
  it('apara os valores e descarta os campos em branco', () => {
    expect(
      valoresParaSalvar({ api_key: '  chave-nova  ', outra: '   ', vazia: '' }),
    ).toEqual({ api_key: 'chave-nova' })
  })

  it('campo em branco não vira gravação, para não apagar a chave que está lá', () => {
    expect(valoresParaSalvar({ api_key: '' })).toEqual({})
    expect(podeSalvar({ api_key: '' })).toBe(false)
    expect(podeSalvar({})).toBe(false)
    expect(podeSalvar({ api_key: ' x ' })).toBe(true)
  })
})

describe('leitura do cartão', () => {
  it('sabe quando há ao menos uma chave no cofre', () => {
    expect(algumaChaveCadastrada(integracao('voz'))).toBe(true)
    // O calendário está pela metade: duas chaves lá, uma faltando.
    expect(algumaChaveCadastrada(integracao('calendario'))).toBe(true)
    expect(
      algumaChaveCadastrada({
        ...integracao('voz'),
        chaves: [{ nome: 'api_key', rotulo: 'chave da API', preenchida: false }],
      }),
    ).toBe(false)
  })

  it('descreve o saldo com o total quando o provedor o informa', () => {
    expect(
      descreverCredito({
        restante: 12000,
        total: 100000,
        unidade: 'créditos',
        baixo: false,
      }),
    ).toBe('12.000 de 100.000 créditos')
  })

  it('sem total contratado, descreve só o restante', () => {
    expect(
      descreverCredito({ restante: 1500, total: null, unidade: 'minutos', baixo: false }),
    ).toBe('1.500 minutos')
  })

  it('descreve a cota como uso sobre limite', () => {
    expect(
      descreverCota({
        rotulo: 'Sessões simultâneas',
        emUso: 3,
        limite: 10,
        esgotada: false,
      }),
    ).toBe('3 de 10')
  })
})

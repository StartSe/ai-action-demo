// O par que escreve e lê a conta no endereço do webhook de voz. As duas pontas
// (`phone-register` e `inbound-twiml`) passam por aqui, e o teste fecha a ida e
// a volta.

import { describe, expect, test } from 'vitest'

import { contaDoEndereco, enderecoComConta, PARAMETRO_DA_CONTA } from './conta-no-endereco.ts'

const BASE = 'https://projeto.supabase.co/functions/v1/inbound-twiml'
const CONTA = '11111111-1111-4111-8111-111111111111'

describe('enderecoComConta', () => {
  test('acrescenta a conta na consulta', () => {
    expect(enderecoComConta(BASE, CONTA)).toBe(`${BASE}?${PARAMETRO_DA_CONTA}=${CONTA}`)
  })

  test('troca a conta que já estivesse lá, em vez de repetir o parâmetro', () => {
    const outra = '22222222-2222-4222-8222-222222222222'
    const endereco = enderecoComConta(`${BASE}?conta=${outra}`, CONTA)
    expect(new URL(endereco).searchParams.getAll('conta')).toEqual([CONTA])
  })
})

describe('contaDoEndereco', () => {
  test('lê de volta o que enderecoComConta escreveu', () => {
    expect(contaDoEndereco(enderecoComConta(BASE, CONTA))).toEqual({
      tipo: 'conta',
      contaId: CONTA,
    })
  })

  test('endereço sem a conta é o webhook cadastrado antes do parâmetro', () => {
    expect(contaDoEndereco(BASE)).toEqual({ tipo: 'sem_conta' })
  })

  test('valor que não é uuid não vira leitura', () => {
    expect(contaDoEndereco(`${BASE}?conta=1%20or%201%3D1`)).toEqual({ tipo: 'invalida' })
    expect(contaDoEndereco(`${BASE}?conta=`)).toEqual({ tipo: 'invalida' })
  })

  test('conta repetida é recusada, e não resolvida pela primeira', () => {
    expect(contaDoEndereco(`${BASE}?conta=${CONTA}&conta=${CONTA}`)).toEqual({ tipo: 'invalida' })
  })

  test('endereço ilegível é inválido', () => {
    expect(contaDoEndereco('não é url')).toEqual({ tipo: 'invalida' })
  })
})

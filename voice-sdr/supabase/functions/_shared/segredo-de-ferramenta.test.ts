// Provas do segredo derivado das ferramentas.
//
// O que elas seguram é o que faz o `x-tool-secret` valer alguma coisa: o mesmo
// par (chave, conta) devolve sempre o mesmo valor — senão publicar de novo
// invalidaria as ferramentas em curso —, contas diferentes recebem segredos
// diferentes — senão o cabeçalho não separa conta nenhuma —, e chave vazia
// levanta em vez de derivar, porque um segredo derivado do vazio é igual em
// toda instalação que também esqueceu a variável.

import { describe, expect, test } from 'vitest'

import {
  derivarSegredoDeFerramenta,
  pareceSegredoDeFerramenta,
  segredosDeFerramentaConferem,
} from './segredo-de-ferramenta.ts'

const CHAVE = 'chave-do-servidor-desta-instalacao'
const CONTA = '11111111-1111-4111-8111-111111111111'
const OUTRA_CONTA = '22222222-2222-4222-8222-222222222222'

describe('derivarSegredoDeFerramenta', () => {
  test('devolve hexadecimal minúsculo de 64 caracteres', async () => {
    const segredo = await derivarSegredoDeFerramenta(CHAVE, CONTA)
    expect(pareceSegredoDeFerramenta(segredo)).toBe(true)
  })

  test('é determinístico: publicar de novo não invalida ferramenta em curso', async () => {
    const primeiro = await derivarSegredoDeFerramenta(CHAVE, CONTA)
    const segundo = await derivarSegredoDeFerramenta(CHAVE, CONTA)
    expect(segundo).toBe(primeiro)
  })

  test('conta diferente, segredo diferente', async () => {
    const daConta = await derivarSegredoDeFerramenta(CHAVE, CONTA)
    const daOutra = await derivarSegredoDeFerramenta(CHAVE, OUTRA_CONTA)
    expect(daOutra).not.toBe(daConta)
  })

  test('chave diferente, segredo diferente: trocar a chave do servidor rotaciona tudo', async () => {
    const comAChave = await derivarSegredoDeFerramenta(CHAVE, CONTA)
    const comOutraChave = await derivarSegredoDeFerramenta(`${CHAVE}-2`, CONTA)
    expect(comOutraChave).not.toBe(comAChave)
  })

  test('não é o sha-256 da concatenação: a chave entra como chave, não como prefixo', async () => {
    const derivado = await derivarSegredoDeFerramenta(CHAVE, CONTA)
    const resumo = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${CHAVE}${CONTA}`),
    )
    const concatenado = [...new Uint8Array(resumo)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    expect(derivado).not.toBe(concatenado)
  })

  test('chave em branco levanta em vez de derivar', async () => {
    await expect(derivarSegredoDeFerramenta('   ', CONTA)).rejects.toThrow(/chave do servidor/)
  })

  test('conta em branco levanta em vez de derivar', async () => {
    await expect(derivarSegredoDeFerramenta(CHAVE, '')).rejects.toThrow(/conta/)
  })
})

describe('segredosDeFerramentaConferem', () => {
  test('aceita o valor derivado, com espaço em volta', async () => {
    const segredo = await derivarSegredoDeFerramenta(CHAVE, CONTA)
    expect(segredosDeFerramentaConferem(` ${segredo} `, segredo)).toBe(true)
  })

  test('recusa o segredo de outra conta', async () => {
    const daConta = await derivarSegredoDeFerramenta(CHAVE, CONTA)
    const daOutra = await derivarSegredoDeFerramenta(CHAVE, OUTRA_CONTA)
    expect(segredosDeFerramentaConferem(daOutra, daConta)).toBe(false)
  })

  test('recusa valor de outro tamanho sem levantar', () => {
    expect(segredosDeFerramentaConferem('curto', 'a'.repeat(64))).toBe(false)
  })
})

// Provas da conferência do `x-tool-secret`.
//
// O que elas seguram: o segredo prova a conta sem consulta (descobre qual das
// candidatas ele é), a rotação aceita a chave anterior só dentro das 24 h e diz
// qual chave casou, cada recusa tem nome próprio, e o segredo apresentado não
// volta em lugar nenhum. O tempo constante é estrutural e não se testa — ver o
// comentário de `bytesIguais`.

import { describe, expect, test } from 'vitest'

import { derivarSegredoDeFerramenta } from '../segredo-de-ferramenta.ts'
import {
  JANELA_DE_ROTACAO_EM_MS,
  bytesIguais,
  conferirSegredo,
  derivarSegredo,
  type ChavesDoServidor,
} from './segredo.ts'

const CHAVE = 'chave-do-servidor-vigente'
const CHAVE_ANTERIOR = 'chave-do-servidor-de-antes'
const CONTA = '11111111-1111-4111-8111-111111111111'
const OUTRA_CONTA = '22222222-2222-4222-8222-222222222222'
const TERCEIRA_CONTA = '33333333-3333-4333-8333-333333333333'
const AGORA = Date.parse('2026-09-24T12:00:00Z')
const UMA_HORA = 60 * 60 * 1000

const relogio = (instante: number) => () => instante

function comRotacao(rotacionadaEm: number | null): ChavesDoServidor {
  return { vigente: CHAVE, anterior: CHAVE_ANTERIOR, rotacionadaEm }
}

describe('derivarSegredo', () => {
  test('é HMAC-SHA256 da conta com a chave do servidor, em hexadecimal', async () => {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(CHAVE),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const assinatura = await crypto.subtle.sign('HMAC', material, new TextEncoder().encode(CONTA))
    const esperado = [...new Uint8Array(assinatura)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    expect(await derivarSegredo(CHAVE, CONTA)).toBe(esperado)
  })

  test('é a mesma receita que agent-publish grava no agente', async () => {
    expect(await derivarSegredo(CHAVE, CONTA)).toBe(await derivarSegredoDeFerramenta(CHAVE, CONTA))
  })
})

describe('conferirSegredo', () => {
  test('descobre a conta entre as candidatas, com a chave vigente', async () => {
    const cabecalho = await derivarSegredo(CHAVE, OUTRA_CONTA)
    const resultado = await conferirSegredo({
      cabecalho,
      chaves: { vigente: CHAVE },
      contas: [CONTA, OUTRA_CONTA, TERCEIRA_CONTA],
      agora: relogio(AGORA),
    })
    expect(resultado).toEqual({ ok: true, contaId: OUTRA_CONTA, chave: 'vigente' })
  })

  test('aceita espaço em volta do cabeçalho', async () => {
    const cabecalho = ` ${await derivarSegredo(CHAVE, CONTA)} `
    const resultado = await conferirSegredo({ cabecalho, chaves: { vigente: CHAVE }, contas: [CONTA] })
    expect(resultado).toEqual({ ok: true, contaId: CONTA, chave: 'vigente' })
  })

  describe('rotação de dois segredos (R-07)', () => {
    test('dentro das 24 h, a chave anterior confere e a resposta diz qual casou', async () => {
      const cabecalho = await derivarSegredo(CHAVE_ANTERIOR, CONTA)
      const resultado = await conferirSegredo({
        cabecalho,
        chaves: comRotacao(AGORA - 23 * UMA_HORA),
        contas: [OUTRA_CONTA, CONTA],
        agora: relogio(AGORA),
      })
      expect(resultado).toEqual({ ok: true, contaId: CONTA, chave: 'anterior' })
    })

    test('durante a rotação, a vigente continua conferindo como vigente', async () => {
      const cabecalho = await derivarSegredo(CHAVE, CONTA)
      const resultado = await conferirSegredo({
        cabecalho,
        chaves: comRotacao(AGORA - UMA_HORA),
        contas: [CONTA],
        agora: relogio(AGORA),
      })
      expect(resultado).toEqual({ ok: true, contaId: CONTA, chave: 'vigente' })
    })

    test('depois das 24 h, a anterior deixa de conferir', async () => {
      const cabecalho = await derivarSegredo(CHAVE_ANTERIOR, CONTA)
      const resultado = await conferirSegredo({
        cabecalho,
        chaves: comRotacao(AGORA - JANELA_DE_ROTACAO_EM_MS - 1),
        contas: [CONTA],
        agora: relogio(AGORA),
      })
      expect(resultado).toEqual({ ok: false, motivo: 'sem_conta' })
    })

    test('sem carimbo de rotação, ou com carimbo no futuro, a anterior não vale', async () => {
      const cabecalho = await derivarSegredo(CHAVE_ANTERIOR, CONTA)
      for (const rotacionadaEm of [null, AGORA + UMA_HORA]) {
        const resultado = await conferirSegredo({
          cabecalho,
          chaves: comRotacao(rotacionadaEm),
          contas: [CONTA],
          agora: relogio(AGORA),
        })
        expect(resultado).toEqual({ ok: false, motivo: 'sem_conta' })
      }
    })

    test('o relógio entra por parâmetro: o mesmo pedido vale antes e não vale depois', async () => {
      const cabecalho = await derivarSegredo(CHAVE_ANTERIOR, CONTA)
      const chaves = comRotacao(AGORA)
      const antes = await conferirSegredo({ cabecalho, chaves, contas: [CONTA], agora: relogio(AGORA + UMA_HORA) })
      const depois = await conferirSegredo({
        cabecalho,
        chaves,
        contas: [CONTA],
        agora: relogio(AGORA + 25 * UMA_HORA),
      })
      expect(antes.ok).toBe(true)
      expect(depois.ok).toBe(false)
    })
  })

  describe('as quatro recusas', () => {
    test('cabeçalho ausente', async () => {
      for (const cabecalho of [null, undefined, '', '   ']) {
        const resultado = await conferirSegredo({ cabecalho, chaves: { vigente: CHAVE }, contas: [CONTA] })
        expect(resultado).toEqual({ ok: false, motivo: 'cabecalho_ausente' })
      }
    })

    test('segredo malformado', async () => {
      const segredo = await derivarSegredo(CHAVE, CONTA)
      for (const cabecalho of ['z'.repeat(64), segredo.toUpperCase(), `${segredo.slice(0, 63)}-`]) {
        const resultado = await conferirSegredo({ cabecalho, chaves: { vigente: CHAVE }, contas: [CONTA] })
        expect(resultado).toEqual({ ok: false, motivo: 'segredo_malformado' })
      }
    })

    test('segredo de tamanho diferente', async () => {
      const segredo = await derivarSegredo(CHAVE, CONTA)
      for (const cabecalho of [segredo.slice(0, 62), `${segredo}00`, 'ab']) {
        const resultado = await conferirSegredo({ cabecalho, chaves: { vigente: CHAVE }, contas: [CONTA] })
        expect(resultado).toEqual({ ok: false, motivo: 'tamanho_diferente' })
      }
    })

    test('segredo que não casa com conta nenhuma', async () => {
      const deOutraConta = await derivarSegredo(CHAVE, TERCEIRA_CONTA)
      const deOutraInstalacao = await derivarSegredo('chave-de-outra-instalacao', CONTA)
      for (const cabecalho of [deOutraConta, deOutraInstalacao]) {
        const resultado = await conferirSegredo({
          cabecalho,
          chaves: { vigente: CHAVE },
          contas: [CONTA, OUTRA_CONTA],
        })
        expect(resultado).toEqual({ ok: false, motivo: 'sem_conta' })
      }
    })

    test('sem candidatas, nenhum segredo prova conta', async () => {
      const cabecalho = await derivarSegredo(CHAVE, CONTA)
      const resultado = await conferirSegredo({ cabecalho, chaves: { vigente: CHAVE }, contas: [] })
      expect(resultado).toEqual({ ok: false, motivo: 'sem_conta' })
    })
  })

  test('chave do servidor em branco levanta, sem citar o segredo apresentado', async () => {
    const cabecalho = await derivarSegredo(CHAVE, CONTA)
    const falha = await conferirSegredo({ cabecalho, chaves: { vigente: '  ' }, contas: [CONTA] }).catch(
      (erro: unknown) => erro,
    )
    expect(falha).toBeInstanceOf(Error)
    expect(String((falha as Error).message)).not.toContain(cabecalho)
    expect(String((falha as Error).stack)).not.toContain(cabecalho)
  })

  test('o segredo apresentado não volta no objeto de retorno de caso nenhum', async () => {
    const valido = await derivarSegredo(CHAVE, CONTA)
    const anterior = await derivarSegredo(CHAVE_ANTERIOR, CONTA)
    const errado = await derivarSegredo(CHAVE, TERCEIRA_CONTA)
    const casos = [valido, anterior, errado, valido.slice(0, 40), `${valido.slice(0, 63)}x`]
    for (const cabecalho of casos) {
      const resultado = await conferirSegredo({
        cabecalho,
        chaves: comRotacao(AGORA - UMA_HORA),
        contas: [CONTA, OUTRA_CONTA],
        agora: relogio(AGORA),
      })
      const texto = JSON.stringify(resultado)
      expect(texto).not.toContain(cabecalho)
      // Nem pedaço dele: um prefixo de 16 caracteres já é informação sobre o segredo.
      expect(texto).not.toContain(cabecalho.slice(0, 16))
    }
  })
})

describe('bytesIguais', () => {
  test('compara conteúdo e recusa tamanho diferente sem levantar', () => {
    expect(bytesIguais(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(bytesIguais(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(bytesIguais(new Uint8Array([9, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(false)
    expect(bytesIguais(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
  })
})

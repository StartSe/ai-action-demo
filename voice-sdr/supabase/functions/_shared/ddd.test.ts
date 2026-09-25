// O fuso do lead decide a hora em que o telefone dele toca. Um DDD resolvido
// errado não aparece em lugar nenhum da tela: aparece como ligação às seis da
// manhã, e quem recebe não volta a atender. Por isso o teste não confere só os
// casos que o critério cita — ele varre os 67 códigos e reprova qualquer um que
// esteja sem cidade, sem estado ou com um fuso que não é do país.
//
// A varredura é o ponto. Um DDD novo (ou um recortado numa reorganização da
// Anatel) entra na tabela e cai nessas asserções sozinho, sem ninguém lembrar
// de acrescentar um `test` para ele.

import { describe, expect, test } from 'vitest'

import {
  DDDS_VALIDOS,
  FUSOS_DO_BRASIL,
  LOCAIS_POR_DDD,
  dddEhValido,
  resolverDdd,
  resolverFusoDoTelefone,
} from './ddd.ts'

/**
 * Códigos que a Anatel nunca atribuiu. O critério de aceite da F1 cita seis
 * deles; a lista inteira está aqui porque é a mesma que o cabeçalho de `ddd.ts`
 * declara, e um código que voltasse a resolver por descuido cairia aqui.
 */
const NUNCA_ATRIBUIDOS = [
  '20', '23', '25', '26', '29', '30', '36', '39', '40', '50', '52',
  '56', '57', '58', '59', '60', '70', '72', '76', '78', '80', '90',
]

/** As 27 unidades da federação. Todas têm DDD, então todas têm que aparecer. */
const UNIDADES_DA_FEDERACAO = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP',
  'TO',
]

describe('a tabela dos 67 DDDs', () => {
  test('tem exatamente 67 códigos, e nenhum fora da faixa 11–99', () => {
    expect(LOCAIS_POR_DDD.size).toBe(67)
    for (const ddd of LOCAIS_POR_DDD.keys()) {
      expect(ddd, `${ddd} não é um DDD de dois dígitos`).toMatch(/^[1-9][1-9]$/)
    }
  })

  test.each([...LOCAIS_POR_DDD.keys()])('%s resolve com cidade, estado e fuso do país', (ddd) => {
    const local = resolverDdd(ddd)
    expect(local, `DDD ${ddd} está na tabela mas não resolve`).not.toBeNull()
    if (local === null) return

    expect(local.cidade.trim(), `DDD ${ddd} sem cidade de referência`).not.toBe('')
    expect(UNIDADES_DA_FEDERACAO, `DDD ${ddd} com estado fora das 27 UFs`).toContain(local.estado)
    expect(FUSOS_DO_BRASIL, `DDD ${ddd} com fuso fora das zonas IANA aceitas`).toContain(local.fuso)
  })

  test('cobre as 27 unidades da federação', () => {
    const estados = new Set([...LOCAIS_POR_DDD.values()].map((local) => local.estado))
    expect([...estados].sort()).toEqual(UNIDADES_DA_FEDERACAO)
  })

  test('`DDDS_VALIDOS` é a mesma lista da tabela, não uma segunda', () => {
    expect([...DDDS_VALIDOS].sort()).toEqual([...LOCAIS_POR_DDD.keys()].sort())
    for (const ddd of LOCAIS_POR_DDD.keys()) expect(dddEhValido(ddd)).toBe(true)
  })

  test('os cinco fusos do país estão todos em uso', () => {
    const fusos = new Set([...LOCAIS_POR_DDD.values()].map((local) => local.fuso))
    expect([...fusos].sort()).toEqual([...FUSOS_DO_BRASIL].sort())
  })
})

describe('resolverDdd', () => {
  // O quarto critério de aceite da F1, escrito como teste. Santa Catarina não
  // tem zona IANA própria: o estado é SC e o fuso é America/Sao_Paulo.
  test('48 é Florianópolis, SC, no fuso de São Paulo', () => {
    expect(resolverDdd('48')).toEqual({
      cidade: 'Florianópolis',
      estado: 'SC',
      fuso: 'America/Sao_Paulo',
    })
  })

  test.each([
    ['92', 'Manaus', 'AM', 'America/Manaus'],
    ['68', 'Rio Branco', 'AC', 'America/Rio_Branco'],
    ['67', 'Campo Grande', 'MS', 'America/Campo_Grande'],
    ['65', 'Cuiabá', 'MT', 'America/Cuiaba'],
    ['11', 'São Paulo', 'SP', 'America/Sao_Paulo'],
  ])('%s é %s, %s, em %s', (ddd, cidade, estado, fuso) => {
    expect(resolverDdd(ddd)).toEqual({ cidade, estado, fuso })
  })

  test.each(NUNCA_ATRIBUIDOS)('%s não existe e devolve null', (ddd) => {
    expect(resolverDdd(ddd)).toBeNull()
    expect(dddEhValido(ddd)).toBe(false)
  })

  // Busca por chave vinda de fora não pode encontrar nada na cadeia de
  // protótipos: é o motivo de a tabela ser `Map` e não objeto literal.
  test.each(['', ' ', '4', '048', '480', 'SC', 'constructor', 'toString', '__proto__'])(
    '%s não é DDD e devolve null',
    (entrada) => {
      expect(resolverDdd(entrada)).toBeNull()
    },
  )
})

describe('resolverFusoDoTelefone', () => {
  test('extrai o DDD de um celular e de um fixo brasileiros', () => {
    expect(resolverFusoDoTelefone('+5548999998888')?.fuso).toBe('America/Sao_Paulo')
    expect(resolverFusoDoTelefone('+554832221100')?.estado).toBe('SC')
    expect(resolverFusoDoTelefone('+5592988887777')?.fuso).toBe('America/Manaus')
    expect(resolverFusoDoTelefone('+5568988887777')?.fuso).toBe('America/Rio_Branco')
  })

  test.each([
    ['+12125550100', 'Estados Unidos'],
    ['+351912345678', 'Portugal'],
    ['+5491123456789', 'Argentina'],
  ])('%s é de outro país (%s) e devolve null', (e164) => {
    expect(resolverFusoDoTelefone(e164)).toBeNull()
  })

  // `+55` com DDD inexistente é diferente de país não suportado, mas a resposta
  // é a mesma: quem chama cai no fuso da conta nos dois casos.
  test('número brasileiro com DDD inexistente devolve null', () => {
    expect(resolverFusoDoTelefone('+5520999998888')).toBeNull()
  })

  test.each([
    ['48999998888', 'sem o + e sem o código do país'],
    ['+55 48 99999-8888', 'com separadores'],
    ['+554899999', 'curto demais para ter DDD e assinante'],
    ['+55489999988887', 'com um dígito a mais'],
    ['', 'vazio'],
  ])('%s não é E.164 (%s) e devolve null', (entrada) => {
    expect(resolverFusoDoTelefone(entrada)).toBeNull()
  })
})

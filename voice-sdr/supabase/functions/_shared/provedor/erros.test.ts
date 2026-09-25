// A tradução do que o provedor respondeu. O que se prova aqui é uma coisa só,
// e é a que importa: entra código bruto, sai frase em português, e o código
// bruto não aparece em lugar nenhum do que sai.

import { expect, test } from 'vitest'

import {
  MENSAGENS_DO_PROVEDOR,
  eFalhaDoProvedor,
  traduzirErroDoProvedor,
  type MotivoDoProvedor,
} from './erros.ts'

const CASOS: ReadonlyArray<readonly [string, MotivoDoProvedor]> = [
  ['invalid_api_key', 'chave_invalida'],
  ['Invalid API Key', 'chave_invalida'],
  ['authentication_error', 'chave_invalida'],
  ['invalid_grant', 'chave_invalida'],
  ['forbidden', 'sem_permissao'],
  ['insufficient_scope', 'sem_permissao'],
  ['quota_exceeded', 'sem_credito'],
  ['insufficient_credits', 'sem_credito'],
  ['rate_limit_exceeded', 'limite_de_taxa'],
  ['too_many_requests', 'limite_de_taxa'],
  ['fetch failed', 'sem_resposta'],
  ['ETIMEDOUT', 'sem_resposta'],
  ['service_unavailable', 'provedor_indisponivel'],
  ['internal_server_error', 'provedor_indisponivel'],
]

test.each(CASOS)('o código %s vira o motivo %s', (codigo, esperado) => {
  expect(traduzirErroDoProvedor(codigo).motivo).toBe(esperado)
})

test('o código tem precedência sobre o status', () => {
  // Um 400 com `invalid_api_key` diz mais do que o 400 sozinho.
  expect(traduzirErroDoProvedor('invalid_api_key', 400).motivo).toBe('chave_invalida')
})

test('sem código, o status decide', () => {
  expect(traduzirErroDoProvedor(null, 403).motivo).toBe('sem_permissao')
  expect(traduzirErroDoProvedor('', 502).motivo).toBe('provedor_indisponivel')
})

test('código desconhecido e status inútil caem em falha do provedor', () => {
  expect(traduzirErroDoProvedor('ERR_XYZ', 418).motivo).toBe('falha_do_provedor')
  expect(traduzirErroDoProvedor(undefined, null).motivo).toBe('falha_do_provedor')
})

test('nenhuma frase carrega o código bruto que a gerou', () => {
  for (const [codigo] of CASOS) {
    expect(traduzirErroDoProvedor(codigo).mensagem).not.toContain(codigo)
  }
})

test('toda frase diz o que fazer em seguida', () => {
  for (const mensagem of Object.values(MENSAGENS_DO_PROVEDOR)) {
    expect(mensagem.length).toBeGreaterThan(30)
    // Registro de interface: direto e declarativo, sem travessão
    // (docs/padrao-de-interface.md seção 4).
    expect(mensagem).not.toContain('—')
  }
})

test('só rede e queda do provedor contam como falha do provedor', () => {
  expect(eFalhaDoProvedor('sem_resposta')).toBe(true)
  expect(eFalhaDoProvedor('provedor_indisponivel')).toBe(true)
  expect(eFalhaDoProvedor('chave_invalida')).toBe(false)
  expect(eFalhaDoProvedor('sem_credito')).toBe(false)
})

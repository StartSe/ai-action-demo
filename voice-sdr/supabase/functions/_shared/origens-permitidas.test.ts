import { expect, test } from 'vitest'

import { retornoPermitido } from '../model-connect/conexao.ts'

import { origensPermitidas } from './origens-permitidas.ts'

test('a lista do ambiente vence a origem do pedido', () => {
  expect(origensPermitidas(' https://a.exemplo.com , https://b.exemplo.com', 'https://c.exemplo.com')).toEqual([
    'https://a.exemplo.com',
    'https://b.exemplo.com',
  ])
})

test('sem a lista, vale a origem do pedido autenticado', () => {
  expect(origensPermitidas(undefined, 'https://minha-copia.onrender.com')).toEqual([
    'https://minha-copia.onrender.com',
  ])
  expect(origensPermitidas('', 'http://localhost:5173')).toEqual(['http://localhost:5173'])
})

test('sem lista e sem origem, nenhum retorno vale', () => {
  expect(origensPermitidas(undefined, null)).toEqual([])
  expect(origensPermitidas(undefined, 'null')).toEqual([])
  expect(origensPermitidas(undefined, 'não é endereço')).toEqual([])
})

test('retorno para outro site continua recusado com a origem do pedido', () => {
  const origens = origensPermitidas(undefined, 'https://minha-copia.onrender.com')
  expect(retornoPermitido('https://minha-copia.onrender.com/config/integracoes', origens)).toBe(true)
  expect(retornoPermitido('https://atacante.exemplo/roubar', origens)).toBe(false)
})

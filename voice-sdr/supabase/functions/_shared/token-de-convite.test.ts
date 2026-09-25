// O par token/hash é o que separa "tem o link" de "está na tabela". Se o hash
// deixar de ser estável, todo convite já emitido vira link morto; se o token
// deixar de ser imprevisível, o convite vira adivinhação.

import { expect, test } from 'vitest'

import {
  gerarTokenDeConvite,
  hashDeToken,
  pareceHashDeToken,
} from './token-de-convite.ts'

test('o hash é sha-256 em hexadecimal minúsculo, com 64 caracteres', async () => {
  const hash = await hashDeToken('convite')

  expect(hash).toHaveLength(64)
  expect(pareceHashDeToken(hash)).toBe(true)
})

test('o hash é o sha-256 conhecido da cadeia vazia', async () => {
  // Valor de referência do próprio algoritmo: se ele mudar, o que mudou foi a
  // implementação, e todo token já emitido deixou de resolver.
  await expect(hashDeToken('')).resolves.toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )
})

test('o mesmo token dá sempre o mesmo hash, e tokens diferentes não colidem', async () => {
  const a = await hashDeToken('mesmo-token')
  const b = await hashDeToken('mesmo-token')
  const c = await hashDeToken('outro-token')

  expect(a).toBe(b)
  expect(a).not.toBe(c)
})

test('espaço em volta do token não muda o hash', async () => {
  await expect(hashDeToken('  convite \n')).resolves.toBe(
    await hashDeToken('convite'),
  )
})

test('o token cabe numa URL sem escape', () => {
  for (let i = 0; i < 20; i += 1) {
    const token = gerarTokenDeConvite()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(token)).toBe(token)
    expect(token.length).toBeGreaterThanOrEqual(43)
  }
})

test('dois tokens gerados em sequência são diferentes', () => {
  const tokens = new Set(Array.from({ length: 200 }, gerarTokenDeConvite))

  expect(tokens.size).toBe(200)
})

test('pareceHashDeToken recusa o que a coluna token_hash recusaria', () => {
  expect(pareceHashDeToken('a'.repeat(63))).toBe(false)
  expect(pareceHashDeToken('a'.repeat(65))).toBe(false)
  expect(pareceHashDeToken('A'.repeat(64))).toBe(false)
  expect(pareceHashDeToken('z'.repeat(64))).toBe(false)
  expect(pareceHashDeToken(gerarTokenDeConvite())).toBe(false)
})

// A chave de entrada é segredo de portador: quem a tem escreve na conta. Duas
// coisas a sustentam, e cada uma tem teste aqui.
//
// 1. O hash é estável. Se ele mudar, toda chave já entregue a um cliente para
//    apontar o formulário do site deixa de resolver a conta, e o endereço
//    público passa a recusar lead legítimo sem ninguém ter mexido em nada.
// 2. A chave é imprevisível e cabe numa URL. Previsível, o endereço público
//    vira porta aberta; fora do alfabeto da URL, o valor chega à borda
//    escapado e o hash não bate.

import { expect, test } from 'vitest'

import {
  chaveConfereComOHash,
  gerarChaveDeEntrada,
  hashDaChaveDeEntrada,
  pareceHashDaChaveDeEntrada,
} from './chave-de-entrada.ts'
import { hashDeToken } from './token-de-convite.ts'

test('o hash é sha-256 em hexadecimal minúsculo, com 64 caracteres', async () => {
  const hash = await hashDaChaveDeEntrada(gerarChaveDeEntrada())

  expect(hash).toHaveLength(64)
  expect(pareceHashDaChaveDeEntrada(hash)).toBe(true)
})

test('o hash é o sha-256 conhecido da cadeia vazia', async () => {
  // Valor de referência do próprio algoritmo: se ele mudar, o que mudou foi a
  // implementação, e toda chave já entregue deixou de resolver a conta.
  await expect(hashDaChaveDeEntrada('')).resolves.toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )
})

test('a mesma chave dá sempre o mesmo hash, e chaves diferentes não colidem', async () => {
  const a = await hashDaChaveDeEntrada('mesma-chave')
  const b = await hashDaChaveDeEntrada('mesma-chave')
  const c = await hashDaChaveDeEntrada('outra-chave')

  expect(a).toBe(b)
  expect(a).not.toBe(c)
})

test('espaço em volta da chave não muda o hash', async () => {
  // A chave chega por cabeçalho ou por caminho de URL, e copiar e colar traz
  // espaço e quebra de linha junto. Recusar por isso seria recusar a chave certa.
  await expect(hashDaChaveDeEntrada('  chave \n')).resolves.toBe(
    await hashDaChaveDeEntrada('chave'),
  )
})

test('a chave cabe numa URL sem escape', () => {
  for (let i = 0; i < 20; i += 1) {
    const chave = gerarChaveDeEntrada()
    expect(chave).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(chave)).toBe(chave)
    expect(chave.length).toBeGreaterThanOrEqual(43)
  }
})

test('duas chaves geradas em sequência são diferentes', () => {
  const chaves = new Set(Array.from({ length: 200 }, gerarChaveDeEntrada))

  expect(chaves.size).toBe(200)
})

test('pareceHashDaChaveDeEntrada recusa o que a coluna intake_key_hash recusaria', () => {
  expect(pareceHashDaChaveDeEntrada('a'.repeat(63))).toBe(false)
  expect(pareceHashDaChaveDeEntrada('a'.repeat(65))).toBe(false)
  expect(pareceHashDaChaveDeEntrada('A'.repeat(64))).toBe(false)
  expect(pareceHashDaChaveDeEntrada('z'.repeat(64))).toBe(false)
  expect(pareceHashDaChaveDeEntrada(gerarChaveDeEntrada())).toBe(false)
})

test('convite e chave de entrada compartilham a receita do hash', async () => {
  // Não é coincidência a ser preservada, é a razão de `hash-de-segredo.ts`
  // existir: uma implementação só. Duas cópias se desencontrariam no primeiro
  // ajuste, e o desencontro só apareceria em produção, como segredo que não
  // resolve mais.
  await expect(hashDaChaveDeEntrada('mesmo-valor')).resolves.toBe(
    await hashDeToken('mesmo-valor'),
  )
})

test('chaveConfereComOHash aceita o par certo e recusa qualquer outro', async () => {
  // A conferência é a rede de proteção da borda: a consulta ao banco resolve a
  // conta por igualdade no índice, e esta função é quem pega uma porta de dados
  // que um dia troque a igualdade por `like` e passe a resolver conta por
  // prefixo de chave.
  const guardado = await hashDaChaveDeEntrada('chave-da-conta')

  expect(chaveConfereComOHash(guardado, guardado)).toBe(true)
  expect(chaveConfereComOHash(await hashDaChaveDeEntrada('outra-chave'), guardado)).toBe(false)
  // Prefixo do hash certo, que é exatamente o que um `like` resolveria.
  expect(chaveConfereComOHash(guardado.slice(0, 32), guardado)).toBe(false)
  expect(chaveConfereComOHash(`${guardado}0`, guardado)).toBe(false)
  expect(chaveConfereComOHash('', guardado)).toBe(false)
})

test('a comparação difere do hash certo em todas as posições, uma por uma', async () => {
  // Varredura, e não caso escolhido: o laço da comparação percorre os 64
  // caracteres, e um `return` no meio dele — que é o que a torna sensível ao
  // tempo — não é o que este teste mede. **O tempo constante não tem teste**,
  // de propósito: nenhuma asserção de tempo sobrevive a um CI compartilhado, e
  // a que sobrevivesse passaria igual com `a === b` no lugar do laço. O que
  // segura a propriedade é a leitura do módulo. O que este teste segura é que
  // divergir em qualquer posição é recusa, inclusive na última.
  const guardado = await hashDaChaveDeEntrada('chave-da-conta')

  for (let posicao = 0; posicao < guardado.length; posicao += 1) {
    const caractere = guardado[posicao] === '0' ? '1' : '0'
    const alterado = guardado.slice(0, posicao) + caractere + guardado.slice(posicao + 1)

    expect(chaveConfereComOHash(alterado, guardado)).toBe(false)
  }
})

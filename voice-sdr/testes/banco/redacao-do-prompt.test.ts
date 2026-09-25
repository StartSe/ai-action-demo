// A redação de `integration_events` cobre a chave `prompt` (US-063).
//
// `playbook-draft` põe sob `prompt` o texto que mandou ao modelo, e esse texto
// carrega a descrição do negócio que a conta escreveu. O que este arquivo
// prova:
//
// 1. **O gatilho troca o `prompt` por `[redigido]`**, no primeiro nível e
//    dentro de objeto aninhado, e deixa o resto do pedido legível — modelo,
//    propósito e tamanho continuam servindo para depurar.
// 2. **As chaves que já eram redigidas continuam sendo.** A troca é
//    `create or replace` da função inteira, e uma versão que reescrevesse a
//    expressão perdendo um termo passaria calada sem esta asserção.
//
// Referência: migração 20260923200000_redacao_do_prompt.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string

/** Descrição improvável, para a busca por vazamento não achar por acaso. */
const DESCRICAO = 'Vendemos parafusos titânicos para estaleiros de Itajaí-Mirim'

async function registrar(request: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const { rows } = await banco.sql.query<{ request: Record<string, unknown> }>(
    `insert into public.integration_events (account_id, direction, provider, endpoint, request)
     values ($1, 'outbound', 'modelo', 'v1/messages', $2::jsonb)
     returning request`,
    [contaId, JSON.stringify(request)],
  )
  return rows[0]!.request
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Estaleiro Norte') returning id`,
  )
  contaId = rows[0]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.integration_events')
})

test('o prompt sai redigido e o resumo do pedido continua legível', async () => {
  const gravado = await registrar({
    model: 'claude-opus-5',
    purpose: 'discovery',
    prompt: `Descrição do negócio: ${DESCRICAO}`,
    caracteres: DESCRICAO.length,
  })

  expect(gravado).toEqual({
    model: 'claude-opus-5',
    purpose: 'discovery',
    prompt: '[redigido]',
    caracteres: DESCRICAO.length,
  })
  expect(JSON.stringify(gravado)).not.toContain('parafusos titânicos')
})

test('o prompt aninhado também sai redigido', async () => {
  const gravado = await registrar({ pedido: { system_prompt: DESCRICAO, modelo: 'claude-opus-5' } })

  expect(gravado).toEqual({ pedido: { system_prompt: '[redigido]', modelo: 'claude-opus-5' } })
})

test('as chaves que já eram redigidas continuam sendo', async () => {
  const gravado = await registrar({
    headers: { Authorization: 'Bearer x' },
    api_key: 'a',
    auth_token: 'b',
    secret: 'c',
    senha: 'd',
    password: 'e',
    account_sid: 'f',
    to: '+5511999998888',
  })

  expect(gravado).toEqual({
    headers: { Authorization: '[redigido]' },
    api_key: '[redigido]',
    auth_token: '[redigido]',
    secret: '[redigido]',
    senha: '[redigido]',
    password: '[redigido]',
    account_sid: '[redigido]',
    to: '+5511999998888',
  })
})

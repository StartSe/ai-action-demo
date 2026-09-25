// O modo de teste do WhatsApp no banco: a coluna nasce `teste` e só aceita os
// dois valores. Quem aplica o modo é a borda (`_shared/whatsapp/modo.ts`),
// testada em `whatsapp-inbound/entrada.test.ts`.
//
// Referência: migração 20261006100000_modo_de_teste_do_whatsapp.sql.

import { afterAll, beforeAll, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(`insert into public.accounts (name) values ('Conta') returning id`)
  contaId = rows[0]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

test('a conta nasce no modo de teste', async () => {
  const { rows } = await banco.sql.query<{ whatsapp_mode: string }>(
    'select whatsapp_mode from public.account_settings where account_id = $1',
    [contaId],
  )
  expect(rows).toEqual([{ whatsapp_mode: 'teste' }])
})

test('todos é aceito, e valor desconhecido é recusado', async () => {
  await banco.sql.query(`update public.account_settings set whatsapp_mode = 'todos' where account_id = $1`, [contaId])
  await expect(
    banco.sql.query(`update public.account_settings set whatsapp_mode = 'alguns' where account_id = $1`, [contaId]),
  ).rejects.toMatchObject({ code: '23514' })
  await expect(
    banco.sql.query(`update public.account_settings set whatsapp_mode = null where account_id = $1`, [contaId]),
  ).rejects.toMatchObject({ code: '23502' })
})

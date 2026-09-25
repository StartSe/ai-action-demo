// Autoria da lista de bloqueio: quem incluiu e quem removeu vêm do banco.
//
// O que este arquivo prova:
//
// 1. O insert de um operador grava o id dele em `created_by`, ainda que o
//    comando mande o id de outra pessoa.
// 2. Sem sessão (chave de serviço, que é o bloqueio vindo da ligação), o que
//    veio no comando fica — e nulo continua nulo.
// 3. A remoção carimba `removed_by` com quem removeu, e a tela pode mandar só o
//    instante e o motivo: o check dos três campos enxerga o carimbo.
// 4. `created_by` não muda depois do nascimento.
//
// Referência: migração 20260923110000_autoria_do_bloqueio.sql, US-088.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let operadorId: string
let outroId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Transportes Aurora') returning id`,
  )
  contaId = rows[0]!.id
  operadorId = await banco.criarUsuario('operador@aurora.test', 'Operador')
  outroId = await banco.criarUsuario('outro@aurora.test', 'Outro')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'operator'), ($1, $3, 'operator')`,
    [contaId, operadorId, outroId],
  )
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.dnc_entries')
})

async function lerAutoria(id: string) {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    created_by: string | null
    removed_by: string | null
  }>('select created_by, removed_by from public.dnc_entries where id = $1', [id])
  return rows[0]!
}

test('o operador que inclui fica como autor, ainda que mande o id de outra pessoa', async () => {
  await banco.comoUsuario(operadorId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.dnc_entries (account_id, phone_e164, reason, created_by)
     values ($1, '+5548999998888', 'pediu para não ser chamado', $2)
     returning id`,
    [contaId, outroId],
  )

  expect((await lerAutoria(rows[0]!.id)).created_by).toBe(operadorId)
})

test('sem sessão, o autor é o que veio no comando, e nulo continua nulo', async () => {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.dnc_entries (account_id, phone_e164, reason, source)
     values ($1, '+5548999998888', 'pediu durante a chamada', 'lead_request')
     returning id`,
    [contaId],
  )

  expect((await lerAutoria(rows[0]!.id)).created_by).toBeNull()
})

test('a remoção carimba quem removeu, e a tela manda só o instante e o motivo', async () => {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.dnc_entries (account_id, phone_e164, reason)
     values ($1, '+5548999998888', 'pediu para não ser chamado')
     returning id`,
    [contaId],
  )
  const id = rows[0]!.id

  await banco.comoUsuario(operadorId)
  const removidas = await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removal_reason = 'era o número da empresa', removed_by = $2
      where id = $1
      returning id`,
    [id, outroId],
  )
  expect(removidas.rows).toHaveLength(1)

  expect((await lerAutoria(id)).removed_by).toBe(operadorId)
})

test('quem incluiu não muda num update posterior', async () => {
  await banco.comoUsuario(operadorId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.dnc_entries (account_id, phone_e164, reason)
     values ($1, '+5548999998888', 'pediu para não ser chamado')
     returning id`,
    [contaId],
  )
  const id = rows[0]!.id

  await banco.comoUsuario(outroId)
  await banco.sql.query(
    `update public.dnc_entries set notes = 'ligou de novo', created_by = $2 where id = $1`,
    [id, outroId],
  )

  expect((await lerAutoria(id)).created_by).toBe(operadorId)
})

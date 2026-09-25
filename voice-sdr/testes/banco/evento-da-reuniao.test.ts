// O evento da reunião na linha de meetings: as colunas da nova tentativa, os
// checks delas, o índice que a rotina lê e a trilha que não as registra.
//
// A regra do recuo e do teto é de `_shared/agenda/evento-da-reuniao.ts` e se
// prova no teste dele; aqui fica o que é do banco.
//
// Referência: migração 20260930150000_evento_da_reuniao.sql, docs/PRD.md RF-508.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let especialistaId: string
let leadId: string

async function um(sql: string, parametros: unknown[] = []): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

function marcar(): Promise<string> {
  return um(
    `insert into public.meetings (account_id, lead_id, specialist_id, starts_at, ends_at, modality)
     values ($1, $2, $3, '2026-10-06T17:00:00Z', '2026-10-06T17:30:00Z', 'video') returning id`,
    [contaId, leadId, especialistaId],
  )
}

async function codigoDe(manobra: Promise<unknown>): Promise<string | undefined> {
  try {
    await manobra
  } catch (erro) {
    return (erro as { code?: string }).code
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

async function trilhaDe(reuniaoId: string): Promise<string[]> {
  const { rows } = await banco.sql.query<{ action: string }>(
    `select action from public.audit_log where target_id = $1`,
    [reuniaoId],
  )
  return rows.map((linha) => linha.action)
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaId = await um(`insert into public.accounts (name) values ('Transportes Aurora') returning id`)
  especialistaId = await um(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, 'Ana', 'ana@aurora.test', array['video']::text[]) returning id`,
    [contaId],
  )
  leadId = await um(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Marcos', '+5511990000011', 'teste') returning id`,
    [contaId],
  )
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.meetings')
})

test('reunião nasce sem evento, sem tentativa, sem erro e sem próxima tentativa', async () => {
  const id = await marcar()

  const { rows } = await banco.sql.query(
    `select external_event_id, event_attempts, event_error, event_retry_at from public.meetings where id = $1`,
    [id],
  )

  expect(rows).toEqual([{ external_event_id: null, event_attempts: 0, event_error: null, event_retry_at: null }])
})

test('os checks recusam tentativa negativa e erro em branco', async () => {
  const id = await marcar()

  expect(await codigoDe(banco.sql.query(`update public.meetings set event_attempts = -1 where id = $1`, [id]))).toBe(
    '23514',
  )
  expect(await codigoDe(banco.sql.query(`update public.meetings set event_error = '  ' where id = $1`, [id]))).toBe(
    '23514',
  )
})

test('o evento e as tentativas são marca do servidor: não entram na trilha, e o status entra', async () => {
  const id = await marcar()

  await banco.sql.query(
    `update public.meetings
        set event_attempts = 2, event_error = 'O calendário não respondeu.', event_retry_at = now()
      where id = $1`,
    [id],
  )
  await banco.sql.query(
    `update public.meetings
        set external_event_id = 'sarahabc', event_error = null, event_retry_at = null
      where id = $1`,
    [id],
  )
  expect(await trilhaDe(id)).toEqual([])

  await banco.sql.query(`update public.meetings set status = 'canceled', cancel_reason = 'lead pediu' where id = $1`, [
    id,
  ])
  expect(await trilhaDe(id)).toHaveLength(1)
})

test('o índice parcial das reuniões sem evento existe com o predicado da rotina', async () => {
  const { rows } = await banco.sql.query<{ indexdef: string }>(
    `select indexdef from pg_indexes where schemaname = 'public' and indexname = 'meetings_sem_evento'`,
  )

  expect(rows).toHaveLength(1)
  expect(rows[0]!.indexdef).toMatch(/external_event_id IS NULL/i)
  expect(rows[0]!.indexdef).toMatch(/scheduled/)
})

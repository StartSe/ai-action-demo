// A confirmação de presença em PGlite (US-195, RF-602, segundo critério de
// aceite da F6 pelo lado do banco).
//
// Prova que `confirmar_reuniao` confirma a reunião em jogo da chamada com
// status, `confirmed_at` e `confirmed_call_id`, que a segunda confirmação
// deixa o primeiro `confirmed_at` e nenhum segundo evento, que a reunião que
// já não está de pé não se confirma, que a conta vizinha não confirma reunião
// alheia nem pelo RPC, e que só `service_role` executa.
//
// Referência: migração 20261010150000_confirmacao_de_reuniao.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaA: string
let contaB: string
let dono: string
let sequencia = 0

const PRIMEIRA = '2026-10-05T17:40:00.000Z'
const SEGUNDA = '2026-10-05T17:41:00.000Z'

async function um(sql: string, parametros: unknown[] = []): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

interface Cenario {
  readonly lead: string
  readonly reuniao: string
  readonly chamada: string
}

async function cenario(conta: string, status = 'scheduled'): Promise<Cenario> {
  sequencia += 1
  const lead = await um(
    `insert into public.leads (account_id, name, phone_e164, source) values ($1, $2, $3, 'teste') returning id`,
    [conta, `Lead ${sequencia}`, `+55119600${String(sequencia).padStart(5, '0')}`],
  )
  const especialista = await um(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, $2, $3, array['video']::text[]) returning id`,
    [conta, `Ana ${sequencia}`, `ana${sequencia}@teste.test`],
  )
  const reuniao = await um(
    `insert into public.meetings (account_id, lead_id, specialist_id, starts_at, ends_at, modality, status)
     values ($1, $2, $3, now() + interval '20 minutes', now() + interval '50 minutes', 'video', $4) returning id`,
    [conta, lead, especialista, status],
  )
  const chamada = await um(
    `insert into public.calls (account_id, lead_id, purpose, direction, idempotency_key)
     values ($1, $2, 'reminder', 'outbound', $3) returning id`,
    [conta, lead, `rem:${reuniao}`],
  )
  await banco.sql.query(
    `insert into public.dial_queue (account_id, lead_id, purpose, source, source_ref, attempt, status, call_id)
     values ($1, $2, 'reminder', 'rem', $3, 1, 'done', $4)`,
    [conta, lead, reuniao, chamada],
  )
  return { lead, reuniao, chamada }
}

async function confirmar(conta: string, chamada: string, agora = PRIMEIRA): Promise<Record<string, unknown>> {
  const { rows } = await banco.sql.query<{ r: Record<string, unknown> }>(
    'select public.confirmar_reuniao($1, $2, $3) as r',
    [conta, chamada, agora],
  )
  return rows[0]!.r
}

async function estado(reuniao: string) {
  const { rows } = await banco.sql.query<{ status: string; confirmed_at: Date | null; confirmed_call_id: string | null }>(
    'select status, confirmed_at, confirmed_call_id from public.meetings where id = $1',
    [reuniao],
  )
  return rows[0]!
}

async function eventos(lead: string): Promise<Array<{ actor: string; payload: Record<string, unknown> }>> {
  const { rows } = await banco.sql.query<{ actor: string; payload: Record<string, unknown> }>(
    `select actor, payload from public.lead_events where lead_id = $1 and kind = 'automation'`,
    [lead],
  )
  return rows
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await um(`insert into public.accounts (name) values ('Confirma A') returning id`)
  contaB = await um(`insert into public.accounts (name) values ('Confirma B') returning id`)
  dono = await banco.criarUsuario('dono@confirma.test', 'Dono')
  await banco.sql.query(`insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')`, [
    contaA,
    dono,
  ])
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
})

describe('confirmar_reuniao', () => {
  test('confirma com status, confirmed_at e confirmed_call_id, e narra no lead', async () => {
    const c = await cenario(contaA)
    expect(await confirmar(contaA, c.chamada)).toMatchObject({ resultado: 'confirmada', meeting_id: c.reuniao })
    const depois = await estado(c.reuniao)
    expect(depois.status).toBe('confirmed')
    expect(depois.confirmed_at?.toISOString()).toBe(PRIMEIRA)
    expect(depois.confirmed_call_id).toBe(c.chamada)
    expect(await eventos(c.lead)).toEqual([
      { actor: 'agent', payload: { acao: 'reuniao_confirmada', meeting_id: c.reuniao, call_id: c.chamada } },
    ])
  })

  test('confirmar duas vezes deixa o primeiro confirmed_at e um evento só', async () => {
    const c = await cenario(contaA)
    await confirmar(contaA, c.chamada, PRIMEIRA)
    expect(await confirmar(contaA, c.chamada, SEGUNDA)).toMatchObject({ resultado: 'ja_confirmada' })
    expect((await estado(c.reuniao)).confirmed_at?.toISOString()).toBe(PRIMEIRA)
    expect(await eventos(c.lead)).toHaveLength(1)
  })

  test('reunião cancelada não se confirma', async () => {
    const c = await cenario(contaA, 'canceled')
    expect(await confirmar(contaA, c.chamada)).toMatchObject({ resultado: 'status_nao_elegivel', status: 'canceled' })
    expect(await estado(c.reuniao)).toMatchObject({ status: 'canceled', confirmed_at: null })
  })

  test('a conta vizinha não confirma reunião alheia nem pelo RPC', async () => {
    const c = await cenario(contaA)
    expect(await confirmar(contaB, c.chamada)).toEqual({ resultado: 'sem_reuniao' })
    expect(await estado(c.reuniao)).toMatchObject({ status: 'scheduled', confirmed_at: null })
    expect(await eventos(c.lead)).toEqual([])
  })

  test('chamada que não existe é sem_reuniao', async () => {
    const { rows } = await banco.sql.query<{ r: unknown }>(
      'select public.confirmar_reuniao($1, gen_random_uuid(), now()) as r',
      [contaA],
    )
    expect(rows[0]!.r).toEqual({ resultado: 'sem_reuniao' })
  })

  test('authenticated recebe permission denied', async () => {
    const c = await cenario(contaA)
    await banco.comoUsuario(dono)
    await expect(banco.sql.query('select public.confirmar_reuniao($1, $2, now())', [contaA, c.chamada])).rejects.toThrow(
      /permission denied/i,
    )
    await banco.comoServico()
    expect((await estado(c.reuniao)).status).toBe('scheduled')
  })
})

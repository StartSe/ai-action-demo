// A linha do tempo do lead no banco (US-147, RF-113, quarto critério da F4).
//
// O que este arquivo prova:
//
// 1. A ligação entra em `lead_events` como evento `call` que aponta a chamada,
//    quando ela termina (`ended` ou `failed`), com `occurred_at` no início.
// 2. Uma vez por chamada: o segundo update para `ended` não duplica.
// 3. Ensaio, chamada sem lead e chamada que não terminou ficam de fora.
// 4. A mudança de etapa guarda o rótulo de então: renomear a etapa não
//    reescreve o evento.
// 5. A nota manual entra pelo RPC com `actor = 'user'` e o autor da sessão.
//
// Referência: migração 20260930210000_ligacao_na_linha_do_tempo.sql.

import { afterAll, beforeAll, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let conta: string
let dono: string
let lead: string

interface Evento {
  kind: string
  actor: string
  actor_id: string | null
  call_id: string | null
  occurred_at: string
  payload: Record<string, unknown>
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    "insert into public.accounts (name) values ('Conta da linha do tempo') returning id",
  )
  conta = rows[0]!.id
  dono = await banco.criarUsuario('dono@linha.test', 'Dona da conta')
  await banco.sql.query(
    "insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')",
    [conta, dono],
  )
  const lida = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164)
     values ($1, 'Marina', '+5548999990000') returning id`,
    [conta],
  )
  lead = lida.rows[0]!.id
})

afterAll(async () => {
  await banco.encerrar()
})

async function eventosDaChamada(chamadaId: string): Promise<Evento[]> {
  const { rows } = await banco.sql.query<Evento>(
    'select kind, actor, actor_id, call_id, occurred_at, payload from public.lead_events where call_id = $1',
    [chamadaId],
  )
  return rows
}

async function chamada(opcoes: {
  status: string
  direcao?: string
  comLead?: boolean
  iniciada?: string
}): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, status, idempotency_key, started_at, duration_sec)
     values ($1, $2, 'discovery', $3, $4, $5, $6, 42)
     returning id`,
    [
      conta,
      opcoes.comLead === false ? null : lead,
      opcoes.direcao ?? 'outbound',
      opcoes.status,
      crypto.randomUUID(),
      opcoes.iniciada ?? '2026-09-10T14:00:00Z',
    ],
  )
  return rows[0]!.id
}

test('a chamada que termina vira um evento call que aponta a chamada, no instante do início', async () => {
  const id = await chamada({ status: 'ringing', iniciada: '2026-09-10T14:00:00Z' })
  expect(await eventosDaChamada(id)).toHaveLength(0)

  await banco.sql.query(
    "update public.calls set status = 'ended', end_reason = 'completed', ended_at = started_at + interval '42 seconds' where id = $1",
    [id],
  )
  const eventos = await eventosDaChamada(id)
  expect(eventos).toHaveLength(1)
  const [evento] = eventos
  expect(evento!.kind).toBe('call')
  expect(evento!.actor).toBe('agent')
  expect(new Date(evento!.occurred_at).toISOString()).toBe('2026-09-10T14:00:00.000Z')
  expect(evento!.payload).toMatchObject({
    direction: 'outbound',
    purpose: 'discovery',
    status: 'ended',
    end_reason: 'completed',
    duration_sec: 42,
  })
})

test('a chamada que falha também entra, e a inserida já terminada também', async () => {
  const falhou = await chamada({ status: 'queued' })
  await banco.sql.query("update public.calls set status = 'failed' where id = $1", [falhou])
  expect(await eventosDaChamada(falhou)).toHaveLength(1)

  const jaTerminada = await chamada({ status: 'ended' })
  expect(await eventosDaChamada(jaTerminada)).toHaveLength(1)
})

test('voltar a ended num segundo update não narra a ligação duas vezes', async () => {
  const id = await chamada({ status: 'ended' })
  await banco.sql.query("update public.calls set status = 'in_progress' where id = $1", [id])
  await banco.sql.query("update public.calls set status = 'ended' where id = $1", [id])
  await banco.sql.query("update public.calls set status = 'failed' where id = $1", [id])
  expect(await eventosDaChamada(id)).toHaveLength(1)
})

test('ensaio, chamada sem lead e chamada em curso ficam fora da linha do tempo', async () => {
  const ensaio = await chamada({ status: 'ended', direcao: 'rehearsal' })
  const semLead = await chamada({ status: 'ended', comLead: false })
  const emCurso = await chamada({ status: 'in_progress' })
  expect(await eventosDaChamada(ensaio)).toHaveLength(0)
  expect(await eventosDaChamada(semLead)).toHaveLength(0)
  expect(await eventosDaChamada(emCurso)).toHaveLength(0)
})

test('renomear a etapa não reescreve o rótulo gravado na mudança', async () => {
  await banco.comoUsuario(dono)
  try {
    await banco.sql.query(
      "select * from public.mover_lead_de_etapa($1, 'qualified', 'user', $2)",
      [lead, dono],
    )
  } finally {
    await banco.comoServico()
  }
  await banco.sql.query(
    "update public.pipeline_stages set label = 'Tem fit' where account_id = $1 and key = 'qualified'",
    [conta],
  )

  const { rows } = await banco.sql.query<Evento>(
    "select kind, actor, actor_id, call_id, occurred_at, payload from public.lead_events where lead_id = $1 and kind = 'stage_change'",
    [lead],
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]!.actor).toBe('user')
  expect(rows[0]!.actor_id).toBe(dono)
  expect(rows[0]!.payload).toMatchObject({ para: { key: 'qualified', label: 'Qualificado' } })
})

test('a nota manual entra pelo RPC com actor user e o autor da sessão', async () => {
  await banco.comoUsuario(dono)
  try {
    await banco.sql.query(
      "select public.registrar_evento_de_lead($1, 'note', 'agent', null, null, jsonb_build_object('texto', 'Pediu retorno na segunda.'))",
      [lead],
    )
    const { rows } = await banco.sql.query<Evento>(
      "select kind, actor, actor_id, call_id, occurred_at, payload from public.lead_events where lead_id = $1 and kind = 'note'",
      [lead],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.actor).toBe('user')
    expect(rows[0]!.actor_id).toBe(dono)
    expect(rows[0]!.payload).toEqual({ texto: 'Pediu retorno na segunda.' })
  } finally {
    await banco.comoServico()
  }
})

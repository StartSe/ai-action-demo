// O teto do resgate e o lead para perdido, em PGlite (US-198, RF-605).
//
// O que este arquivo prova:
//
// 1. **O teto corta na tentativa certa**: com teto 2, dois resgates e nenhum
//    terceiro, por mais que o relógio ande.
// 2. **Esgotado, o lead vai para `lost` com o motivo**, e o evento nasce uma vez
//    só; três execuções posteriores não enfileiram nem narram nada.
// 3. **Mover para perdido é idempotente**: lead já em `lost` não ganha segunda
//    mudança de etapa.
// 4. **Quem remarcou sai do caminho**: falta atestada, resgate, remarcação, e o
//    lead segue vivo, com a reunião nova sem contagem de resgate.
// 5. **Teto zero** não enfileira nem move, e **a conta vizinha** não é tocada.
//
// Referência: migração 20261010180000_teto_de_resgate.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaA: string
let contaB: string
let sequencia = 0

const AGORA = new Date(Date.now()).toISOString()
const RECUO = 60

function depois(minutos: number): string {
  return new Date(Date.parse(AGORA) + minutos * 60_000).toISOString()
}

async function um(sql: string, parametros: unknown[] = []): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

interface Falta {
  readonly lead: string
  readonly reuniao: string
}

async function falta(conta: string): Promise<Falta> {
  sequencia += 1
  const lead = await um(
    `insert into public.leads (account_id, name, phone_e164, source) values ($1, $2, $3, 'teste') returning id`,
    [conta, `Lead ${sequencia}`, `+55119300${String(sequencia).padStart(5, '0')}`],
  )
  const especialista = await um(
    `insert into public.specialists (account_id, name, email, modalities) values ($1, $2, $3, array['video']::text[]) returning id`,
    [conta, `Ana ${sequencia}`, `ana${sequencia}@teto.test`],
  )
  const reuniao = await um(
    `insert into public.meetings
       (account_id, lead_id, specialist_id, starts_at, ends_at, modality, status,
        attestation_status, attested_at, attested_source)
     values ($1, $2, $3, now() - interval '2 hours', now() - interval '90 minutes', 'video', 'no_show',
             'attested', now() - interval '1 hour', 'manual')
     returning id`,
    [conta, lead, especialista],
  )
  return { lead, reuniao }
}

async function passar(agora: string): Promise<Array<{ meeting_id: string; acao: string }>> {
  const { rows } = await banco.sql.query<{ meeting_id: string; acao: string }>(
    'select meeting_id, acao from public.enfileirar_resgates($1, 25)',
    [agora],
  )
  // Cada resgate enfileirado é discado e não resolve.
  await banco.sql.query(`update public.dial_queue set status = 'done' where status = 'queued'`)
  return rows
}

async function etapa(lead: string): Promise<string | null> {
  const { rows } = await banco.sql.query<{ key: string | null }>(
    `select s.key from public.leads l left join public.pipeline_stages s on s.id = l.stage_id where l.id = $1`,
    [lead],
  )
  return rows[0]!.key
}

async function eventos(lead: string): Promise<Array<{ kind: string; payload: Record<string, unknown> }>> {
  const { rows } = await banco.sql.query<{ kind: string; payload: Record<string, unknown> }>(
    `select kind, payload from public.lead_events where lead_id = $1 and kind in ('automation', 'stage_change') order by created_at, kind`,
    [lead],
  )
  return rows
}

async function politica(conta: string, teto: number): Promise<void> {
  await banco.sql.query(
    'update public.account_settings set rescue_max_attempts = $2, rescue_backoff_minutes = $3 where account_id = $1',
    [conta, teto, RECUO],
  )
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await um(`insert into public.accounts (name) values ('Teto A') returning id`)
  contaB = await um(`insert into public.accounts (name) values ('Teto B') returning id`)
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.dial_queue')
  await banco.sql.query('delete from public.meetings')
  await politica(contaA, 2)
  await politica(contaB, 2)
})

describe('o teto e o esgotamento', () => {
  test('dois resgates, o esgotamento depois do recuo da última, e três passagens depois sem nada', async () => {
    const f = await falta(contaA)
    expect(await passar(AGORA)).toEqual([{ meeting_id: f.reuniao, acao: 'enfileirado' }])
    expect(await passar(depois(RECUO))).toEqual([{ meeting_id: f.reuniao, acao: 'enfileirado' }])
    // O teto cortou: nenhuma terceira tentativa, e o recuo depois da última ainda não passou.
    expect(await passar(depois(2 * RECUO - 1))).toEqual([])
    expect(await etapa(f.lead)).not.toBe('lost')

    expect(await passar(depois(2 * RECUO))).toEqual([{ meeting_id: f.reuniao, acao: 'esgotado' }])
    expect(await etapa(f.lead)).toBe('lost')
    const narrados = await eventos(f.lead)
    expect(narrados.filter((e) => e.kind === 'automation')).toEqual([
      {
        kind: 'automation',
        payload: { acao: 'resgates_esgotados', motivo: 'resgate_esgotado', tentativas: 2, meeting_id: f.reuniao },
      },
    ])
    expect(narrados.filter((e) => e.kind === 'stage_change')).toHaveLength(1)
    expect(narrados.find((e) => e.kind === 'stage_change')?.payload).toMatchObject({
      para: { key: 'lost' },
      motivo: 'resgate_esgotado',
    })

    for (const minutos of [3 * RECUO, 10 * RECUO, 100 * RECUO]) expect(await passar(depois(minutos))).toEqual([])
    expect(await eventos(f.lead)).toHaveLength(narrados.length)
    const { rows } = await banco.sql.query<{ total: number }>('select count(*)::int as total from public.dial_queue')
    expect(rows[0]!.total).toBe(2)
  })

  test('lead que já está em lost não ganha segunda mudança de etapa', async () => {
    const f = await falta(contaA)
    await banco.sql.query(`select public.mover_lead_de_etapa($1, 'lost', 'system', null, 'à mão')`, [f.lead])
    await passar(AGORA)
    await passar(depois(RECUO))
    await passar(depois(2 * RECUO))
    const narrados = await eventos(f.lead)
    expect(narrados.filter((e) => e.kind === 'stage_change')).toHaveLength(1)
    expect(narrados.filter((e) => e.kind === 'automation')).toHaveLength(1)
  })

  test('falta atestada, resgate, remarcação: o lead segue vivo', async () => {
    const f = await falta(contaA)
    await passar(AGORA)
    const nova = await um(
      `insert into public.meetings (account_id, lead_id, specialist_id, starts_at, ends_at, modality, rescheduled_from_id)
       select account_id, lead_id, specialist_id, now() + interval '2 days', now() + interval '2 days 30 minutes', 'video', id
         from public.meetings where id = $1
       returning id`,
      [f.reuniao],
    )
    for (const minutos of [RECUO, 2 * RECUO, 10 * RECUO]) expect(await passar(depois(minutos))).toEqual([])
    expect(await etapa(f.lead)).not.toBe('lost')
    const { rows } = await banco.sql.query<{ status: string; rescue_count: number }>(
      'select status, rescue_count from public.meetings where id = $1',
      [nova],
    )
    expect(rows[0]).toEqual({ status: 'scheduled', rescue_count: 0 })
  })

  test('teto zero não enfileira nem move ninguém', async () => {
    await politica(contaA, 0)
    const f = await falta(contaA)
    for (const minutos of [0, RECUO, 100 * RECUO]) expect(await passar(depois(minutos))).toEqual([])
    expect(await etapa(f.lead)).not.toBe('lost')
    expect(await eventos(f.lead)).toEqual([])
  })

  test('a conta vizinha não é tocada', async () => {
    await politica(contaB, 0)
    const deA = await falta(contaA)
    const deB = await falta(contaB)
    for (const minutos of [0, RECUO, 2 * RECUO]) await passar(depois(minutos))
    expect(await etapa(deA.lead)).toBe('lost')
    expect(await etapa(deB.lead)).not.toBe('lost')
    expect(await eventos(deB.lead)).toEqual([])
    const { rows } = await banco.sql.query<{ total: number }>(
      'select count(*)::int as total from public.dial_queue where account_id = $1',
      [contaB],
    )
    expect(rows[0]!.total).toBe(0)
  })
})

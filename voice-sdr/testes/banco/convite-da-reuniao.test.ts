// O convite da reunião na linha de meetings: as colunas de entrega por
// destinatário, os checks delas, a reivindicação da rotina, a trilha que não
// as registra e o grant só para o servidor.
//
// A regra do recuo, do teto e da marca só depois do 2xx é de
// `_shared/agenda/convite-de-reuniao.ts` e se prova no teste dele; aqui fica o
// que é do banco.
//
// Referência: migração 20260930160000_convite_da_reuniao.sql, docs/PRD.md
// RF-509, docs/revisao-tecnica.md R-05.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  TETO_DE_TENTATIVAS,
  colunasDoConvite,
} from '../../supabase/functions/_shared/agenda/convite-de-reuniao.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const INSTANTE = '2026-10-05T12:00:00Z'

let banco: BancoDeTeste
let contaId: string
let especialistaId: string

async function um(sql: string, parametros: unknown[] = []): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

let sequencia = 0

/**
 * Uma reunião com lead próprio (um lead tem no máximo uma ativa), num horário
 * próprio, nascida dez minutos antes do instante da passagem.
 */
async function marcar(extras: { criadaHa?: string; inicio?: string; status?: string } = {}): Promise<string> {
  sequencia += 1
  const leadId = await um(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, $2, $3, 'teste') returning id`,
    [contaId, `Lead ${sequencia}`, `+55119900${String(sequencia).padStart(5, '0')}`],
  )
  const inicio = extras.inicio ?? new Date(Date.parse('2026-10-06T12:00:00Z') + sequencia * 3_600_000).toISOString()
  return um(
    `insert into public.meetings
       (account_id, lead_id, specialist_id, starts_at, ends_at, modality, status, created_at)
     values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '30 minutes', 'video', $5,
             $6::timestamptz - $7::interval)
     returning id`,
    [contaId, leadId, especialistaId, inicio, extras.status ?? 'scheduled', INSTANTE, extras.criadaHa ?? '10 minutes'],
  )
}

async function reivindicar(instante = INSTANTE, limite = 25): Promise<string[]> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `select id from public.reivindicar_convites_para_enviar($1, $2::timestamptz, $3) as id`,
    [limite, instante, TETO_DE_TENTATIVAS],
  )
  return rows.map((linha) => linha.id)
}

async function codigoDe(manobra: Promise<unknown>): Promise<string | undefined> {
  try {
    await manobra
  } catch (erro) {
    return (erro as { code?: string }).code
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaId = await um(`insert into public.accounts (name) values ('Transportes Aurora') returning id`)
  especialistaId = await um(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, 'Ana', 'ana@aurora.test', array['video']::text[]) returning id`,
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

test('as colunas que os dois index.ts escrevem existem, dos dois lados', async () => {
  const { rows } = await banco.sql.query<{ attname: string }>(
    `select attname from pg_attribute
      where attrelid = 'public.meetings'::regclass and attnum > 0 and not attisdropped`,
  )
  const colunas = new Set(rows.map((linha) => linha.attname))
  for (const lado of ['lead', 'especialista'] as const) {
    for (const coluna of Object.values(colunasDoConvite(lado))) {
      expect(colunas.has(coluna), coluna).toBe(true)
    }
  }
  expect(colunas.has('invite_claimed_at')).toBe(true)
})

test('reunião nasce com os dois convites por sair, sem tentativa, sem erro e sem próxima', async () => {
  const id = await marcar()

  const { rows } = await banco.sql.query(
    `select lead_invite_sent_at, lead_invite_attempts, lead_invite_error, lead_invite_retry_at,
            specialist_invite_sent_at, specialist_invite_attempts, specialist_invite_error, specialist_invite_retry_at,
            invite_claimed_at
       from public.meetings where id = $1`,
    [id],
  )

  expect(rows).toEqual([
    {
      lead_invite_sent_at: null,
      lead_invite_attempts: 0,
      lead_invite_error: null,
      lead_invite_retry_at: null,
      specialist_invite_sent_at: null,
      specialist_invite_attempts: 0,
      specialist_invite_error: null,
      specialist_invite_retry_at: null,
      invite_claimed_at: null,
    },
  ])
})

test.each(['lead', 'specialist'])('os checks recusam tentativa negativa e erro em branco do lado %s', async (lado) => {
  const id = await marcar()

  expect(
    await codigoDe(banco.sql.query(`update public.meetings set ${lado}_invite_attempts = -1 where id = $1`, [id])),
  ).toBe('23514')
  expect(
    await codigoDe(banco.sql.query(`update public.meetings set ${lado}_invite_error = '  ' where id = $1`, [id])),
  ).toBe('23514')
})

test('o convite e as tentativas são marca do servidor: não entram na trilha', async () => {
  const id = await marcar()

  await banco.sql.query(
    `update public.meetings
        set lead_invite_attempts = 2, lead_invite_error = 'O provedor de e-mail está fora do ar.',
            lead_invite_retry_at = now(), specialist_invite_sent_at = now(), invite_claimed_at = now()
      where id = $1`,
    [id],
  )
  const { rows } = await banco.sql.query(`select 1 from public.audit_log where target_id = $1`, [id])
  expect(rows).toEqual([])
})

test('a reivindicação toma a reunião com convite por sair e grava invite_claimed_at', async () => {
  const id = await marcar()

  expect(await reivindicar()).toEqual([id])
  const { rows } = await banco.sql.query<{ tomada: string }>(
    `select invite_claimed_at::text as tomada from public.meetings where id = $1`,
    [id],
  )
  expect(Date.parse(rows[0]!.tomada)).toBe(Date.parse(INSTANTE))
})

test('a reunião tomada fica fora por quatro minutos, e volta depois deles', async () => {
  const id = await marcar()
  await reivindicar()

  expect(await reivindicar('2026-10-05T12:03:59Z')).toEqual([])
  expect(await reivindicar('2026-10-05T12:04:00Z')).toEqual([id])
})

test('reunião nascida há menos de dois minutos é da ferramenta, e não da rotina', async () => {
  await marcar({ criadaHa: '1 minute' })
  const velha = await marcar({ criadaHa: '2 minutes' })

  expect(await reivindicar()).toEqual([velha])
})

test('não toma reunião cancelada, reunião que já começou, nem reunião com os dois convites resolvidos', async () => {
  await marcar({ status: 'canceled' })
  await marcar({ inicio: '2026-10-05T11:30:00Z' })
  const enviada = await marcar()
  await banco.sql.query(
    `update public.meetings set lead_invite_sent_at = now(), specialist_invite_sent_at = now() where id = $1`,
    [enviada],
  )
  const noTeto = await marcar()
  await banco.sql.query(
    `update public.meetings set lead_invite_attempts = $2, specialist_invite_attempts = $2 where id = $1`,
    [noTeto, TETO_DE_TENTATIVAS],
  )

  expect(await reivindicar()).toEqual([])
})

test('toma quando um lado só está pendente, e respeita a próxima tentativa', async () => {
  const soLead = await marcar()
  await banco.sql.query(`update public.meetings set specialist_invite_sent_at = now() where id = $1`, [soLead])
  const esperando = await marcar()
  await banco.sql.query(
    `update public.meetings
        set specialist_invite_sent_at = now(), lead_invite_attempts = 1,
            lead_invite_error = 'fora do ar', lead_invite_retry_at = $2::timestamptz + interval '5 minutes'
      where id = $1`,
    [esperando, INSTANTE],
  )

  expect(await reivindicar()).toEqual([soLead])
  // Às 12h04min30s a primeira saiu da folga, e a outra ainda espera a próxima tentativa.
  expect(await reivindicar('2026-10-05T12:04:30Z')).toEqual([soLead])
  expect(await reivindicar('2026-10-05T12:05:00Z')).toEqual([esperando])
})

test('o limite pedido vale, e nunca passa de 25', async () => {
  for (let i = 0; i < 27; i++) await marcar()

  expect(await reivindicar(INSTANTE, 3)).toHaveLength(3)
  expect(await reivindicar(INSTANTE, 100)).toHaveLength(24)
  expect(await reivindicar(INSTANTE, 100)).toHaveLength(0)
})

test('só service_role executa a reivindicação', async () => {
  await banco.sql.query('set role service_role')
  try {
    await reivindicar()
  } finally {
    await banco.comoServico()
  }

  for (const papel of ['authenticated', 'anon']) {
    await banco.sql.query(`set role ${papel}`)
    try {
      expect(await codigoDe(reivindicar()), papel).toBe('42501')
    } finally {
      await banco.comoServico()
    }
  }
})

test('o índice parcial dos convites pendentes existe com o predicado da rotina', async () => {
  const { rows } = await banco.sql.query<{ indexdef: string }>(
    `select indexdef from pg_indexes where schemaname = 'public' and indexname = 'meetings_convite_pendente'`,
  )

  expect(rows).toHaveLength(1)
  expect(rows[0]!.indexdef).toMatch(/lead_invite_sent_at IS NULL/i)
  expect(rows[0]!.indexdef).toMatch(/specialist_invite_sent_at IS NULL/i)
  expect(rows[0]!.indexdef).toMatch(/scheduled/)
})

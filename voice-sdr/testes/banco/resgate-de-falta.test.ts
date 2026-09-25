// O resgate só em falta atestada, em PGlite (US-197, RF-604, T-17).
//
// O que este arquivo prova, com duas contas:
//
// 1. **Reunião com apuração pendente NUNCA gera resgate**, mesmo com o horário
//    passado há horas: é o caso central de T-17, e o nome do teste o diz.
// 2. Atestada como falta gera; atestada como compareceu, cancelada e remarcada
//    não geram.
// 3. Duas execuções seguidas com o mesmo relógio deixam um item só por reunião.
// 4. O recuo entre resgates vem da conta, e o relógio avançado prova a virada.
// 5. O teto de 25 corta, cada conta recebe o próprio resgate e só service_role
//    executa.
//
// Referência: migração 20261010170000_resgate_de_falta.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaA: string
let contaB: string
let dono: string
let sequencia = 0

const AGORA = new Date(Date.now()).toISOString()
const MINUTO = 60_000

function depois(minutos: number): string {
  return new Date(Date.parse(AGORA) + minutos * MINUTO).toISOString()
}

async function um(sql: string, parametros: unknown[] = []): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

interface Falta {
  readonly lead: string
  readonly reuniao: string
}

/** Uma reunião de duas horas atrás, com o desfecho e a apuração dados. */
async function reuniao(
  conta: string,
  status = 'no_show',
  apuracao: 'attested' | 'pending' = 'attested',
): Promise<Falta> {
  sequencia += 1
  const lead = await um(
    `insert into public.leads (account_id, name, phone_e164, source) values ($1, $2, $3, 'teste') returning id`,
    [conta, `Lead ${sequencia}`, `+55119400${String(sequencia).padStart(5, '0')}`],
  )
  const especialista = await um(
    `insert into public.specialists (account_id, name, email, modalities) values ($1, $2, $3, array['video']::text[]) returning id`,
    [conta, `Ana ${sequencia}`, `ana${sequencia}@resgate.test`],
  )
  const atestada = apuracao === 'attested'
  const id = await um(
    `insert into public.meetings
       (account_id, lead_id, specialist_id, starts_at, ends_at, modality, status,
        attestation_status, attested_at, attested_source)
     values ($1, $2, $3, now() - interval '2 hours', now() - interval '90 minutes', 'video', $4,
             $5, case when $6 then now() - interval '1 hour' end, case when $6 then 'manual' end)
     returning id`,
    [conta, lead, especialista, status, apuracao, atestada],
  )
  return { lead, reuniao: id }
}

async function enfileirar(agora = AGORA, limite = 25): Promise<Array<{ meeting_id: string; account_id: string; acao: string }>> {
  const { rows } = await banco.sql.query<{ meeting_id: string; account_id: string; acao: string }>(
    'select * from public.enfileirar_resgates($1, $2)',
    [agora, limite],
  )
  return rows
}

async function itens(): Promise<Array<{ account_id: string; source: string; source_ref: string; attempt: number; purpose: string }>> {
  const { rows } = await banco.sql.query<{ account_id: string; source: string; source_ref: string; attempt: number; purpose: string }>(
    'select account_id, source, source_ref, attempt, purpose from public.dial_queue order by source_ref',
  )
  return rows
}

async function politica(conta: string, teto: number, recuo: number): Promise<void> {
  await banco.sql.query(
    'update public.account_settings set rescue_max_attempts = $2, rescue_backoff_minutes = $3 where account_id = $1',
    [conta, teto, recuo],
  )
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await um(`insert into public.accounts (name) values ('Resgate A') returning id`)
  contaB = await um(`insert into public.accounts (name) values ('Resgate B') returning id`)
  dono = await banco.criarUsuario('dono@resgate.test', 'Dono')
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
  await banco.sql.query('delete from public.dial_queue')
  await banco.sql.query('delete from public.meetings')
  await politica(contaA, 2, 1440)
  await politica(contaB, 2, 1440)
})

describe('a porta de entrada é a falta atestada', () => {
  test('T-17: reunião com apuração pendente nunca gera resgate, mesmo com o horário passado há horas', async () => {
    await reuniao(contaA, 'no_show', 'pending')
    await reuniao(contaA, 'scheduled', 'pending')
    expect(await enfileirar()).toEqual([])
    expect(await enfileirar(depois(24 * 60))).toEqual([])
    expect(await itens()).toEqual([])
  })

  test('atestada como falta gera um resgate no formato de T-07', async () => {
    const f = await reuniao(contaA)
    expect(await enfileirar()).toEqual([{ meeting_id: f.reuniao, account_id: contaA, acao: 'enfileirado' }])
    expect(await itens()).toEqual([
      { account_id: contaA, source: 'rescue', source_ref: `${f.reuniao}:1`, attempt: 1, purpose: 'rescue' },
    ])
    const { rows } = await banco.sql.query<{ rescue_count: number; detected_no_show_at: Date }>(
      'select rescue_count, detected_no_show_at from public.meetings where id = $1',
      [f.reuniao],
    )
    expect(rows[0]!.rescue_count).toBe(1)
    expect(rows[0]!.detected_no_show_at.toISOString()).toBe(AGORA)
  })

  test('atestada como compareceu e cancelada não geram', async () => {
    await reuniao(contaA, 'attended')
    await reuniao(contaA, 'canceled')
    expect(await enfileirar()).toEqual([])
  })

  test('falta que já foi remarcada, ou lead com outra reunião ativa, não gera', async () => {
    const remarcada = await reuniao(contaA)
    await banco.sql.query(
      `insert into public.meetings (account_id, lead_id, specialist_id, starts_at, ends_at, modality, rescheduled_from_id)
       select account_id, lead_id, specialist_id, now() + interval '2 days', now() + interval '2 days 30 minutes', 'video', id
         from public.meetings where id = $1`,
      [remarcada.reuniao],
    )
    expect(await enfileirar()).toEqual([])
  })
})

describe('a idempotência e o recuo', () => {
  test('duas execuções seguidas com o mesmo relógio deixam um item só', async () => {
    await reuniao(contaA)
    expect(await enfileirar()).toHaveLength(1)
    expect(await enfileirar()).toHaveLength(0)
    expect(await itens()).toHaveLength(1)
  })

  test('o segundo resgate espera o recuo da conta, e o relógio avançado mostra a virada', async () => {
    const f = await reuniao(contaA)
    await enfileirar()
    // O primeiro resgate foi discado e não resolveu.
    await banco.sql.query(`update public.dial_queue set status = 'done'`)
    expect(await enfileirar(depois(1439))).toEqual([])
    expect(await enfileirar(depois(1440))).toEqual([{ meeting_id: f.reuniao, account_id: contaA, acao: 'enfileirado' }])
    expect((await itens()).map((i) => i.source_ref)).toEqual([`${f.reuniao}:1`, `${f.reuniao}:2`])
  })

  test('o resgate anterior ainda na fila segura o seguinte', async () => {
    await reuniao(contaA)
    await enfileirar()
    expect(await enfileirar(depois(2 * 1440))).toEqual([])
  })

  test('teto zero desliga o resgate', async () => {
    await politica(contaA, 0, 1440)
    await reuniao(contaA)
    expect(await enfileirar()).toEqual([])
  })
})

describe('o recorte da passagem', () => {
  test('o teto de 25 corta, e o resto entra na passagem seguinte', async () => {
    for (let i = 0; i < 27; i += 1) await reuniao(contaA)
    expect(await enfileirar()).toHaveLength(25)
    expect(await enfileirar()).toHaveLength(2)
    expect(await itens()).toHaveLength(27)
  })

  test('cada conta recebe o próprio resgate', async () => {
    const deA = await reuniao(contaA)
    const deB = await reuniao(contaB)
    const porReuniao = new Map((await enfileirar()).map((linha) => [linha.meeting_id, linha.account_id]))
    expect(porReuniao.get(deA.reuniao)).toBe(contaA)
    expect(porReuniao.get(deB.reuniao)).toBe(contaB)
    const porItem = new Map((await itens()).map((item) => [item.source_ref, item.account_id]))
    expect(porItem.get(`${deA.reuniao}:1`)).toBe(contaA)
    expect(porItem.get(`${deB.reuniao}:1`)).toBe(contaB)
  })

  test('limite fora de 1 a 25 é recusado', async () => {
    await expect(enfileirar(AGORA, 26)).rejects.toMatchObject({ code: '22023' })
  })

  test('authenticated recebe permission denied', async () => {
    await banco.comoUsuario(dono)
    await expect(banco.sql.query('select * from public.enfileirar_resgates(now(), 25)')).rejects.toThrow(/permission denied/i)
    await banco.comoServico()
  })
})

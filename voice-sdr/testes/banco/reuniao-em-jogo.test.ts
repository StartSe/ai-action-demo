// A reunião em jogo numa chamada de lembrete ou de resgate (US-194 a US-196).
//
// Prova em PGlite que `public.reuniao_em_jogo` resolve pela fila primeiro
// (`rem:{reunião}` e `rescue:{reunião}:{n}`), cai na reunião ativa do lead
// quando a chamada não saiu da fila, nunca devolve reunião de outra conta,
// traz o fuso do lead (o dele, senão o da conta) e só `service_role` executa.
//
// Referência: migração 20261010140000_reuniao_em_jogo.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { lerReuniaoEmJogo } from '../../supabase/functions/_shared/agente/reuniao-em-jogo.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaA: string
let contaB: string
let dono: string
let sequencia = 0

async function um(sql: string, parametros: unknown[] = []): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

async function lead(conta: string, fuso: string | null = null): Promise<string> {
  sequencia += 1
  return um(
    `insert into public.leads (account_id, name, phone_e164, source, timezone)
     values ($1, $2, $3, 'teste', $4) returning id`,
    [conta, `Lead ${sequencia}`, `+55119700${String(sequencia).padStart(5, '0')}`, fuso],
  )
}

async function reuniao(conta: string, leadId: string, status = 'scheduled'): Promise<string> {
  sequencia += 1
  const especialista = await um(
    `insert into public.specialists (account_id, name, email, modalities, timezone)
     values ($1, $2, $3, array['video']::text[], 'America/Sao_Paulo') returning id`,
    [conta, `Ana ${sequencia}`, `ana${sequencia}@teste.test`],
  )
  return um(
    `insert into public.meetings (account_id, lead_id, specialist_id, starts_at, ends_at, modality, status)
     values ($1, $2, $3, now() + interval '1 day' + $4 * interval '1 hour',
             now() + interval '1 day' + $4 * interval '1 hour' + interval '30 minutes', 'video', $5)
     returning id`,
    [conta, leadId, especialista, sequencia, status],
  )
}

async function chamada(conta: string, leadId: string | null, proposito = 'reminder'): Promise<string> {
  sequencia += 1
  return um(
    `insert into public.calls (account_id, lead_id, purpose, direction, idempotency_key)
     values ($1, $2, $3, 'outbound', $4) returning id`,
    [conta, leadId, proposito, `teste:${sequencia}`],
  )
}

async function naFila(conta: string, leadId: string, chamadaId: string, fonte: string, ref: string): Promise<void> {
  await banco.sql.query(
    `insert into public.dial_queue (account_id, lead_id, purpose, source, source_ref, attempt, status, call_id)
     values ($1, $2, 'reminder', $3, $4, 1, 'done', $5)`,
    [conta, leadId, fonte, ref, chamadaId],
  )
}

async function emJogo(chamadaId: string) {
  const { rows } = await banco.sql.query<Record<string, unknown>>('select * from public.reuniao_em_jogo($1)', [chamadaId])
  return rows
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await um(`insert into public.accounts (name) values ('Em Jogo A') returning id`)
  contaB = await um(`insert into public.accounts (name, timezone) values ('Em Jogo B', 'America/Manaus') returning id`)
  dono = await banco.criarUsuario('dono@emjogo.test', 'Dono')
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

describe('reuniao_em_jogo', () => {
  test('a chamada que saiu de um item rem devolve a reunião do item, lida pelo leitor da borda', async () => {
    const l = await lead(contaA, 'America/Manaus')
    const r = await reuniao(contaA, l)
    const c = await chamada(contaA, l)
    await naFila(contaA, l, c, 'rem', r)
    const linhas = await emJogo(c)
    expect(linhas).toHaveLength(1)
    const lida = lerReuniaoEmJogo(linhas[0])
    expect(lida).toMatchObject({
      id: r,
      contaId: contaA,
      leadId: l,
      status: 'scheduled',
      modalidade: 'video',
      nomeDoEspecialista: expect.stringMatching(/^Ana \d+$/),
      fusoDoLead: 'America/Manaus',
      fusoDoEspecialista: 'America/Sao_Paulo',
    })
  })

  test('o item rescue com ordinal também resolve, mesmo com a reunião já fora do ativo', async () => {
    const l = await lead(contaA)
    const r = await reuniao(contaA, l, 'no_show')
    const c = await chamada(contaA, l, 'rescue')
    await naFila(contaA, l, c, 'rescue', `${r}:2`)
    expect((await emJogo(c)).map((linha) => linha.meeting_id)).toEqual([r])
  })

  test('sem item na fila, vale a reunião ativa do lead, com o fuso da conta quando o lead não tem', async () => {
    const l = await lead(contaB)
    const r = await reuniao(contaB, l)
    const c = await chamada(contaB, l)
    const [linha] = await emJogo(c)
    expect(linha).toMatchObject({ meeting_id: r, lead_timezone: 'America/Manaus' })
  })

  test('sem fila e sem reunião ativa, nada', async () => {
    const l = await lead(contaA)
    await reuniao(contaA, l, 'canceled')
    expect(await emJogo(await chamada(contaA, l))).toEqual([])
    expect(await emJogo(await chamada(contaA, null))).toEqual([])
  })

  test('item da fila que aponta reunião de outra conta não devolve nada', async () => {
    const deB = await lead(contaB)
    const reuniaoDeB = await reuniao(contaB, deB)
    const deA = await lead(contaA)
    const c = await chamada(contaA, deA)
    await naFila(contaA, deA, c, 'rem', reuniaoDeB)
    expect(await emJogo(c)).toEqual([])
  })

  test('authenticated recebe permission denied', async () => {
    await banco.comoUsuario(dono)
    await expect(banco.sql.query('select * from public.reuniao_em_jogo(gen_random_uuid())')).rejects.toThrow(
      /permission denied/i,
    )
    await banco.comoServico()
  })
})

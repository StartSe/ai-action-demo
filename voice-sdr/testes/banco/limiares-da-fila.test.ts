// Os limiares da fila em account_settings (US-126, RF-915). O que se prova:
//
// 1. Os quatro padrões: -0,5, 3, 1 e crédito nulo (sem gatilho, e não zero).
// 2. Os checks recusam o que está fora do domínio.
// 3. Classe Configuração: o operador não escreve, o admin escreve, e a conta
//    vizinha recebe zero linha.
// 4. A mudança de limiar entra na trilha com o autor certo.
//
// Referência: migração 20260929100000_limiares_da_fila.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const CHECK_VIOLADO = '23514'

interface Conta {
  readonly id: string
  readonly adminId: string
  readonly operadorId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'admin'), ($1, $3, 'operator')`,
    [id, adminId, operadorId],
  )
  return { id, adminId, operadorId }
}

async function limiares(conta: Conta): Promise<Record<string, unknown> | undefined> {
  const { rows } = await banco.sql.query<Record<string, unknown>>(
    `select sentiment_floor::float8 as sentiment_floor, consecutive_failures_cap,
            failed_criteria_cap, credit_alert_cents
       from public.account_settings where account_id = $1`,
    [conta.id],
  )
  return rows[0]
}

async function codigoDoErro(manobra: Promise<unknown>): Promise<string | undefined> {
  try {
    await manobra
  } catch (erro) {
    return (erro as { code?: string }).code
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.account_settings
        set sentiment_floor = default, consecutive_failures_cap = default,
            failed_criteria_cap = default, credit_alert_cents = default`,
  )
})

test('os quatro limiares nascem com os padrões de RF-915', async () => {
  expect(await limiares(contaA)).toEqual({
    sentiment_floor: -0.5,
    consecutive_failures_cap: 3,
    failed_criteria_cap: 1,
    credit_alert_cents: null,
  })
})

test.each([
  ['sentiment_floor', -1.01],
  ['sentiment_floor', 1.5],
  ['consecutive_failures_cap', 0],
  ['failed_criteria_cap', 0],
  ['credit_alert_cents', 0],
  ['credit_alert_cents', -100],
])('%s = %s é recusado pelo check', async (coluna, valor) => {
  const codigo = await codigoDoErro(
    banco.sql.query(
      `update public.account_settings set ${coluna} = $2 where account_id = $1`,
      [contaA.id, valor],
    ),
  )
  expect(codigo).toBe(CHECK_VIOLADO)
})

test('os extremos do domínio são aceitos', async () => {
  await banco.sql.query(
    `update public.account_settings
        set sentiment_floor = -1, consecutive_failures_cap = 1, failed_criteria_cap = 1,
            credit_alert_cents = 1
      where account_id = $1`,
    [contaA.id],
  )
  expect((await limiares(contaA))?.sentiment_floor).toBe(-1)
})

test('o operador não altera limiar', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query(
    `update public.account_settings set sentiment_floor = -0.8 where account_id = $1 returning 1`,
    [contaA.id],
  )
  expect(rows).toHaveLength(0)
  await banco.comoServico()
  expect((await limiares(contaA))?.sentiment_floor).toBe(-0.5)
})

test('o administrador altera, e a mudança entra na trilha com o autor', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query(
    `update public.account_settings set sentiment_floor = -0.8 where account_id = $1 returning 1`,
    [contaA.id],
  )
  expect(rows).toHaveLength(1)

  await banco.comoServico()
  const { rows: trilha } = await banco.sql.query<{
    actor_id: string
    payload: { campos: string[]; antes: Record<string, unknown>; depois: Record<string, unknown> }
  }>(
    `select actor_id, payload from public.audit_log
      where account_id = $1 and target_type = 'account_settings'
      order by created_at desc limit 1`,
    [contaA.id],
  )
  expect(trilha[0]?.actor_id).toBe(contaA.adminId)
  expect(trilha[0]?.payload.campos).toEqual(['sentiment_floor'])
  expect(Number(trilha[0]?.payload.antes.sentiment_floor)).toBe(-0.5)
  expect(Number(trilha[0]?.payload.depois.sentiment_floor)).toBe(-0.8)
})

test('o administrador da conta A não alcança os limiares da conta B', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query(
    `update public.account_settings set failed_criteria_cap = 5 where account_id = $1 returning 1`,
    [contaB.id],
  )
  expect(rows).toHaveLength(0)

  const { rows: lidas } = await banco.sql.query(
    `select 1 from public.account_settings where account_id = $1`,
    [contaB.id],
  )
  expect(lidas).toHaveLength(0)

  await banco.comoServico()
  expect((await limiares(contaB))?.failed_criteria_cap).toBe(1)
})

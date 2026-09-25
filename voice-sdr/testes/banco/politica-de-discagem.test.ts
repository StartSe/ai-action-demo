// O caminho de escrita da tela `/config/discagem`: `definir_politica_de_discagem`.
// O que se prova aqui:
//
// 1. Quem administra grava, e a trilha leva o autor da sessão **e** o motivo
//    escrito (RF-008). É a razão de o RPC existir: o motivo só chega ao gatilho
//    de auditoria por parâmetro de sessão, e o cliente não tem como levantá-lo.
// 2. Motivo em branco, chave fora da política e valor fora do check são
//    recusados, e nada muda.
// 3. Chave ausente é "não mexi"; o teto de gasto aceita nulo, que é "sem teto".
// 4. Operador é recusado, e admin da conta A é recusado na conta B —
//    `security definer` desliga a RLS, e o `has_role` do corpo é a única
//    barreira.
// 5. O motivo não vaza para a escrita seguinte da mesma sessão.
//
// Referência: migração 20260923100000_politica_de_discagem.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** SQLSTATE de violação de check. */
const CHECK_VIOLADO = '23514'
/** SQLSTATE de quem não administra: insufficient_privilege. */
const SEM_PRIVILEGIO = '42501'
/** SQLSTATE de argumento fora do domínio: invalid_parameter_value. */
const PARAMETRO_INVALIDO = '22023'

interface Conta {
  readonly id: string
  readonly adminId: string
  readonly operadorId: string
}

interface Politica {
  dialing_window: Record<string, { start: string; end: string }>
  min_interval_minutes: number
  daily_attempts_per_number: number
  daily_calls_cap: number
  daily_spend_cap_cents: number | null
  max_duration_seconds: number
  max_concurrent: number
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

async function erroDe(manobra: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await manobra
  } catch (erro) {
    const bruto = erro as { code?: string; message?: string }
    return { code: bruto.code, message: String(bruto.message) }
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

function definir(contaId: string, politica: unknown, motivo: string | null) {
  return banco.sql.query<{ definir_politica_de_discagem: Politica }>(
    'select public.definir_politica_de_discagem($1, $2::jsonb, $3)',
    [contaId, JSON.stringify(politica), motivo],
  )
}

async function lerPolitica(contaId: string): Promise<Politica> {
  const { rows } = await banco.sql.query<Politica>(
    `select dialing_window, min_interval_minutes, daily_attempts_per_number,
            daily_calls_cap, daily_spend_cap_cents, max_duration_seconds, max_concurrent
       from public.account_settings where account_id = $1`,
    [contaId],
  )
  return rows[0]!
}

async function trilha(contaId: string) {
  const { rows } = await banco.sql.query<{
    actor: string
    actor_id: string | null
    reason: string | null
    payload: { campos: string[]; antes: Record<string, unknown>; depois: Record<string, unknown> }
  }>(
    `select actor, actor_id, reason, payload from public.audit_log
      where account_id = $1 and target_type = 'account_settings'
      order by created_at`,
    [contaId],
  )
  return rows
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
  // `set coluna = default` restaura o padrão declarado sem recopiar o valor.
  await banco.sql.query(
    `update public.account_settings
        set dialing_window = default, min_interval_minutes = default,
            daily_attempts_per_number = default, daily_calls_cap = default,
            daily_spend_cap_cents = default, max_duration_seconds = default,
            max_concurrent = default`,
  )
  await banco.sql.query(`delete from public.audit_log where target_type = 'account_settings'`)
})

test('o admin grava, e a trilha leva o autor e o motivo', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await definir(
    contaA.id,
    { daily_calls_cap: 500, max_concurrent: 4 },
    'campanha de fim de mês',
  )
  expect(rows[0]?.definir_politica_de_discagem.daily_calls_cap).toBe(500)
  expect(rows[0]?.definir_politica_de_discagem.max_concurrent).toBe(4)

  await banco.comoServico()
  const linhas = await trilha(contaA.id)
  expect(linhas).toHaveLength(1)
  expect(linhas[0]?.actor).toBe('user')
  expect(linhas[0]?.actor_id).toBe(contaA.adminId)
  expect(linhas[0]?.reason).toBe('campanha de fim de mês')
  expect(linhas[0]?.payload.campos).toEqual(['daily_calls_cap', 'max_concurrent'])
  expect(linhas[0]?.payload.antes).toEqual({ daily_calls_cap: 200, max_concurrent: 5 })
  expect(linhas[0]?.payload.depois).toEqual({ daily_calls_cap: 500, max_concurrent: 4 })
})

test('chave ausente não muda a coluna, e o resultado devolve a política inteira', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await definir(contaA.id, { min_interval_minutes: 30 }, 'ajuste')

  expect(rows[0]?.definir_politica_de_discagem).toEqual({
    dialing_window: {
      '1': { start: '09:00', end: '18:00' },
      '2': { start: '09:00', end: '18:00' },
      '3': { start: '09:00', end: '18:00' },
      '4': { start: '09:00', end: '18:00' },
      '5': { start: '09:00', end: '18:00' },
    },
    min_interval_minutes: 30,
    daily_attempts_per_number: 3,
    daily_calls_cap: 200,
    daily_spend_cap_cents: null,
    max_duration_seconds: 600,
    max_concurrent: 5,
  })
})

test('o teto de gasto aceita valor e volta a nulo, que é sem teto', async () => {
  await banco.comoUsuario(contaA.adminId)
  await definir(contaA.id, { daily_spend_cap_cents: 15000 }, 'primeira fatura chegou')
  await banco.comoServico()
  expect((await lerPolitica(contaA.id)).daily_spend_cap_cents).toBe(15000)

  await banco.comoUsuario(contaA.adminId)
  await definir(contaA.id, { daily_spend_cap_cents: null }, 'sem teto por enquanto')
  await banco.comoServico()
  expect((await lerPolitica(contaA.id)).daily_spend_cap_cents).toBeNull()
})

test('a janela passa pelo gatilho de validação, que nomeia o dia', async () => {
  await banco.comoUsuario(contaA.adminId)
  const erro = await erroDe(
    definir(contaA.id, { dialing_window: { '1': { start: '18:00', end: '09:00' } } }, 'ajuste'),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/dialing_window\["1"\]/)
})

test.each([
  ['motivo nulo', null],
  ['motivo em branco', '   '],
])('%s é recusado, e nada muda', async (_caso, motivo) => {
  await banco.comoUsuario(contaA.adminId)
  const erro = await erroDe(definir(contaA.id, { daily_calls_cap: 999 }, motivo))
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/motivo/)

  await banco.comoServico()
  expect((await lerPolitica(contaA.id)).daily_calls_cap).toBe(200)
})

test('chave fora da política é recusada pelo nome, e nada muda', async () => {
  await banco.comoUsuario(contaA.adminId)
  const erro = await erroDe(
    definir(contaA.id, { daily_calls_cap: 999, routing_mode: 'fixed' }, 'ajuste'),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/routing_mode/)

  await banco.comoServico()
  expect((await lerPolitica(contaA.id)).daily_calls_cap).toBe(200)
})

test('simultaneidade acima do check da coluna é recusada pelo banco', async () => {
  await banco.comoUsuario(contaA.adminId)
  const erro = await erroDe(definir(contaA.id, { max_concurrent: 11 }, 'ajuste'))
  expect(erro.code).toBe(CHECK_VIOLADO)
  expect(erro.message).toMatch(/account_settings_simultaneidade/)
})

test('o operador é recusado, com a razão escrita', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const erro = await erroDe(definir(contaA.id, { daily_calls_cap: 999 }, 'ajuste'))
  expect(erro.code).toBe(SEM_PRIVILEGIO)
  expect(erro.message).toMatch(/administra/)
})

test('o admin da conta A é recusado na conta B', async () => {
  await banco.comoUsuario(contaA.adminId)
  const erro = await erroDe(definir(contaB.id, { daily_calls_cap: 999 }, 'ajuste'))
  expect(erro.code).toBe(SEM_PRIVILEGIO)

  await banco.comoServico()
  expect((await lerPolitica(contaB.id)).daily_calls_cap).toBe(200)
})

test('o motivo não vaza para a escrita seguinte da mesma sessão', async () => {
  await banco.comoUsuario(contaA.adminId)
  await definir(contaA.id, { daily_calls_cap: 300 }, 'motivo da primeira')
  await banco.sql.query(
    'update public.account_settings set daily_calls_cap = 400 where account_id = $1',
    [contaA.id],
  )

  await banco.comoServico()
  const razoes = (await trilha(contaA.id)).map((linha) => linha.reason)
  expect(razoes).toHaveLength(2)
  expect(razoes).toContain('motivo da primeira')
  expect(razoes).toContain(null)
})

test('o RPC não é executável por public nem por anon', async () => {
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee from information_schema.routine_privileges
      where routine_schema = 'public' and routine_name = 'definir_politica_de_discagem'
        and privilege_type = 'EXECUTE'`,
  )
  const concedidos = rows.map((linha) => linha.grantee)
  expect(concedidos).toContain('authenticated')
  expect(concedidos).not.toContain('PUBLIC')
  expect(concedidos).not.toContain('anon')
})

// As configurações de automação da conta em PGlite (US-190, RF-008).
//
// O que se prova aqui:
//
// 1. **Os padrões nascem com a conta e já operam**: lembrete de 5 a 20
//    minutos, retentativa com teto, recuos e turnos, resgate com teto maior que
//    zero, e iguais aos de `_shared/automacao/padroes.ts`.
// 2. **O check recusa** janela negativa, janela invertida, teto negativo e
//    turnos tortos.
// 3. **Admin escreve pelo RPC, com autor e motivo na trilha**; operador não
//    escreve nem pelo RPC nem por update direto; a conta vizinha recebe zero
//    linha e não é alterada pelo admin de outra.
//
// Referência: migração 20261010200000_configuracao_da_automacao.sql (e as
// colunas de 20261010110000, 20261010120000 e 20261010170000).

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  JANELA_DO_LEMBRETE_PADRAO,
  POLITICA_PADRAO,
  RESGATE_PADRAO,
  TURNOS_PADRAO,
} from '../../supabase/functions/_shared/automacao/padroes.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly adminId: string
  readonly operadorId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

const COLUNAS = `reminder_window_start_minutes, reminder_window_end_minutes, retry_max_attempts,
  retry_backoff_minutes, retry_busy_minutes, retry_shifts, rescue_max_attempts, rescue_backoff_minutes`

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>('insert into public.accounts (name) values ($1) returning id', [nome])
  const id = rows[0]!.id
  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'operator')`,
    [id, adminId, operadorId],
  )
  return { id, adminId, operadorId }
}

async function ler(contaId: string): Promise<Record<string, unknown>> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<Record<string, unknown>>(
    `select ${COLUNAS} from public.account_settings where account_id = $1`,
    [contaId],
  )
  return rows[0]!
}

function definir(contaId: string, automacao: unknown, motivo: string | null) {
  return banco.sql.query<{ r: Record<string, unknown> }>(
    'select public.definir_automacao_da_conta($1, $2::jsonb, $3) as r',
    [contaId, JSON.stringify(automacao), motivo],
  )
}

async function codigo(manobra: Promise<unknown>): Promise<string | undefined> {
  try {
    await manobra
  } catch (erro) {
    return (erro as { code?: string }).code
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Automação A', 'automacao-a.test')
  contaB = await criarConta('Automação B', 'automacao-b.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.account_settings
        set reminder_window_start_minutes = default, reminder_window_end_minutes = default,
            retry_max_attempts = default, retry_backoff_minutes = default, retry_busy_minutes = default,
            retry_shifts = default, rescue_max_attempts = default, rescue_backoff_minutes = default`,
  )
  await banco.sql.query(`delete from public.audit_log where target_type = 'account_settings'`)
})

test('os padrões nascem com a conta, já operam e são os de padroes.ts', async () => {
  const linha = await ler(contaB.id)
  expect(linha).toEqual({
    reminder_window_start_minutes: JANELA_DO_LEMBRETE_PADRAO.inicioEmMinutos,
    reminder_window_end_minutes: JANELA_DO_LEMBRETE_PADRAO.fimEmMinutos,
    retry_max_attempts: POLITICA_PADRAO.tetoDeTentativas,
    retry_backoff_minutes: [...POLITICA_PADRAO.recuosEmMinutos],
    retry_busy_minutes: POLITICA_PADRAO.recuoOcupadoEmMinutos,
    retry_shifts: TURNOS_PADRAO,
    rescue_max_attempts: RESGATE_PADRAO.tetoDeTentativas,
    rescue_backoff_minutes: RESGATE_PADRAO.recuoEmMinutos,
  })
  expect(linha.rescue_max_attempts).toBeGreaterThan(0)
})

test.each([
  ['janela negativa', { reminder_window_start_minutes: -1 }],
  ['janela invertida', { reminder_window_start_minutes: 30, reminder_window_end_minutes: 10 }],
  ['teto de resgate negativo', { rescue_max_attempts: -1 }],
  ['teto de retentativa zero', { retry_max_attempts: 0 }],
  ['recuo negativo', { retry_backoff_minutes: [60, -5] }],
  ['turnos sobrepostos', { retry_shifts: [{ name: 'a', start: '09:00', end: '12:00' }, { name: 'b', start: '11:00', end: '13:00' }] }],
])('o check recusa %s, e nada muda', async (_nome, automacao) => {
  const antes = await ler(contaA.id)
  await banco.comoUsuario(contaA.adminId)
  expect(await codigo(definir(contaA.id, automacao, 'teste de faixa'))).toBe('23514')
  expect(await ler(contaA.id)).toEqual(antes)
})

test('o admin escreve, e a mudança da janela vai para a trilha com o autor e o motivo', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await definir(
    contaA.id,
    { reminder_window_end_minutes: 30, rescue_max_attempts: 3, retry_backoff_minutes: [30, 90] },
    'o time prefere lembrar com meia hora',
  )
  expect(rows[0]!.r).toMatchObject({ reminder_window_end_minutes: 30, rescue_max_attempts: 3, retry_backoff_minutes: [30, 90] })
  // Chave ausente é "não mexi".
  expect(await ler(contaA.id)).toMatchObject({ reminder_window_start_minutes: 5, retry_max_attempts: 4 })

  const { rows: trilha } = await banco.sql.query<{ actor: string; actor_id: string; reason: string }>(
    `select actor, actor_id, reason from public.audit_log where account_id = $1 and target_type = 'account_settings'`,
    [contaA.id],
  )
  expect(trilha).toEqual([{ actor: 'user', actor_id: contaA.adminId, reason: 'o time prefere lembrar com meia hora' }])
})

test('motivo em branco e chave fora da lista são recusados', async () => {
  await banco.comoUsuario(contaA.adminId)
  expect(await codigo(definir(contaA.id, { rescue_max_attempts: 1 }, '  '))).toBe('22023')
  expect(await codigo(definir(contaA.id, { max_concurrent: 1 }, 'x'))).toBe('22023')
})

test('o operador não escreve, nem pelo RPC nem por update direto', async () => {
  await banco.comoUsuario(contaA.operadorId)
  expect(await codigo(definir(contaA.id, { rescue_max_attempts: 5 }, 'tentativa'))).toBe('42501')
  const { rows } = await banco.sql.query(
    'update public.account_settings set rescue_max_attempts = 5 where account_id = $1 returning account_id',
    [contaA.id],
  )
  expect(rows).toEqual([])
  expect((await ler(contaA.id)).rescue_max_attempts).toBe(2)
})

test('a conta vizinha: zero linha na leitura e nenhuma escrita pelo admin de outra', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query(`select ${COLUNAS} from public.account_settings where account_id = $1`, [contaB.id])
  expect(rows).toEqual([])
  const { rows: propria } = await banco.sql.query(`select ${COLUNAS} from public.account_settings where account_id = $1`, [contaA.id])
  expect(propria).toHaveLength(1)
  expect(await codigo(definir(contaB.id, { rescue_max_attempts: 5 }, 'invasão'))).toBe('42501')
  expect((await ler(contaB.id)).rescue_max_attempts).toBe(2)
})

// A conexão de telefonia é autorização, não credencial: o que se guarda é o
// identificador da subconta que o provedor devolve, e sozinho ele não abre
// nada. O que se prova aqui:
//
// 1. A autorização entra pelo serviço e nunca pelo cliente.
// 2. Reautorizar revoga a anterior na mesma transação, e as duas ficam no
//    histórico.
// 3. `modo_de_telefonia` prefere autorização a chave, e sabe dizer quando não
//    há nenhuma das duas.
// 4. Desconectar pela interface é de administrador.
//
// Referência: migração 20260924000000_conexao_de_telefonia.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  UUID,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly operadorId: string
}

let banco: BancoDeTeste
let conta: Conta

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'operator')`,
    [id, donoId, operadorId],
  )
  return { id, donoId, operadorId }
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  conta = await criarConta('Transportes Aurora', 'aurora.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.exec('truncate public.telephony_connections cascade')
  await banco.sql.exec('delete from public.account_secrets')
  // A trilha também: ela é cumulativa por natureza, e o caso que conta linhas
  // de auditoria mediria o que os casos anteriores deixaram.
  await banco.sql.exec('delete from public.audit_log')
})

async function modo(): Promise<string | null> {
  const { rows } = await banco.sql.query<{ modo: string | null }>(
    'select public.modo_de_telefonia($1) as modo',
    [conta.id],
  )
  return rows[0]?.modo ?? null
}

async function conectar(contaDoProvedor: string, autor: string | null = null) {
  const { rows } = await banco.sql.query<{ id: string | null }>(
    'select public.registrar_conexao_de_telefonia($1, $2, $3) as id',
    [conta.id, contaDoProvedor, autor],
  )
  return rows[0]?.id ?? null
}

test('sem autorização e sem chave, a conta não tem telefonia', async () => {
  await expect(modo()).resolves.toBe('ausente')
})

test('a autorização registrada vira o modo conectado', async () => {
  const id = await conectar('AC00000000000000000000000000000001', conta.donoId)

  expect(id).toMatch(UUID)
  await expect(modo()).resolves.toBe('conectado')
})

test('reautorizar revoga a anterior e guarda as duas', async () => {
  await conectar('AC00000000000000000000000000000001', conta.donoId)
  await conectar('AC00000000000000000000000000000002', conta.donoId)

  const { rows } = await banco.sql.query<{
    provider_account_id: string
    revoked_at: string | null
    revoked_reason: string | null
  }>(
    `select provider_account_id, revoked_at, revoked_reason
       from public.telephony_connections
      where account_id = $1
      order by created_at`,
    [conta.id],
  )

  expect(rows).toHaveLength(2)
  expect(rows[0]?.revoked_at).not.toBeNull()
  expect(rows[0]?.revoked_reason).toBe('substituída por nova autorização')
  expect(rows[1]?.revoked_at).toBeNull()
  await expect(modo()).resolves.toBe('conectado')
})

test('a autorização ganha da chave no cofre', async () => {
  // Uma chave de telefonia cadastrada: sozinha, o modo é `chave`.
  await banco.sql.query(
    `insert into public.account_secrets (account_id, provider, key_name, secret_id)
     values ($1, 'telefonia', 'auth_token', gen_random_uuid())`,
    [conta.id],
  )
  await expect(modo()).resolves.toBe('chave')

  // Conectada a autorização, ela passa na frente: quem conectou depois quis.
  await conectar('AC00000000000000000000000000000003', conta.donoId)
  await expect(modo()).resolves.toBe('conectado')
})

test('a fundação da autorização grava auditoria com o autor', async () => {
  await conectar('AC00000000000000000000000000000004', conta.donoId)

  const { rows } = await banco.sql.query<{
    actor: string
    actor_id: string
    source: string
    target_type: string
  }>(
    `select actor, actor_id, source, target_type
       from public.audit_log
      where source = 'rpc:registrar_conexao_de_telefonia'`,
  )

  expect(rows).toEqual([
    {
      actor: 'user',
      actor_id: conta.donoId,
      source: 'rpc:registrar_conexao_de_telefonia',
      target_type: 'telephony_connections',
    },
  ])
})

test('o cliente não escreve autorização, nem o dono', async () => {
  await banco.comoUsuario(conta.donoId)

  // RLS sem política de insert não levanta erro de permissão no Postgres: ela
  // recusa a linha. O que importa é que nada entra.
  await expect(
    banco.sql.query(
      `insert into public.telephony_connections
         (account_id, provider, provider_account_id)
       values ($1, 'twilio', 'ACfalsificada')`,
      [conta.id],
    ),
  ).rejects.toThrow(/row-level security/i)
})

test('o membro lê o estado da conexão', async () => {
  await conectar('AC00000000000000000000000000000005', conta.donoId)

  await banco.comoUsuario(conta.operadorId)
  const { rows } = await banco.sql.query<{ provider_account_id: string }>(
    'select provider_account_id from public.telephony_connections',
  )

  expect(rows).toHaveLength(1)
})

test('desconectar pela interface é de administrador', async () => {
  await conectar('AC00000000000000000000000000000006', conta.donoId)

  await banco.comoUsuario(conta.operadorId)
  await expect(
    banco.sql.query('select public.revogar_conexao_de_telefonia($1, $2)', [
      conta.id,
      'teste',
    ]),
  ).rejects.toThrow(/administrador/i)

  await banco.comoUsuario(conta.donoId)
  const { rows } = await banco.sql.query<{ afetadas: number }>(
    'select public.revogar_conexao_de_telefonia($1, $2) as afetadas',
    [conta.id, 'o cliente pediu'],
  )
  expect(Number(rows[0]?.afetadas)).toBe(1)

  await banco.comoServico()
  await expect(modo()).resolves.toBe('ausente')
})

test('revogada, a conta volta a não ter telefonia e o histórico fica', async () => {
  await conectar('AC00000000000000000000000000000007', conta.donoId)
  await banco.sql.query('select public.revogar_conexao_de_telefonia($1, $2)', [
    conta.id,
    'revogado no provedor',
  ])

  await expect(modo()).resolves.toBe('ausente')

  const { rows } = await banco.sql.query<{ revoked_reason: string }>(
    'select revoked_reason from public.telephony_connections',
  )
  expect(rows[0]?.revoked_reason).toBe('revogado no provedor')
})

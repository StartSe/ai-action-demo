// O cofre escrito pela borda: o segredo do webhook de fim de ligação que
// `agent-publish` recebe da ElevenLabs e guarda na conta. As duas funções são
// só de `service_role`, e o teste cobra os dois lados: a borda grava e lê o
// metadado, e nenhuma sessão de cliente alcança nenhuma das duas.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const SEGREDO = 'wsec_segredo-do-webhook-de-fim-0123456789'
const SEGREDO_NOVO = 'wsec_segredo-do-webhook-trocado-9876543210'

let banco: BancoDeTeste
let conta: string
let donoId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    "insert into public.accounts (name) values ('Conta do webhook') returning id",
  )
  conta = rows[0]?.id ?? ''
  donoId = await banco.criarUsuario('dono@webhook.test', 'Dono')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')`,
    [conta, donoId],
  )
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.account_secrets')
  await banco.sql.query('delete from vault.secrets')
})

async function comoBorda(): Promise<void> {
  await banco.comoServico()
  await banco.sql.exec('set role service_role')
}

async function gravar(valor: string, metadata: Record<string, unknown>): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `select public.gravar_segredo_pelo_servidor($1, 'voz', 'webhook_secret', $2, $3::jsonb) as id`,
    [conta, valor, JSON.stringify(metadata)],
  )
  return rows[0]?.id ?? ''
}

async function metadado(): Promise<unknown> {
  const { rows } = await banco.sql.query<{ metadado: unknown }>(
    `select public.metadado_do_segredo($1, 'voz', 'webhook_secret') as metadado`,
    [conta],
  )
  return rows[0]?.metadado ?? null
}

async function valor(): Promise<string | null> {
  const { rows } = await banco.sql.query<{ valor: string | null }>(
    `select public.get_account_secret($1, 'voz', 'webhook_secret') as valor`,
    [conta],
  )
  return rows[0]?.valor ?? null
}

test('a borda grava o segredo, e ele sai por get_account_secret e não pela tabela', async () => {
  await comoBorda()
  await gravar(SEGREDO, { webhook_id: 'wh_1' })
  await expect(valor()).resolves.toBe(SEGREDO)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ linha: string }>(
    'select row_to_json(s)::text as linha from public.account_secrets as s',
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.linha).not.toContain(SEGREDO)
})

test('o metadado guarda o identificador do webhook e nunca o valor', async () => {
  await comoBorda()
  await gravar(SEGREDO, { webhook_id: 'wh_1', webhook_url: 'endereco-do-fim' })
  const lido = await metadado()
  expect(lido).toEqual({ webhook_id: 'wh_1', webhook_url: 'endereco-do-fim' })
  expect(JSON.stringify(lido)).not.toContain(SEGREDO)
})

test('gravar de novo troca o valor e o metadado e mantém o ponteiro', async () => {
  await comoBorda()
  const primeiro = await gravar(SEGREDO, { webhook_id: 'wh_1' })
  const segundo = await gravar(SEGREDO_NOVO, { webhook_id: 'wh_2' })

  expect(segundo).toBe(primeiro)
  await expect(valor()).resolves.toBe(SEGREDO_NOVO)
  await expect(metadado()).resolves.toEqual({ webhook_id: 'wh_2' })
})

test('sem credencial, o metadado é nulo, e não erro', async () => {
  await comoBorda()
  await expect(metadado()).resolves.toBeNull()
})

test('valor vazio é recusado', async () => {
  await comoBorda()
  await expect(gravar('  ', {})).rejects.toThrow(/não pode ser vazio/)
})

test('o dono não chama nenhuma das duas: são portas do servidor', async () => {
  await banco.comoUsuario(donoId)
  await expect(gravar(SEGREDO, {})).rejects.toThrow(/permission denied/i)
  await expect(metadado()).rejects.toThrow(/permission denied/i)
})

test('sessão anônima também não', async () => {
  await banco.comoAnonimo()
  await expect(gravar(SEGREDO, {})).rejects.toThrow(/permission denied/i)
  await expect(metadado()).rejects.toThrow(/permission denied/i)
})

test('só service_role executa, e as duas são security definer com search_path fixado', async () => {
  await banco.comoServico()
  const { rows: privilegios } = await banco.sql.query<{ funcao: string; papel: string }>(
    `select routine_name as funcao, grantee as papel
       from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name in ('gravar_segredo_pelo_servidor', 'metadado_do_segredo')
        and privilege_type = 'EXECUTE'`,
  )
  for (const funcao of ['gravar_segredo_pelo_servidor', 'metadado_do_segredo']) {
    const papeis = privilegios.filter((linha) => linha.funcao === funcao).map((linha) => linha.papel)
    expect(papeis, funcao).toContain('service_role')
    expect(papeis, funcao).not.toContain('PUBLIC')
    expect(papeis, funcao).not.toContain('anon')
    expect(papeis, funcao).not.toContain('authenticated')
  }

  const { rows } = await banco.sql.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
    `select p.proname, p.prosecdef, p.proconfig
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('gravar_segredo_pelo_servidor', 'metadado_do_segredo')`,
  )
  expect(rows).toHaveLength(2)
  for (const linha of rows) {
    expect(linha.prosecdef).toBe(true)
    expect(linha.proconfig).toContain('search_path=""')
  }
})

// O script que zera o ambiente (`scripts/zerar-ambiente.sql`) faz o que o
// cabeçalho dele promete: apaga contas, usuários, credenciais e dado de
// negócio, e deixa a instalação de pé — `app_config` e o segredo das rotinas.
//
// O script roda à mão, contra o Supabase; aqui ele roda inteiro, do arquivo,
// em PGlite. Sem este teste, a primeira vez que alguém descobrisse que ele
// apagou o segredo das rotinas seria quando o pg_cron parasse de chamar as
// funções, sem erro em lugar nenhum além do histórico dele.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()

  const donoId = await banco.criarUsuario('dona@aurora.test', 'Dona')
  await banco.criarUsuario('operador@aurora.test', 'Operador')
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    ['Aurora Energia'],
  )
  const contaId = rows[0]?.id
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')`,
    [contaId, donoId],
  )
  await banco.sql.query(
    `insert into public.leads (account_id, name, phone_e164) values ($1, 'Marcos', '+5548999998888')`,
    [contaId],
  )
  // Uma credencial de conta e o segredo das rotinas, os dois no cofre. O das
  // rotinas a migração 20261005100000 já sorteou.
  await banco.sql.query(`select vault.create_secret('sk_da_conta', 'conta_voz_api_key')`)
  await banco.sql.query(
    `insert into public.app_config (key, value, description)
     values ('rotinas.url_base', 'endereco-das-funcoes', 'teste')
     on conflict (key) do nothing`,
  )

  const script = await readFile(
    fileURLToPath(new URL('../../scripts/zerar-ambiente.sql', import.meta.url)),
    'utf8',
  )
  await banco.sql.exec(script)
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

async function contar(tabela: string): Promise<number> {
  const { rows } = await banco.sql.query<{ n: number }>(`select count(*)::int as n from ${tabela}`)
  return rows[0]?.n ?? -1
}

test('não sobra usuário, conta, membro nem lead', async () => {
  expect(await contar('auth.users')).toBe(0)
  expect(await contar('public.profiles')).toBe(0)
  expect(await contar('public.accounts')).toBe(0)
  expect(await contar('public.account_members')).toBe(0)
  expect(await contar('public.leads')).toBe(0)
})

test('o cofre perde a credencial da conta e guarda o segredo das rotinas', async () => {
  const { rows } = await banco.sql.query<{ name: string }>('select name from vault.secrets order by name')
  expect(rows.map((linha) => linha.name)).toEqual(['sarah_internal_secret'])
})

test('a configuração da instalação fica inteira', async () => {
  const { rows } = await banco.sql.query<{ key: string }>('select key from public.app_config order by key')
  expect(rows.map((linha) => linha.key)).toEqual(['rotinas.nome_do_segredo', 'rotinas.url_base'])
})

test('depois do reset, a instalação volta a aceitar a fundação', async () => {
  const usuarioId = await banco.criarUsuario('nova@aurora.test', 'Nova')
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    ['Conta nova'],
  )
  expect(rows[0]?.id).toBeTruthy()
  expect(usuarioId).toBeTruthy()
})

test('a função do banco faz o mesmo, e só service_role a executa', async () => {
  const { rows } = await banco.sql.query<{ papel: string; pode: boolean }>(
    `select r.rolname as papel,
            has_function_privilege(r.rolname, 'public.zerar_ambiente()', 'execute') as pode
       from pg_roles as r
      where r.rolname in ('anon', 'authenticated', 'service_role')
      order by r.rolname`,
  )
  expect(rows).toEqual([
    { papel: 'anon', pode: false },
    { papel: 'authenticated', pode: false },
    { papel: 'service_role', pode: true },
  ])

  // Cenário novo depois do reset do arquivo: uma conta, um usuário, uma
  // credencial. A função apaga os três e guarda o segredo das rotinas.
  const usuarioId = await banco.criarUsuario('outra@aurora.test', 'Outra')
  await banco.sql.query('insert into public.accounts (name) values ($1)', ['Outra conta'])
  await banco.sql.query(`select vault.create_secret('sk_outra', 'outra_credencial')`)
  expect(usuarioId).toBeTruthy()

  await banco.sql.exec('set role service_role')
  const resultado = await banco.sql.query<{ resumo: { contas: number } }>(
    'select public.zerar_ambiente() as resumo',
  )
  await banco.comoServico()

  expect(resultado.rows[0]?.resumo.contas).toBeGreaterThan(0)
  expect(await contar('public.accounts')).toBe(0)
  expect(await contar('auth.users')).toBe(0)
  const { rows: segredos } = await banco.sql.query<{ name: string }>('select name from vault.secrets')
  expect(segredos.map((linha) => linha.name)).toEqual(['sarah_internal_secret'])
})

test('a rotina não tem DELETE nem UPDATE sem WHERE: pela API, o safeupdate os recusa', async () => {
  // As sessões da API do Supabase carregam `safeupdate`, e o PGlite não. Sem este
  // teste, um `delete from tabela;` passa verde aqui e derruba o botão lá.
  const { rows } = await banco.sql.query<{ corpo: string }>(
    `select prosrc as corpo from pg_proc where proname = 'zerar_ambiente'`,
  )
  const corpo = (rows[0]?.corpo ?? '').replace(/--[^\n]*/g, '')
  const comandos = corpo.split(';').map((trecho) => trecho.trim().toLowerCase())
  const semCondicao = comandos.filter(
    (comando) => /^(delete\s+from|update)\s/.test(comando) && !/\swhere\s/.test(comando),
  )
  expect(semCondicao).toEqual([])
})

// A migração de conta e acesso entrega o que as histórias seguintes
// pressupõem: as três extensões, o formato das três tabelas e as funções de
// papel com a hierarquia owner > admin > operator > viewer.
// Referência: docs/PRD-implementacao.md seções 3.1 e 3.9.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste

beforeAll(async () => {
  banco = await criarBancoDeTeste()
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// Preparar dado é trabalho de superusuário: a RLS já está habilitada nas três
// tabelas e ainda não há política nenhuma (a matriz é da US-004).
beforeEach(async () => {
  await banco.comoServico()
})

async function criarConta(nome: string): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`Não foi possível criar a conta ${nome}`)
  return id
}

async function vincular(
  contaId: string,
  usuarioId: string,
  papel: string,
): Promise<void> {
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, $3)`,
    [contaId, usuarioId, papel],
  )
}

// Extensões ------------------------------------------------------------------

test('as três extensões da fundação estão instaladas', async () => {
  const { rows } = await banco.sql.query<{ extname: string }>(
    `select extname from pg_extension order by extname`,
  )
  const extensoes = rows.map((linha) => linha.extname)

  expect(extensoes).toContain('btree_gist')
  expect(extensoes).toContain('pg_trgm')
  expect(extensoes).toContain('pgcrypto')
})

// accounts -------------------------------------------------------------------

test('accounts nasce com id, fuso de São Paulo, status ativo e a bandeira do portão escrita', async () => {
  const { rows } = await banco.sql.query<{
    id: string
    timezone: string
    status: string
    feature_flags: Record<string, unknown>
    created_at: Date
    updated_at: Date
  }>(
    `insert into public.accounts (name)
     values ('Padaria do Bairro')
     returning id, timezone, status, feature_flags, created_at, updated_at`,
  )
  const conta = rows[0]

  expect(conta?.id).toMatch(/^[0-9a-f-]{36}$/i)
  expect(conta?.timezone).toBe('America/Sao_Paulo')
  expect(conta?.status).toBe('active')
  // O padrão de `feature_flags` deixou de ser vazio na migração de operação da
  // conta (20260922000000): `real_dialing` nasceu falso e escrito, para que o
  // portão de lead real não dependa do coalesce de cada leitor. A migração do
  // portão da F3 (20260925000000) o liga, e conta nova nasce ligada como as
  // antigas; o portão continua fechado pela ligação de teste que ela ainda não
  // fez. Quem prova o portão é testes/banco/portao-de-lead-real.test.ts; aqui
  // basta o padrão não mudar sem alguém reparar.
  expect(conta?.feature_flags).toEqual({ real_dialing: true })
  expect(conta?.created_at).toBeInstanceOf(Date)
  expect(conta?.updated_at).toBeInstanceOf(Date)
})

test('accounts recusa status fora da lista e nome em branco', async () => {
  await expect(
    banco.sql.query(
      `insert into public.accounts (name, status) values ('Conta', 'pausada')`,
    ),
  ).rejects.toThrow(/status/)

  await expect(
    banco.sql.query(`insert into public.accounts (name) values ('   ')`),
  ).rejects.toThrow(/name/)
})

test('o gatilho de updated_at ignora o valor enviado e grava o instante da escrita', async () => {
  const contaId = await criarConta('Conta do relógio')

  // Mandar uma data antiga de propósito: se o gatilho estiver no lugar, ela é
  // descartada em favor de now(). Sem o gatilho, o valor antigo persistiria.
  const { rows } = await banco.sql.query<{ recente: boolean }>(
    `update public.accounts
        set name = 'Conta do relógio, renomeada',
            updated_at = timestamptz '2000-01-01 00:00:00+00'
      where id = $1
      returning updated_at >= created_at as recente`,
    [contaId],
  )

  expect(rows[0]?.recente).toBe(true)
})

// profiles -------------------------------------------------------------------

test('o gatilho de auth.users cria o profile com nome e e-mail', async () => {
  const usuarioId = await banco.criarUsuario('bruno@exemplo.test', 'Bruno')

  const { rows } = await banco.sql.query<{
    display_name: string | null
    email: string | null
  }>('select display_name, email from public.profiles where id = $1', [
    usuarioId,
  ])

  expect(rows[0]).toEqual({ display_name: 'Bruno', email: 'bruno@exemplo.test' })
})

test('apagar o usuário em auth.users leva o profile junto', async () => {
  const usuarioId = await banco.criarUsuario('efemero@exemplo.test')

  await banco.sql.query('delete from auth.users where id = $1', [usuarioId])

  const { rows } = await banco.sql.query(
    'select 1 from public.profiles where id = $1',
    [usuarioId],
  )
  expect(rows).toHaveLength(0)
})

// account_members ------------------------------------------------------------

test('account_members aceita só os quatro papéis', async () => {
  const contaId = await criarConta('Conta dos papéis')
  const usuarioId = await banco.criarUsuario('papeis@exemplo.test')

  await expect(vincular(contaId, usuarioId, 'gerente')).rejects.toThrow(/role/)

  await vincular(contaId, usuarioId, 'viewer')
  const { rows } = await banco.sql.query<{ role: string }>(
    'select role from public.account_members where account_id = $1',
    [contaId],
  )
  expect(rows[0]?.role).toBe('viewer')
})

test('o par conta e usuário é único', async () => {
  const contaId = await criarConta('Conta sem duplicata')
  const usuarioId = await banco.criarUsuario('unico@exemplo.test')

  await vincular(contaId, usuarioId, 'admin')
  await expect(vincular(contaId, usuarioId, 'viewer')).rejects.toThrow(
    /account_id|unique|duplic/i,
  )
})

test('existe índice por usuário e conta, na ordem em que is_member consulta', async () => {
  const { rows } = await banco.sql.query<{ indexdef: string }>(
    `select indexdef from pg_indexes
      where schemaname = 'public' and tablename = 'account_members'`,
  )
  const definicoes = rows.map((linha) => linha.indexdef)

  expect(
    definicoes.some((definicao) => /\(user_id, account_id\)/.test(definicao)),
  ).toBe(true)
})

test('apagar a conta leva os vínculos junto', async () => {
  const contaId = await criarConta('Conta que some')
  const usuarioId = await banco.criarUsuario('vinculo@exemplo.test')
  await vincular(contaId, usuarioId, 'owner')

  await banco.sql.query('delete from public.accounts where id = $1', [contaId])

  const { rows } = await banco.sql.query(
    'select 1 from public.account_members where account_id = $1',
    [contaId],
  )
  expect(rows).toHaveLength(0)
})

// Funções de papel -----------------------------------------------------------

test('is_member responde pelo vínculo do usuário da sessão', async () => {
  const contaId = await criarConta('Conta da Carla')
  const carla = await banco.criarUsuario('carla@exemplo.test', 'Carla')
  const daniel = await banco.criarUsuario('daniel@exemplo.test', 'Daniel')
  await vincular(contaId, carla, 'operator')

  await banco.comoUsuario(carla)
  const membro = await banco.sql.query<{ resposta: boolean }>(
    'select (select public.is_member($1)) as resposta',
    [contaId],
  )
  expect(membro.rows[0]?.resposta).toBe(true)

  await banco.comoUsuario(daniel)
  const estranho = await banco.sql.query<{ resposta: boolean }>(
    'select (select public.is_member($1)) as resposta',
    [contaId],
  )
  expect(estranho.rows[0]?.resposta).toBe(false)

  await banco.comoAnonimo()
  const anonimo = await banco.sql.query<{ resposta: boolean }>(
    'select (select public.is_member($1)) as resposta',
    [contaId],
  )
  expect(anonimo.rows[0]?.resposta).toBe(false)
})

test('has_role é hierárquica: owner contém admin, que contém operator, que contém viewer', async () => {
  const papeis = ['owner', 'admin', 'operator', 'viewer'] as const
  const contaId = await criarConta('Conta da hierarquia')

  const usuarios = new Map<string, string>()
  for (const papel of papeis) {
    const usuarioId = await banco.criarUsuario(`${papel}@hierarquia.test`, papel)
    await vincular(contaId, usuarioId, papel)
    usuarios.set(papel, usuarioId)
  }

  // Linha: papel que o usuário tem. Coluna: papel exigido. Alcança quando o
  // papel que ele tem está na mesma altura ou acima do exigido.
  const esperado: Record<string, boolean[]> = {
    owner: [true, true, true, true],
    admin: [false, true, true, true],
    operator: [false, false, true, true],
    viewer: [false, false, false, true],
  }

  for (const papel of papeis) {
    const usuarioId = usuarios.get(papel)
    if (!usuarioId) throw new Error(`Usuário do papel ${papel} não foi criado`)

    await banco.comoUsuario(usuarioId)
    const { rows } = await banco.sql.query<{
      dono: boolean
      administrador: boolean
      operador: boolean
      observador: boolean
    }>(
      `select (select public.has_role($1, 'owner')) as dono,
              (select public.has_role($1, 'admin')) as administrador,
              (select public.has_role($1, 'operator')) as operador,
              (select public.has_role($1, 'viewer')) as observador`,
      [contaId],
    )
    const obtido = rows[0]
    expect([
      obtido?.dono,
      obtido?.administrador,
      obtido?.operador,
      obtido?.observador,
    ]).toEqual(esperado[papel])
  }
})

test('has_role nega quando o papel exigido é desconhecido ou o usuário não é membro', async () => {
  const contaId = await criarConta('Conta do papel torto')
  const usuarioId = await banco.criarUsuario('torto@exemplo.test')
  await vincular(contaId, usuarioId, 'owner')

  await banco.comoUsuario(usuarioId)
  const { rows } = await banco.sql.query<{
    desconhecido: boolean
    outraConta: boolean
  }>(
    `select (select public.has_role($1, 'superusuario')) as "desconhecido",
            (select public.has_role(gen_random_uuid(), 'viewer')) as "outraConta"`,
    [contaId],
  )

  expect(rows[0]?.desconhecido).toBe(false)
  expect(rows[0]?.outraConta).toBe(false)
})

test('is_member e has_role são stable security definer', async () => {
  const { rows } = await banco.sql.query<{
    proname: string
    prosecdef: boolean
    provolatile: string
  }>(
    `select p.proname, p.prosecdef, p.provolatile
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('is_member', 'has_role')
      order by p.proname`,
  )

  expect(rows).toHaveLength(2)
  for (const funcao of rows) {
    expect(funcao.prosecdef).toBe(true)
    expect(funcao.provolatile).toBe('s')
  }
})

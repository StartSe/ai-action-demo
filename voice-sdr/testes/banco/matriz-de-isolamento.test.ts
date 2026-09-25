// A matriz de isolamento das três tabelas da fundação, exercitada de dentro de
// uma sessão autenticada. Tudo aqui só prova algo porque a sessão troca para
// `authenticated`: como `postgres`, toda política seria ignorada.
// Referência: docs/PRD-implementacao.md seção 3.9.

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

// Preparar cenário é trabalho de superusuário: sob RLS não há política de
// insert em accounts nem em profiles, e a fixture não nasceria.
beforeEach(async () => {
  await banco.comoServico()
})

const PAPEIS = ['owner', 'admin', 'operator', 'viewer'] as const
type Papel = (typeof PAPEIS)[number]

interface Cenario {
  contaId: string
  /** Um usuário por papel, todos vinculados a esta conta. */
  usuarios: Record<Papel, string>
}

let sequencia = 0

/** Conta com os quatro papéis preenchidos. Cada chamada é uma conta nova. */
async function montarConta(nome: string): Promise<Cenario> {
  sequencia += 1
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const contaId = rows[0]?.id
  if (!contaId) throw new Error(`Não foi possível criar a conta ${nome}`)

  const usuarios = {} as Record<Papel, string>
  for (const papel of PAPEIS) {
    const usuarioId = await banco.criarUsuario(
      `${papel}.${sequencia}@isolamento.test`,
      `${papel} ${sequencia}`,
    )
    await banco.sql.query(
      `insert into public.account_members (account_id, user_id, role)
       values ($1, $2, $3)`,
      [contaId, usuarioId, papel],
    )
    usuarios[papel] = usuarioId
  }

  return { contaId, usuarios }
}

/** Mensagem que o Postgres devolve quando a política recusa a linha nova. */
const RECUSA_DE_RLS = /row-level security/i

// Alicerce -------------------------------------------------------------------

test('as três tabelas da fundação têm row level security ligada', async () => {
  const { rows } = await banco.sql.query<{
    relname: string
    relrowsecurity: boolean
  }>(
    `select c.relname, c.relrowsecurity
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('accounts', 'profiles', 'account_members')
      order by c.relname`,
  )

  expect(rows).toHaveLength(3)
  for (const tabela of rows) {
    expect(tabela.relrowsecurity, `${tabela.relname} sem RLS`).toBe(true)
  }
})

test('sessão anônima não lê conta, equipe nem perfil', async () => {
  await montarConta('Conta fechada para o anônimo')
  await banco.comoAnonimo()

  for (const tabela of ['accounts', 'profiles', 'account_members']) {
    const { rows } = await banco.sql.query(`select 1 from public.${tabela}`)
    expect(rows, `anônimo enxergou ${tabela}`).toHaveLength(0)
  }
})

// Leitura --------------------------------------------------------------------

test('membro lê a própria conta e não enxerga a conta vizinha', async () => {
  const casa = await montarConta('Conta de casa')
  const vizinha = await montarConta('Conta vizinha')

  await banco.comoUsuario(casa.usuarios.viewer)
  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.accounts',
  )

  expect(rows.map((linha) => linha.id)).toEqual([casa.contaId])
  expect(rows.map((linha) => linha.id)).not.toContain(vizinha.contaId)
})

test('membro lê a equipe da própria conta e nenhuma linha da vizinha', async () => {
  const casa = await montarConta('Equipe de casa')
  const vizinha = await montarConta('Equipe vizinha')

  await banco.comoUsuario(casa.usuarios.operator)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.account_members',
  )

  expect(rows).toHaveLength(PAPEIS.length)
  for (const vinculo of rows) {
    expect(vinculo.account_id).toBe(casa.contaId)
  }
  expect(rows.map((linha) => linha.account_id)).not.toContain(vizinha.contaId)
})

test('o perfil do colega de conta aparece, o do estranho não', async () => {
  const casa = await montarConta('Perfis de casa')
  const vizinha = await montarConta('Perfis da vizinha')

  await banco.comoUsuario(casa.usuarios.viewer)
  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.profiles',
  )
  const visiveis = rows.map((linha) => linha.id)

  expect(visiveis).toContain(casa.usuarios.viewer)
  expect(visiveis).toContain(casa.usuarios.owner)
  expect(visiveis).not.toContain(vizinha.usuarios.owner)
  expect(visiveis).toHaveLength(PAPEIS.length)
})

// Escrita em accounts --------------------------------------------------------

test('atualizar a conta exige admin', async () => {
  const conta = await montarConta('Conta a renomear')

  await banco.comoUsuario(conta.usuarios.operator)
  const operador = await banco.sql.query<{ id: string }>(
    'update public.accounts set name = $1 where id = $2 returning id',
    ['Nome do operador', conta.contaId],
  )
  expect(operador.rows).toHaveLength(0)

  await banco.comoUsuario(conta.usuarios.admin)
  const administrador = await banco.sql.query<{ name: string }>(
    'update public.accounts set name = $1 where id = $2 returning name',
    ['Nome do administrador', conta.contaId],
  )
  expect(administrador.rows[0]?.name).toBe('Nome do administrador')
})

test('apagar a conta exige owner: nem admin alcança', async () => {
  const conta = await montarConta('Conta a encerrar')

  await banco.comoUsuario(conta.usuarios.admin)
  const administrador = await banco.sql.query<{ id: string }>(
    'delete from public.accounts where id = $1 returning id',
    [conta.contaId],
  )
  expect(administrador.rows).toHaveLength(0)

  await banco.comoUsuario(conta.usuarios.owner)
  const dono = await banco.sql.query<{ id: string }>(
    'delete from public.accounts where id = $1 returning id',
    [conta.contaId],
  )
  expect(dono.rows.map((linha) => linha.id)).toEqual([conta.contaId])
})

// Escrita em account_members -------------------------------------------------

test('vincular alguém à conta exige admin', async () => {
  const conta = await montarConta('Conta que cresce')
  const recemChegado = await banco.criarUsuario('recem@isolamento.test')

  await banco.comoUsuario(conta.usuarios.operator)
  await expect(
    banco.sql.query(
      `insert into public.account_members (account_id, user_id, role)
       values ($1, $2, 'viewer')`,
      [conta.contaId, recemChegado],
    ),
  ).rejects.toThrow(RECUSA_DE_RLS)

  await banco.comoUsuario(conta.usuarios.admin)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'viewer') returning id`,
    [conta.contaId, recemChegado],
  )
  expect(rows).toHaveLength(1)
})

test('mudar o papel de um membro exige admin', async () => {
  const conta = await montarConta('Conta que promove')

  await banco.comoUsuario(conta.usuarios.operator)
  const operador = await banco.sql.query<{ id: string }>(
    `update public.account_members set role = 'admin'
      where user_id = $1 returning id`,
    [conta.usuarios.viewer],
  )
  expect(operador.rows).toHaveLength(0)

  await banco.comoUsuario(conta.usuarios.admin)
  const administrador = await banco.sql.query<{ role: string }>(
    `update public.account_members set role = 'operator'
      where user_id = $1 returning role`,
    [conta.usuarios.viewer],
  )
  expect(administrador.rows[0]?.role).toBe('operator')
})

test('remover membro exige admin', async () => {
  const conta = await montarConta('Conta que desliga')

  await banco.comoUsuario(conta.usuarios.viewer)
  const observador = await banco.sql.query<{ id: string }>(
    'delete from public.account_members where user_id = $1 returning id',
    [conta.usuarios.operator],
  )
  expect(observador.rows).toHaveLength(0)

  await banco.comoUsuario(conta.usuarios.admin)
  const administrador = await banco.sql.query<{ id: string }>(
    'delete from public.account_members where user_id = $1 returning id',
    [conta.usuarios.operator],
  )
  expect(administrador.rows).toHaveLength(1)
})

test('a linha do owner está fora do alcance do admin, nos dois sentidos', async () => {
  const conta = await montarConta('Conta com dono')
  const candidato = await banco.criarUsuario('candidato@isolamento.test')

  await banco.comoUsuario(conta.usuarios.admin)

  // Rebaixar o dono: a política de update não devolve a linha dele.
  const rebaixamento = await banco.sql.query<{ id: string }>(
    `update public.account_members set role = 'viewer'
      where user_id = $1 returning id`,
    [conta.usuarios.owner],
  )
  expect(rebaixamento.rows).toHaveLength(0)

  // Promover alguém a owner: a linha nova não passa no with check.
  await expect(
    banco.sql.query(
      `update public.account_members set role = 'owner' where user_id = $1`,
      [conta.usuarios.operator],
    ),
  ).rejects.toThrow(RECUSA_DE_RLS)

  // Criar outro owner: mesma recusa, agora no insert.
  await expect(
    banco.sql.query(
      `insert into public.account_members (account_id, user_id, role)
       values ($1, $2, 'owner')`,
      [conta.contaId, candidato],
    ),
  ).rejects.toThrow(RECUSA_DE_RLS)

  await banco.comoUsuario(conta.usuarios.owner)
  const pelaMaoDoDono = await banco.sql.query<{ id: string }>(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner') returning id`,
    [conta.contaId, candidato],
  )
  expect(pelaMaoDoDono.rows).toHaveLength(1)
})

// Escrita em profiles --------------------------------------------------------

test('cada um edita o próprio perfil e não o do colega', async () => {
  const conta = await montarConta('Conta dos perfis')

  await banco.comoUsuario(conta.usuarios.admin)
  const proprio = await banco.sql.query<{ display_name: string }>(
    'update public.profiles set display_name = $1 where id = $2 returning display_name',
    ['Nome escolhido', conta.usuarios.admin],
  )
  expect(proprio.rows[0]?.display_name).toBe('Nome escolhido')

  const alheio = await banco.sql.query<{ id: string }>(
    'update public.profiles set display_name = $1 where id = $2 returning id',
    ['Apelido imposto', conta.usuarios.viewer],
  )
  expect(alheio.rows).toHaveLength(0)
})

// Viewer ---------------------------------------------------------------------

test('viewer não insere em nenhuma das três tabelas', async () => {
  const conta = await montarConta('Conta do observador')
  const forasteiro = await banco.criarUsuario('forasteiro@isolamento.test')

  await banco.comoUsuario(conta.usuarios.viewer)

  await expect(
    banco.sql.query('insert into public.accounts (name) values ($1)', [
      'Conta do viewer',
    ]),
  ).rejects.toThrow(RECUSA_DE_RLS)

  await expect(
    banco.sql.query(
      `insert into public.account_members (account_id, user_id, role)
       values ($1, $2, 'viewer')`,
      [conta.contaId, forasteiro],
    ),
  ).rejects.toThrow(RECUSA_DE_RLS)

  await expect(
    banco.sql.query('insert into public.profiles (id) values ($1)', [
      forasteiro,
    ]),
  ).rejects.toThrow(RECUSA_DE_RLS)
})

test('nenhuma política de insert se contenta com o vínculo: toda uma exige papel', async () => {
  const { rows } = await banco.sql.query<{
    tablename: string
    policyname: string
    cmd: string
    with_check: string | null
  }>(
    `select tablename, policyname, cmd, with_check
       from pg_policies
      where schemaname = 'public'
        and cmd in ('INSERT', 'ALL')
      order by tablename, policyname`,
  )

  expect(rows.length).toBeGreaterThan(0)
  for (const politica of rows) {
    expect(
      politica.with_check ?? '',
      `${politica.tablename}.${politica.policyname} abre insert sem has_role`,
    ).toMatch(/has_role/)
  }
})

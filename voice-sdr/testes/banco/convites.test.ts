// Convite de equipe: a tabela, as políticas e o RPC que resolve o token.
//
// O que se prova aqui é a parte que decide, e ela mora no banco. A função de
// borda invite-accept traduz o código em frase e tem testes próprios, sem
// banco, em supabase/functions/invite-accept/aceite.test.ts.
// Referência: docs/PRD.md RF-005 e docs/PRD-implementacao.md seções 3.1 e 4.4.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { hashDeToken } from '../../supabase/functions/_shared/token-de-convite.ts'
import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface ResultadoDoAceite {
  resultado: string
  conta_id: string | null
  conta_nome: string | null
  papel: string | null
}

let banco: BancoDeTeste

let contaA: string
let contaB: string
let ana: string // owner da conta A
let bruno: string // admin da conta A
let carla: string // operator da conta A
let dora: string // viewer da conta A
let elias: string // owner da conta B
let fabio: string // convidado, ainda sem conta

const EMAIL_CONVIDADO = 'fabio@transportes.com.br'

beforeAll(async () => {
  banco = await criarBancoDeTeste()

  contaA = await criarConta('Transportes Andrade')
  contaB = await criarConta('Logística Beira-Rio')

  ana = await vincular(contaA, 'ana@transportes.com.br', 'owner')
  bruno = await vincular(contaA, 'bruno@transportes.com.br', 'admin')
  carla = await vincular(contaA, 'carla@transportes.com.br', 'operator')
  dora = await vincular(contaA, 'dora@transportes.com.br', 'viewer')
  elias = await vincular(contaB, 'elias@beirario.com.br', 'owner')
  fabio = await banco.criarUsuario(EMAIL_CONVIDADO, 'Fábio')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
})

// Auxiliares -----------------------------------------------------------------

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
  email: string,
  papel: string,
): Promise<string> {
  const usuarioId = await banco.criarUsuario(email, email)
  await banco.sql.query(
    'insert into public.account_members (account_id, user_id, role) values ($1, $2, $3)',
    [contaId, usuarioId, papel],
  )
  return usuarioId
}

/** Convite preparado como serviço, fora do alcance das políticas. */
async function semearConvite(campos: {
  conta?: string
  email?: string
  papel?: string
  token?: string
  /** Convite emitido há mais de uma semana, cuja validade já passou. */
  expirado?: boolean
  revogado?: boolean
}): Promise<{ id: string; token: string }> {
  const token = campos.token ?? `token-${crypto.randomUUID()}`
  // `expires_at > created_at` vale para toda linha, então um convite vencido
  // não é um que nasce vencido: é um que nasceu antes e cuja validade passou.
  const nascimento = campos.expirado ? '8 days' : '0 days'
  const validade = campos.expirado ? '1 day' : '-7 days'
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.invitations
       (account_id, email, role, token_hash, created_at, expires_at, revoked_at, invited_by)
     values ($1, $2, $3, $4, now() - $5::interval, now() - $6::interval, $7, $8)
     returning id`,
    [
      campos.conta ?? contaA,
      campos.email ?? EMAIL_CONVIDADO,
      campos.papel ?? 'operator',
      await hashDeToken(token),
      nascimento,
      validade,
      campos.revogado ? new Date().toISOString() : null,
      ana,
    ],
  )
  const id = rows[0]?.id
  if (!id) throw new Error('Não foi possível semear o convite')
  return { id, token }
}

/** Sessão da chave de serviço, que é quem a função de borda usa. */
async function comoServicoRole(): Promise<void> {
  await banco.comoServico()
  await banco.sql.exec('set role service_role')
}

async function aceitar(token: string, usuarioId: string): Promise<ResultadoDoAceite> {
  await comoServicoRole()
  const { rows } = await banco.sql.query<ResultadoDoAceite>(
    'select * from public.aceitar_convite($1, $2)',
    [await hashDeToken(token), usuarioId],
  )
  const linha = rows[0]
  if (!linha) throw new Error('aceitar_convite não devolveu linha')
  return linha
}

async function papelNaConta(
  contaId: string,
  usuarioId: string,
): Promise<string | null> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ role: string }>(
    'select role from public.account_members where account_id = $1 and user_id = $2',
    [contaId, usuarioId],
  )
  return rows[0]?.role ?? null
}

async function limparConvites(): Promise<void> {
  await banco.comoServico()
  await banco.sql.query('delete from public.invitations')
}

async function desvincular(contaId: string, usuarioId: string): Promise<void> {
  await banco.comoServico()
  await banco.sql.query(
    'delete from public.account_members where account_id = $1 and user_id = $2',
    [contaId, usuarioId],
  )
}

// Tabela ---------------------------------------------------------------------

test('invitations tem as colunas que o PRD nomeia', async () => {
  const { rows } = await banco.sql.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_schema = 'public' and table_name = 'invitations'`,
  )
  const colunas = rows.map((linha) => linha.column_name)

  for (const esperada of [
    'account_id',
    'email',
    'role',
    'token_hash',
    'expires_at',
    'accepted_at',
    'invited_by',
  ]) {
    expect(colunas, `invitations sem ${esperada}`).toContain(esperada)
  }
})

test('o convite nasce pendente e com uma semana de validade', async () => {
  await limparConvites()
  const { id } = await semearConvite({})

  const { rows } = await banco.sql.query<{
    accepted_at: string | null
    accepted_by: string | null
    revoked_at: string | null
    dias: number
  }>(
    `select accepted_at, accepted_by, revoked_at,
            round(extract(epoch from (expires_at - now())) / 86400)::int as dias
       from public.invitations where id = $1`,
    [id],
  )

  expect(rows[0]?.accepted_at).toBeNull()
  expect(rows[0]?.accepted_by).toBeNull()
  expect(rows[0]?.revoked_at).toBeNull()
  expect(Number(rows[0]?.dias)).toBe(7)
})

test('papel fora dos quatro conhecidos é recusado', async () => {
  await limparConvites()
  await expect(semearConvite({ papel: 'gerente' })).rejects.toThrow(
    /violates check constraint/i,
  )
})

test('token_hash fora do formato de sha-256 é recusado', async () => {
  await limparConvites()
  await expect(
    banco.sql.query(
      `insert into public.invitations (account_id, email, role, token_hash)
       values ($1, $2, 'viewer', 'nao-e-um-hash')`,
      [contaA, EMAIL_CONVIDADO],
    ),
  ).rejects.toThrow(/violates check constraint/i)
})

test('o mesmo token não serve a dois convites', async () => {
  await limparConvites()
  const { token } = await semearConvite({})

  await expect(
    semearConvite({ token, email: 'outro@transportes.com.br' }),
  ).rejects.toThrow(/duplicate key|unique/i)
})

test('só existe um convite pendente por e-mail em cada conta', async () => {
  await limparConvites()
  await semearConvite({ email: 'Fabio@Transportes.com.br' })

  await expect(semearConvite({ email: EMAIL_CONVIDADO })).rejects.toThrow(
    /duplicate key|unique/i,
  )
})

test('revogar libera um convite novo para o mesmo e-mail', async () => {
  await limparConvites()
  await semearConvite({ revogado: true })

  await expect(semearConvite({})).resolves.toBeDefined()
})

test('a mesma pessoa pode ter convite pendente em duas contas', async () => {
  await limparConvites()
  await semearConvite({ conta: contaA })

  await expect(semearConvite({ conta: contaB })).resolves.toBeDefined()
})

test('aceito sem quem aceitou é estado impossível', async () => {
  await limparConvites()
  const { id } = await semearConvite({})

  await expect(
    banco.sql.query('update public.invitations set accepted_at = now() where id = $1', [
      id,
    ]),
  ).rejects.toThrow(/violates check constraint/i)
})

test('apagar a conta leva os convites dela junto', async () => {
  await limparConvites()
  const descartavel = await criarConta('Conta descartável')
  await banco.sql.query(
    `insert into public.invitations (account_id, email, role, token_hash)
     values ($1, $2, 'viewer', $3)`,
    [descartavel, 'zeca@transportes.com.br', await hashDeToken('descartavel')],
  )

  await banco.sql.query('delete from public.accounts where id = $1', [descartavel])

  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.invitations where account_id = $1',
    [descartavel],
  )
  expect(rows[0]?.total).toBe(0)
})

// Isolamento -----------------------------------------------------------------

test('membro lê os convites da própria conta e nenhum da vizinha', async () => {
  await limparConvites()
  await semearConvite({ conta: contaA })
  await semearConvite({ conta: contaB, email: 'gisele@beirario.com.br' })

  await banco.comoUsuario(dora)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.invitations',
  )

  expect(rows).toHaveLength(1)
  expect(rows[0]?.account_id).toBe(contaA)
})

test('sessão anônima não lê convite nenhum', async () => {
  await limparConvites()
  await semearConvite({})

  await banco.comoAnonimo()
  const { rows } = await banco.sql.query('select * from public.invitations')

  expect(rows).toHaveLength(0)
})

test('admin convida, em nome próprio', async () => {
  await limparConvites()
  await banco.comoUsuario(bruno)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.invitations (account_id, email, role, token_hash, invited_by)
     values ($1, $2, 'operator', $3, $4) returning id`,
    [contaA, 'novo@transportes.com.br', await hashDeToken('do-bruno'), bruno],
  )

  expect(rows).toHaveLength(1)
})

test('admin não convida em nome de outra pessoa', async () => {
  await limparConvites()
  await banco.comoUsuario(bruno)

  await expect(
    banco.sql.query(
      `insert into public.invitations (account_id, email, role, token_hash, invited_by)
       values ($1, $2, 'operator', $3, $4)`,
      [contaA, 'novo@transportes.com.br', await hashDeToken('de-quem'), ana],
    ),
  ).rejects.toThrow(/row-level security/i)
})

test('operator e viewer não convidam ninguém', async () => {
  await limparConvites()
  for (const usuario of [carla, dora]) {
    await banco.comoUsuario(usuario)
    await expect(
      banco.sql.query(
        `insert into public.invitations (account_id, email, role, token_hash, invited_by)
         values ($1, $2, 'viewer', $3, $4)`,
        [contaA, 'intruso@transportes.com.br', await hashDeToken(`t-${usuario}`), usuario],
      ),
    ).rejects.toThrow(/row-level security/i)
  }
})

test('admin de uma conta não convida para a conta vizinha', async () => {
  await limparConvites()
  await banco.comoUsuario(bruno)

  await expect(
    banco.sql.query(
      `insert into public.invitations (account_id, email, role, token_hash, invited_by)
       values ($1, $2, 'admin', $3, $4)`,
      [contaB, 'invasor@transportes.com.br', await hashDeToken('travessia'), bruno],
    ),
  ).rejects.toThrow(/row-level security/i)
})

test('convidar para owner é privilégio de owner', async () => {
  await limparConvites()
  await banco.comoUsuario(bruno)
  await expect(
    banco.sql.query(
      `insert into public.invitations (account_id, email, role, token_hash, invited_by)
       values ($1, $2, 'owner', $3, $4)`,
      [contaA, 'socio@transportes.com.br', await hashDeToken('do-admin'), bruno],
    ),
  ).rejects.toThrow(/row-level security/i)

  await banco.comoUsuario(ana)
  await expect(
    banco.sql.query(
      `insert into public.invitations (account_id, email, role, token_hash, invited_by)
       values ($1, $2, 'owner', $3, $4)`,
      [contaA, 'socio@transportes.com.br', await hashDeToken('da-owner'), ana],
    ),
  ).resolves.toBeDefined()
})

test('admin revoga o convite que existe; operator não', async () => {
  await limparConvites()
  const { id } = await semearConvite({})

  await banco.comoUsuario(carla)
  const recusado = await banco.sql.query(
    'update public.invitations set revoked_at = now() where id = $1 returning id',
    [id],
  )
  expect(recusado.rows).toHaveLength(0)

  await banco.comoUsuario(bruno)
  const aceito = await banco.sql.query(
    'update public.invitations set revoked_at = now() where id = $1 returning id',
    [id],
  )
  expect(aceito.rows).toHaveLength(1)
})

// Aceite ---------------------------------------------------------------------

test('convite válido cria o vínculo com o papel do convite', async () => {
  await limparConvites()
  await desvincular(contaA, fabio)
  const { token } = await semearConvite({ papel: 'operator' })

  const resultado = await aceitar(token, fabio)

  expect(resultado.resultado).toBe('aceito')
  expect(resultado.conta_id).toBe(contaA)
  expect(resultado.conta_nome).toBe('Transportes Andrade')
  expect(resultado.papel).toBe('operator')
  await expect(papelNaConta(contaA, fabio)).resolves.toBe('operator')
})

test('o aceite marca o convite como consumido, com quem consumiu', async () => {
  await limparConvites()
  await desvincular(contaA, fabio)
  const { id, token } = await semearConvite({})

  await aceitar(token, fabio)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    accepted_at: string | null
    accepted_by: string | null
  }>('select accepted_at, accepted_by from public.invitations where id = $1', [id])

  expect(rows[0]?.accepted_at).not.toBeNull()
  expect(rows[0]?.accepted_by).toBe(fabio)
})

test('o segundo clique no mesmo link devolve ja_aceito e não duplica vínculo', async () => {
  await limparConvites()
  await desvincular(contaA, fabio)
  const { token } = await semearConvite({})

  await aceitar(token, fabio)
  const segunda = await aceitar(token, fabio)

  expect(segunda.resultado).toBe('ja_aceito')
  expect(segunda.conta_id).toBeNull()

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.account_members where account_id = $1 and user_id = $2',
    [contaA, fabio],
  )
  expect(rows[0]?.total).toBe(1)
})

test('convite expirado não cria vínculo', async () => {
  await limparConvites()
  await desvincular(contaA, fabio)
  const { token } = await semearConvite({ expirado: true })

  const resultado = await aceitar(token, fabio)

  expect(resultado.resultado).toBe('expirado')
  await expect(papelNaConta(contaA, fabio)).resolves.toBeNull()
})

test('convite revogado não cria vínculo', async () => {
  await limparConvites()
  await desvincular(contaA, fabio)
  const { token } = await semearConvite({ revogado: true })

  const resultado = await aceitar(token, fabio)

  expect(resultado.resultado).toBe('revogado')
  await expect(papelNaConta(contaA, fabio)).resolves.toBeNull()
})

test('token que não existe devolve nao_encontrado', async () => {
  await limparConvites()
  await desvincular(contaA, fabio)

  const resultado = await aceitar('token-que-ninguem-emitiu', fabio)

  expect(resultado.resultado).toBe('nao_encontrado')
  await expect(papelNaConta(contaA, fabio)).resolves.toBeNull()
})

test('o link repassado a outro e-mail não vale', async () => {
  await limparConvites()
  await desvincular(contaA, fabio)
  const { token } = await semearConvite({ email: 'outra.pessoa@transportes.com.br' })

  const resultado = await aceitar(token, fabio)

  expect(resultado.resultado).toBe('email_divergente')
  await expect(papelNaConta(contaA, fabio)).resolves.toBeNull()
})

test('caixa e espaço no e-mail do convite não impedem o aceite', async () => {
  await limparConvites()
  await desvincular(contaA, fabio)
  const { token } = await semearConvite({ email: '  FABIO@Transportes.COM.BR ' })

  await expect(aceitar(token, fabio)).resolves.toMatchObject({ resultado: 'aceito' })
})

test('quem já é membro mantém o papel que tinha', async () => {
  await limparConvites()
  await desvincular(contaA, fabio)
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'admin')`,
    [contaA, fabio],
  )
  const { token } = await semearConvite({ papel: 'viewer' })

  const resultado = await aceitar(token, fabio)

  expect(resultado.resultado).toBe('ja_membro')
  expect(resultado.papel).toBe('admin')
  await expect(papelNaConta(contaA, fabio)).resolves.toBe('admin')
})

test('usuário que não existe não aceita convite', async () => {
  await limparConvites()
  await semearConvite({})

  const resultado = await aceitar(
    'qualquer-token',
    '99999999-9999-4999-8999-999999999999',
  )

  expect(resultado.resultado).toBe('usuario_desconhecido')
})

test('o convite de uma conta não vincula ninguém à outra', async () => {
  await limparConvites()
  await desvincular(contaA, fabio)
  await desvincular(contaB, fabio)
  const { token } = await semearConvite({ conta: contaB, papel: 'viewer' })

  await aceitar(token, fabio)

  await expect(papelNaConta(contaB, fabio)).resolves.toBe('viewer')
  await expect(papelNaConta(contaA, fabio)).resolves.toBeNull()
})

// Alcance da função ----------------------------------------------------------

test('aceitar_convite é security definer e volátil', async () => {
  const { rows } = await banco.sql.query<{
    provolatile: string
    prosecdef: boolean
  }>(
    `select p.provolatile, p.prosecdef
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'aceitar_convite'`,
  )

  expect(rows).toHaveLength(1)
  expect(rows[0]?.prosecdef, 'o convidado ainda não tem papel na conta').toBe(true)
  expect(rows[0]?.provolatile, 'a função escreve, então é volatile').toBe('v')
})

test('só service_role executa aceitar_convite', async () => {
  const { rows } = await banco.sql.query<{ papel: string }>(
    `select grantee as papel
       from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name = 'aceitar_convite'
        and privilege_type = 'EXECUTE'`,
  )
  const papeis = rows.map((linha) => linha.papel)

  expect(papeis).toContain('service_role')
  expect(papeis, 'a função escolhe o usuário por parâmetro').not.toContain('PUBLIC')
  expect(papeis).not.toContain('anon')
  expect(papeis).not.toContain('authenticated')
})

test('a sessão autenticada esbarra na função antes de se vincular sozinha', async () => {
  await limparConvites()
  const { token } = await semearConvite({ conta: contaB, papel: 'owner' })

  await banco.comoUsuario(elias)
  await expect(
    banco.sql.query('select * from public.aceitar_convite($1, $2)', [
      await hashDeToken(token),
      elias,
    ]),
  ).rejects.toThrow(/permission denied/i)
})

test('o hash que a borda calcula é o que a coluna guarda', async () => {
  await limparConvites()
  const { id, token } = await semearConvite({})

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ token_hash: string }>(
    'select token_hash from public.invitations where id = $1',
    [id],
  )

  expect(rows[0]?.token_hash).toBe(await hashDeToken(token))
  expect(rows[0]?.token_hash, 'o token em claro não vive no banco').not.toBe(token)
})

// Cofre de credenciais: a promessa é "o valor nunca volta para o navegador", e
// uma promessa dessas só vale se o teste tentar quebrá-la de todos os lados que
// existem. São três: ler a tabela, chamar a função de leitura, e olhar o que a
// listagem devolve.
// Referência: docs/PRD.md RF-007 e docs/PRD-implementacao.md seções 3.9 e 8.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  UUID,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** Valor que nenhuma sessão de cliente pode ver em lugar nenhum. */
const CHAVE = 'el-chave-secreta-da-conta-a-0123456789'
const CHAVE_NOVA = 'el-chave-secreta-trocada-9876543210'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly adminId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await montarConta('A')
  contaB = await montarConta('B')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.account_secrets')
  await banco.sql.query('delete from vault.secrets')
})

async function montarConta(rotulo: string): Promise<Conta> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [`Conta ${rotulo}`],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`Não foi possível criar a conta ${rotulo}`)

  const donoId = await banco.criarUsuario(
    `dono.${rotulo.toLowerCase()}@cofre.test`,
    `Dono ${rotulo}`,
  )
  const adminId = await banco.criarUsuario(
    `admin.${rotulo.toLowerCase()}@cofre.test`,
    `Admin ${rotulo}`,
  )
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'admin')`,
    [id, donoId, adminId],
  )

  return { id, donoId, adminId }
}

/**
 * Papel `service_role`, e não o superusuário. `comoServico()` volta a postgres,
 * que passa por cima de grant e de RLS — e um teste de grant contra postgres
 * passaria mesmo com o grant ausente. Aqui o papel é o da borda de verdade.
 */
async function comoBorda(): Promise<void> {
  await banco.comoServico()
  await banco.sql.exec('set role service_role')
}

async function gravar(
  conta: Conta,
  provider: string,
  keyName: string,
  valor: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'select public.set_account_secret($1, $2, $3, $4, $5::jsonb) as id',
    [conta.id, provider, keyName, valor, JSON.stringify(metadata)],
  )
  const id = rows[0]?.id
  if (!id) throw new Error('set_account_secret não devolveu id')
  return id
}

async function ler(
  conta: Conta,
  provider: string,
  keyName: string,
): Promise<string | null> {
  const { rows } = await banco.sql.query<{ valor: string | null }>(
    'select public.get_account_secret($1, $2, $3) as valor',
    [conta.id, provider, keyName],
  )
  return rows[0]?.valor ?? null
}

// Estrutura -------------------------------------------------------------------

test('a tabela guarda ponteiro e metadado, e é única por conta, provedor e chave', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    account_id: string
    provider: string
    key_name: string
    secret_id: string
    metadata: Record<string, unknown>
  }>('select * from public.account_secrets')

  expect(rows).toHaveLength(1)
  expect(rows[0]?.secret_id).toMatch(UUID)
  expect(rows[0]?.metadata).toEqual({})

  await expect(
    banco.sql.query(
      `insert into public.account_secrets (account_id, provider, key_name, secret_id)
       values ($1, 'elevenlabs', 'api_key', gen_random_uuid())`,
      [contaA.id],
    ),
  ).rejects.toThrow(/duplicate key|unique/i)
})

test('nenhuma coluna da tabela carrega o valor da credencial', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE, { sufixo: '6789' })

  await banco.comoServico()
  const { rows } = await banco.sql.query<Record<string, unknown>>(
    'select * from public.account_secrets',
  )
  const linha = rows[0]
  expect(linha).toBeDefined()
  expect(
    JSON.stringify(linha),
    'o valor apareceu numa coluna de account_secrets; ele pertence ao Vault',
  ).not.toContain(CHAVE)
})

test('account_secrets tem RLS ligada e nenhuma política, para papel nenhum', async () => {
  await banco.comoServico()
  const { rows: tabela } = await banco.sql.query<{ relrowsecurity: boolean }>(
    `select c.relrowsecurity
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'account_secrets'`,
  )
  expect(tabela[0]?.relrowsecurity).toBe(true)

  const { rows: politicas } = await banco.sql.query<{ policyname: string }>(
    `select policyname from pg_policies
      where schemaname = 'public' and tablename = 'account_secrets'`,
  )
  expect(
    politicas.map((linha) => linha.policyname),
    'política de cliente em account_secrets: a classe Dono não tem leitura por ' +
      'ninguém, e o valor sai só por get_account_secret',
  ).toEqual([])
})

test('apagar a conta leva junto a credencial dela', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    "insert into public.accounts (name) values ('Conta efêmera') returning id",
  )
  const contaId = rows[0]?.id ?? ''
  const usuarioId = await banco.criarUsuario('dono.c@cofre.test', 'Dono C')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner')`,
    [contaId, usuarioId],
  )

  await banco.comoUsuario(usuarioId)
  await gravar({ id: contaId, donoId: usuarioId, adminId: '' }, 'twilio', 'auth_token', CHAVE)

  await banco.comoServico()
  await banco.sql.query('delete from public.accounts where id = $1', [contaId])
  const { rows: sobrou } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.account_secrets where account_id = $1',
    [contaId],
  )
  expect(sobrou[0]?.total).toBe(0)
})

// Escrita ---------------------------------------------------------------------

test('o dono grava e o valor vai para o Vault, não para a tabela', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ secret: string }>(
    `select v.decrypted_secret as secret
       from public.account_secrets as s
       join vault.decrypted_secrets as v on v.id = s.secret_id`,
  )
  expect(rows[0]?.secret).toBe(CHAVE)
})

test('provedor e chave são normalizados para minúsculas e sem espaços', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, '  ElevenLabs ', ' API_Key ', CHAVE)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    provider: string
    key_name: string
  }>('select provider, key_name from public.account_secrets')
  expect(rows[0]).toEqual({ provider: 'elevenlabs', key_name: 'api_key' })
})

test('gravar de novo troca o valor e mantém o mesmo ponteiro', async () => {
  await banco.comoUsuario(contaA.donoId)
  const primeiro = await gravar(contaA, 'elevenlabs', 'api_key', CHAVE)

  await banco.comoServico()
  const { rows: antes } = await banco.sql.query<{ secret_id: string }>(
    'select secret_id from public.account_secrets',
  )

  await banco.comoUsuario(contaA.donoId)
  const segundo = await gravar(contaA, 'elevenlabs', 'api_key', CHAVE_NOVA, {
    sufixo: '3210',
  })
  expect(segundo).toBe(primeiro)

  await banco.comoServico()
  const { rows: depois } = await banco.sql.query<{
    secret_id: string
    metadata: Record<string, unknown>
    secret: string
  }>(
    `select s.secret_id, s.metadata, v.decrypted_secret as secret
       from public.account_secrets as s
       join vault.decrypted_secrets as v on v.id = s.secret_id`,
  )

  expect(depois).toHaveLength(1)
  expect(depois[0]?.secret_id).toBe(antes[0]?.secret_id)
  expect(depois[0]?.secret).toBe(CHAVE_NOVA)
  expect(depois[0]?.metadata).toEqual({ sufixo: '3210' })
})

test('admin não grava no cofre: a classe Dono é do owner', async () => {
  await banco.comoUsuario(contaA.adminId)
  await expect(gravar(contaA, 'elevenlabs', 'api_key', CHAVE)).rejects.toThrow(
    /dono/i,
  )
})

test('o dono de uma conta não grava no cofre da outra', async () => {
  await banco.comoUsuario(contaA.donoId)
  await expect(gravar(contaB, 'elevenlabs', 'api_key', CHAVE)).rejects.toThrow(
    /dono/i,
  )
})

test('sessão anônima não grava', async () => {
  await banco.comoAnonimo()
  await expect(gravar(contaA, 'elevenlabs', 'api_key', CHAVE)).rejects.toThrow()
})

test('valor vazio é recusado, para a cascata não parar numa credencial oca', async () => {
  await banco.comoUsuario(contaA.donoId)
  await expect(
    gravar(contaA, 'elevenlabs', 'api_key', '   '),
  ).rejects.toThrow(/vazio/i)
})

test('provedor em branco é recusado', async () => {
  await banco.comoUsuario(contaA.donoId)
  await expect(gravar(contaA, ' ', 'api_key', CHAVE)).rejects.toThrow(
    /obrigatóri/i,
  )
})

// Listagem ---------------------------------------------------------------------

test('a listagem devolve metadado e nenhuma coluna de valor', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'twilio', 'auth_token', CHAVE, { sufixo: '6789' })
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE_NOVA)

  const { rows } = await banco.sql.query<Record<string, unknown>>(
    'select * from public.list_account_secrets($1)',
    [contaA.id],
  )

  expect(rows).toHaveLength(2)
  expect(rows.map((linha) => linha['provider'])).toEqual([
    'elevenlabs',
    'twilio',
  ])
  expect(rows[1]).toMatchObject({
    key_name: 'auth_token',
    metadata: { sufixo: '6789' },
    updated_by_nome: 'Dono A',
  })
  expect(
    JSON.stringify(rows),
    'a listagem trouxe o valor da credencial; ela é só metadado',
  ).not.toContain(CHAVE)
  expect(JSON.stringify(rows)).not.toContain(CHAVE_NOVA)
})

test('a assinatura de list_account_secrets não tem coluna de segredo', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ colunas: string[] }>(
    `select p.proargnames as colunas
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'list_account_secrets'`,
  )
  const colunas = rows[0]?.colunas ?? []
  expect(colunas).toContain('provider')
  expect(
    colunas.filter((nome) => /secret|valor|value|token|chave/i.test(nome)),
    'coluna de valor na assinatura da listagem: a garantia deixaria de ser ' +
      'estrutural e passaria a depender de quem escreve a consulta',
  ).toEqual([])
})

test('admin não lista o cofre', async () => {
  await banco.comoUsuario(contaA.adminId)
  await expect(
    banco.sql.query('select * from public.list_account_secrets($1)', [contaA.id]),
  ).rejects.toThrow(/dono/i)
})

test('o dono da conta A não lista o cofre da conta B', async () => {
  await banco.comoUsuario(contaA.donoId)
  await expect(
    banco.sql.query('select * from public.list_account_secrets($1)', [contaB.id]),
  ).rejects.toThrow(/dono/i)
})

// Exclusão ---------------------------------------------------------------------

test('apagar remove o metadado e o segredo do Vault', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE)

  const { rows } = await banco.sql.query<{ apagou: boolean }>(
    "select public.delete_account_secret($1, 'ElevenLabs', 'API_KEY') as apagou",
    [contaA.id],
  )
  expect(rows[0]?.apagou).toBe(true)

  await banco.comoServico()
  const { rows: restos } = await banco.sql.query<{
    metadados: number
    segredos: number
  }>(
    `select (select count(*)::int from public.account_secrets) as metadados,
            (select count(*)::int from vault.secrets) as segredos`,
  )
  expect(restos[0]).toEqual({ metadados: 0, segredos: 0 })
})

test('apagar chave que não existe devolve falso, sem erro', async () => {
  await banco.comoUsuario(contaA.donoId)
  const { rows } = await banco.sql.query<{ apagou: boolean }>(
    "select public.delete_account_secret($1, 'twilio', 'auth_token') as apagou",
    [contaA.id],
  )
  expect(rows[0]?.apagou).toBe(false)
})

test('admin não apaga do cofre', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE)

  await banco.comoUsuario(contaA.adminId)
  await expect(
    banco.sql.query(
      "select public.delete_account_secret($1, 'elevenlabs', 'api_key')",
      [contaA.id],
    ),
  ).rejects.toThrow(/dono/i)
})

// O que o navegador alcança ------------------------------------------------------

test('o dono não lê a tabela: RLS sem política nega até para ele', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE)

  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.account_secrets',
  )
  expect(
    rows[0]?.total,
    'a tabela do cofre ficou legível pelo cliente; ela não tem política e não ' +
      'deve ter',
  ).toBe(0)
})

test('sessão anônima também não lê a tabela', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE)

  await banco.comoAnonimo()
  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.account_secrets',
  )
  expect(rows[0]?.total).toBe(0)
})

test('o dono não chama get_account_secret: a porta do valor é só do servidor', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE)

  await expect(ler(contaA, 'elevenlabs', 'api_key')).rejects.toThrow(
    /permission denied/i,
  )
})

test('sessão anônima não chama get_account_secret', async () => {
  await banco.comoAnonimo()
  await expect(ler(contaA, 'elevenlabs', 'api_key')).rejects.toThrow(
    /permission denied/i,
  )
})

test('a função de servidor lê o valor em claro', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE)

  await comoBorda()
  await expect(ler(contaA, 'elevenlabs', 'api_key')).resolves.toBe(CHAVE)
})

test('a função de servidor não pega a chave da conta vizinha pelo mesmo nome', async () => {
  await banco.comoUsuario(contaA.donoId)
  await gravar(contaA, 'elevenlabs', 'api_key', CHAVE)
  await banco.comoUsuario(contaB.donoId)
  await gravar(contaB, 'elevenlabs', 'api_key', CHAVE_NOVA)

  await comoBorda()
  await expect(ler(contaA, 'elevenlabs', 'api_key')).resolves.toBe(CHAVE)
  await expect(ler(contaB, 'elevenlabs', 'api_key')).resolves.toBe(CHAVE_NOVA)
})

test('chave ausente devolve nulo para o servidor, e não erro', async () => {
  await comoBorda()
  await expect(ler(contaA, 'openai', 'api_key')).resolves.toBeNull()
})

// Grants -------------------------------------------------------------------------

test('as quatro funções são security definer com search_path fixado', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    proname: string
    prosecdef: boolean
    proconfig: string[] | null
  }>(
    `select p.proname, p.prosecdef, p.proconfig
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('set_account_secret', 'list_account_secrets',
                          'delete_account_secret', 'get_account_secret')
      order by p.proname`,
  )

  expect(rows).toHaveLength(4)
  for (const linha of rows) {
    expect(linha.prosecdef, `${linha.proname} não é security definer`).toBe(true)
    expect(linha.proconfig, `${linha.proname} sem search_path fixado`).toContain(
      'search_path=""',
    )
  }
})

test('o valor só sai por get_account_secret, e só service_role a executa', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ papel: string }>(
    `select grantee as papel
       from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name = 'get_account_secret'
        and privilege_type = 'EXECUTE'`,
  )
  const papeis = rows.map((linha) => linha.papel)

  expect(papeis).toContain('service_role')
  expect(papeis).not.toContain('PUBLIC')
  expect(
    papeis,
    'authenticated executa a função que devolve a credencial em claro',
  ).not.toContain('authenticated')
  expect(papeis).not.toContain('anon')
})

test('set, list e delete são de cliente autenticado e não do papel public', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ funcao: string; papel: string }>(
    `select routine_name as funcao, grantee as papel
       from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name in ('set_account_secret', 'list_account_secrets',
                             'delete_account_secret')
        and privilege_type = 'EXECUTE'`,
  )

  for (const funcao of [
    'set_account_secret',
    'list_account_secrets',
    'delete_account_secret',
  ]) {
    const papeis = rows
      .filter((linha) => linha.funcao === funcao)
      .map((linha) => linha.papel)
    expect(papeis, `${funcao} sem grant para authenticated`).toContain(
      'authenticated',
    )
    expect(papeis, `${funcao} ainda concedida a public`).not.toContain('PUBLIC')
    expect(papeis, `${funcao} exposta a anon`).not.toContain('anon')
  }
})

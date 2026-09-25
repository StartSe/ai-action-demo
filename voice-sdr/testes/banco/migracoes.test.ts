// O auxiliar de banco funciona: sobe Postgres em memória, aplica as migrações
// do zero e entrega uma sessão em que auth.uid() responde. É o alicerce dos
// testes de isolamento das histórias seguintes. O que cada migração cria se
// verifica no arquivo dela — conta e acesso está em conta-e-acesso.test.ts.
//
// É também o ponto de checagem das migrações da F0 à F5 juntas (RNF-14):
// banco vazio, todas elas em ordem, e a lista aplicada conferida contra o que
// está no disco.
// `criarBancoDeTeste` levanta erro na primeira que quebrar, com o nome do
// arquivo; a conferência contra o diretório pega o caso oposto, o da migração
// que ninguém aplicou e ninguém notou.

import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste

beforeAll(async () => {
  banco = await criarBancoDeTeste()
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

/** Todo `.sql` de supabase/migrations, em ordem de nome. */
async function migracoesNoDisco(): Promise<string[]> {
  const pasta = fileURLToPath(new URL('../../supabase/migrations', import.meta.url))
  const arquivos = await readdir(pasta)
  return arquivos.filter((nome) => nome.endsWith('.sql')).sort()
}

/** As tabelas de `public` que sobraram depois das migrações. */
async function tabelasDePublic(): Promise<string[]> {
  const { rows } = await banco.sql.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  )
  return rows.map((linha) => linha.table_name)
}

test('aplica todas as migrações de supabase/migrations em banco vazio', () => {
  expect(banco.migracoesAplicadas.length).toBeGreaterThan(0)
  expect([...banco.migracoesAplicadas]).toEqual(
    [...banco.migracoesAplicadas].sort(),
  )
})

test('nenhuma migração do disco ficou de fora da aplicação', async () => {
  expect(
    [...banco.migracoesAplicadas],
    'a lista aplicada divergiu de supabase/migrations: ou uma migração nova ' +
      'não está sendo lida, ou uma foi removida sem que o teste soubesse',
  ).toEqual(await migracoesNoDisco())
})

test('as tabelas de conta e acesso existem depois das migrações', async () => {
  const tabelas = await tabelasDePublic()

  expect(tabelas).toContain('accounts')
  expect(tabelas).toContain('profiles')
  expect(tabelas).toContain('account_members')
})

test('as tabelas da F1 existem depois das migrações', async () => {
  const tabelas = await tabelasDePublic()

  for (const tabela of ['pipelines', 'pipeline_stages', 'leads', 'lead_events']) {
    expect(tabelas, `${tabela} não sobreviveu à aplicação das migrações`).toContain(
      tabela,
    )
  }
})

test('as tabelas da F2 existem depois das migrações', async () => {
  const tabelas = await tabelasDePublic()

  for (const tabela of [
    'agents',
    'agent_publications',
    'playbooks',
    'playbook_versions',
    'knowledge_entries',
    'account_settings',
    'account_test_numbers',
    'phone_lines',
    'dnc_entries',
    'consent_records',
    'calls',
    'call_attempts',
    'call_costs',
    'call_tool_invocations',
    'call_live',
    'dial_queue',
    'job_runs',
    'integration_events',
    'app_config',
  ]) {
    expect(tabelas, `${tabela} não sobreviveu à aplicação das migrações`).toContain(
      tabela,
    )
  }
})

test('as tabelas e colunas da F4 existem depois das migrações', async () => {
  expect(await tabelasDePublic()).toContain('evaluation_criteria')

  const { rows } = await banco.sql.query<{ coluna: string }>(
    `select table_name || '.' || column_name as coluna
       from information_schema.columns
      where table_schema = 'public'`,
  )
  const colunas = rows.map((linha) => linha.coluna)

  for (const coluna of [
    'account_settings.sentiment_floor',
    'account_settings.consecutive_failures_cap',
    'account_settings.failed_criteria_cap',
    'calls.classification_confidence',
    'calls.classification_corrected_at',
    'calls.classification_corrected_by',
    'calls.sentiment_source',
    'exception_items.deduplicacao_key',
    'exception_items.threshold_snapshot',
  ]) {
    expect(colunas, `${coluna} não sobreviveu à aplicação das migrações`).toContain(
      coluna,
    )
  }
})

test('as tabelas da F5 existem depois das migrações', async () => {
  const tabelas = await tabelasDePublic()

  for (const tabela of [
    'specialists',
    'specialist_availability',
    'specialist_blocks',
    'specialist_calendars',
    'specialist_busy_blocks',
    'meetings',
    'call_slot_offers',
  ]) {
    expect(tabelas, `${tabela} não sobreviveu à aplicação das migrações`).toContain(
      tabela,
    )
  }
})

test('btree_gist está instalado e a exclusão de meetings é de gist', async () => {
  // A ressalva de docs/PRD-implementacao.md seção 9 já disse que o PGlite não
  // tinha btree_gist. Vale o que este teste mede: sem a extensão, a restrição
  // de meetings nem se criaria, e a prova do 23P01 em processo cairia.
  const { rows: extensoes } = await banco.sql.query<{ extname: string }>(
    `select extname from pg_extension where extname = 'btree_gist'`,
  )
  expect(extensoes).toHaveLength(1)

  const { rows: restricoes } = await banco.sql.query<{ definicao: string }>(
    `select pg_get_constraintdef(oid) as definicao
       from pg_constraint
      where conname = 'meetings_sem_sobreposicao' and contype = 'x'`,
  )
  expect(restricoes[0]?.definicao).toMatch(/^EXCLUDE USING gist/)
})

test('auth.uid() devolve o usuário da sessão e null fora dela', async () => {
  const usuarioId = await banco.criarUsuario('ana@exemplo.test', 'Ana')

  await banco.comoUsuario(usuarioId)
  const autenticado = await banco.sql.query<{ uid: string | null }>(
    'select auth.uid() as uid',
  )
  expect(autenticado.rows[0]?.uid).toBe(usuarioId)

  await banco.comoAnonimo()
  const anonimo = await banco.sql.query<{ uid: string | null }>(
    'select auth.uid() as uid',
  )
  expect(anonimo.rows[0]?.uid).toBeNull()

  await banco.comoServico()
})

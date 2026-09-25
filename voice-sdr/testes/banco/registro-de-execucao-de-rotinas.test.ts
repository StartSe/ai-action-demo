// O registro de execução de rotina como contrato SQL (US-186, L-13, RF-613).
//
// O que este arquivo prova:
//
// 1. **Quem escreve em `job_runs` é a rotina.** `authenticated` não insere
//    (a tabela não tem política de escrita) e recebe `permission denied` ao
//    chamar as duas funções; `service_role` as executa. A sabotagem que cria
//    uma política de insert derruba o primeiro caso.
// 2. **O relógio vem de quem chama.** `p_agora` é o início e o fim gravados,
//    sem `now()`: é o que deixa as rotinas da F6 provarem o registro com
//    relógio controlado.
// 3. **A linha se fecha uma vez.** A segunda chamada de fechar levanta 55000 e
//    não reescreve o erro da primeira; id inexistente levanta P0002. Erro em
//    branco não vira sucesso.
// 4. **Cada conta lê só as próprias execuções**, pelos dois lados, com as
//    linhas criadas pelas funções e não por insert direto.
// 5. **O índice por conta** existe com as colunas na ordem declarada, e o
//    decrescente no início.
//
// Referência: migração 20261010100000_registro_de_execucao.sql,
// docs/PRD-implementacao.md seções 3.8, 3.9 e 4.6, docs/PRD.md RF-613.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly donoId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

const INICIO = '2026-10-10T12:00:00.000Z'
const FIM = '2026-10-10T12:00:07.000Z'

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner')`,
    [id, donoId],
  )
  return { id, donoId }
}

/** Passa a sessão para `service_role`, que é quem as rotinas usam. */
async function comoRotina(): Promise<void> {
  await banco.comoServico()
  await banco.sql.query('set role service_role')
}

async function abrir(conta: string | null, rotina: string, agora = INICIO): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'select public.abrir_execucao_de_rotina($1, $2, $3) as id',
    [conta, rotina, agora],
  )
  return rows[0]!.id
}

async function fechar(
  execucao: string,
  itens: number,
  erro: string | null,
  agora = FIM,
): Promise<void> {
  await banco.sql.query('select public.fechar_execucao_de_rotina($1, $2, $3, $4)', [
    execucao,
    itens,
    erro,
    agora,
  ])
}

interface Linha {
  readonly account_id: string | null
  readonly routine: string
  readonly started_at: Date
  readonly finished_at: Date | null
  readonly items: number
  readonly error: string | null
  readonly volume_alert: boolean
}

async function ler(id: string): Promise<Linha | undefined> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<Linha>(
    `select account_id, routine, started_at, finished_at, items, error, volume_alert
       from public.job_runs where id = $1`,
    [id],
  )
  return rows[0]
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
  await banco.sql.query('delete from public.job_runs')
})

// Quem escreve ----------------------------------------------------------------

test('authenticated não insere em job_runs: não há política de escrita', async () => {
  await banco.comoUsuario(contaA.donoId)
  await expect(
    banco.sql.query(
      `insert into public.job_runs (account_id, routine) values ($1, 'cron-cadence')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)
  await banco.comoServico()

  const { rows } = await banco.sql.query<{ politica: string; comando: string }>(
    `select policyname as politica, cmd as comando
       from pg_policies
      where schemaname = 'public' and tablename = 'job_runs'`,
  )
  expect(rows).toEqual([{ politica: 'job_runs_leitura_de_membro', comando: 'SELECT' }])
})

test.each([
  ['abrir_execucao_de_rotina', `select public.abrir_execucao_de_rotina(null, 'cron-cadence', now())`],
  [
    'fechar_execucao_de_rotina',
    `select public.fechar_execucao_de_rotina(gen_random_uuid(), 0, null, now())`,
  ],
])('authenticated recebe permission denied ao chamar %s', async (_nome, comando) => {
  await banco.comoUsuario(contaA.donoId)
  await expect(banco.sql.query(comando)).rejects.toThrow(/permission denied/i)
  await banco.comoServico()
})

test('anon também não executa as funções', async () => {
  await banco.comoAnonimo()
  await expect(
    banco.sql.query(`select public.abrir_execucao_de_rotina(null, 'cron-cadence', now())`),
  ).rejects.toThrow(/permission denied/i)
  await banco.comoServico()
})

test('só service_role tem execução nas duas funções, pelo catálogo', async () => {
  const { rows } = await banco.sql.query<{ funcao: string; papel: string }>(
    `select routine_name as funcao, grantee as papel
       from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name in ('abrir_execucao_de_rotina', 'fechar_execucao_de_rotina')
        and privilege_type = 'EXECUTE'
        and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
      order by routine_name, grantee`,
  )
  expect(rows).toEqual([
    { funcao: 'abrir_execucao_de_rotina', papel: 'service_role' },
    { funcao: 'fechar_execucao_de_rotina', papel: 'service_role' },
  ])

  const { rows: definicoes } = await banco.sql.query<{ definer: boolean; config: string[] }>(
    `select prosecdef as definer, proconfig as config
       from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname in ('abrir_execucao_de_rotina', 'fechar_execucao_de_rotina')`,
  )
  expect(definicoes).toHaveLength(2)
  for (const definicao of definicoes) {
    expect(definicao.definer).toBe(true)
    expect(definicao.config).toContain('search_path=""')
  }
})

// O relógio de quem chama -----------------------------------------------------

test('service_role abre e fecha com o relógio do parâmetro', async () => {
  await comoRotina()
  const id = await abrir(contaA.id, 'cron-meeting-reminder')
  const aberta = await ler(id)
  expect(aberta?.started_at.toISOString()).toBe(INICIO)
  expect(aberta?.finished_at).toBeNull()

  await comoRotina()
  await fechar(id, 3, null)
  const fechada = await ler(id)
  expect(fechada).toMatchObject({
    account_id: contaA.id,
    routine: 'cron-meeting-reminder',
    items: 3,
    error: null,
    volume_alert: false,
  })
  expect(fechada?.finished_at?.toISOString()).toBe(FIM)
})

test('a passagem da instalação abre com conta nula', async () => {
  await comoRotina()
  const id = await abrir(null, 'cron-cadence')
  expect((await ler(id))?.account_id).toBeNull()
})

test('p_agora nulo é recusado: o relógio não cai em now() calado', async () => {
  await comoRotina()
  await expect(abrir(contaA.id, 'cron-cadence', null as unknown as string)).rejects.toThrow(
    /p_agora é obrigatório/,
  )
  await banco.comoServico()
})

test('rotina em branco é recusada pelo check da tabela', async () => {
  await comoRotina()
  await expect(abrir(contaA.id, '   ')).rejects.toThrow(/job_runs_routine_check/)
  await banco.comoServico()
})

test('o fim antes do início é recusado', async () => {
  await comoRotina()
  const id = await abrir(contaA.id, 'cron-cadence')
  await expect(fechar(id, 0, null, '2026-10-10T11:59:59.000Z')).rejects.toThrow(
    /job_runs_check/,
  )
  await banco.comoServico()
})

// Fecha uma vez ---------------------------------------------------------------

test('a execução que estoura grava a mensagem e o fim', async () => {
  await comoRotina()
  const id = await abrir(contaA.id, 'cron-cadence')
  await comoRotina()
  await fechar(id, 2, 'o provedor recusou o envio')
  const linha = await ler(id)
  expect(linha?.error).toBe('o provedor recusou o envio')
  expect(linha?.items).toBe(2)
  expect(linha?.finished_at?.toISOString()).toBe(FIM)
})

test('erro em branco não vira sucesso', async () => {
  await comoRotina()
  const id = await abrir(contaA.id, 'cron-cadence')
  await comoRotina()
  await fechar(id, 0, '  ')
  expect((await ler(id))?.error).toBe('erro sem mensagem')
})

test('fechar de novo levanta 55000 e não apaga o erro da primeira', async () => {
  await comoRotina()
  const id = await abrir(contaA.id, 'cron-cadence')
  await comoRotina()
  await fechar(id, 1, 'caiu no meio')

  await comoRotina()
  await expect(fechar(id, 5, null)).rejects.toMatchObject({ code: '55000' })

  const linha = await ler(id)
  expect(linha?.error).toBe('caiu no meio')
  expect(linha?.items).toBe(1)
})

test('fechar execução que não existe levanta P0002', async () => {
  await comoRotina()
  await expect(
    fechar('00000000-0000-4000-8000-000000000000', 0, null),
  ).rejects.toMatchObject({ code: 'P0002' })
  await banco.comoServico()
})

test('duas execuções em sequência são duas linhas', async () => {
  for (let vez = 0; vez < 2; vez += 1) {
    await comoRotina()
    const id = await abrir(contaA.id, 'cron-cadence')
    await comoRotina()
    await fechar(id, vez === 0 ? 4 : 0, null)
  }
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ items: number }>(
    `select items from public.job_runs where account_id = $1 order by items desc`,
    [contaA.id],
  )
  expect(rows.map((linha) => linha.items)).toEqual([4, 0])
})

// Isolamento pelos dois lados -------------------------------------------------

test('cada conta lê só as próprias execuções', async () => {
  await comoRotina()
  const daA = await abrir(contaA.id, 'cron-meeting-reminder')
  await comoRotina()
  const daB = await abrir(contaB.id, 'cron-meeting-rescue')
  await comoRotina()
  await abrir(null, 'cron-cadence')

  for (const [conta, propria] of [
    [contaA, daA],
    [contaB, daB],
  ] as const) {
    await banco.comoUsuario(conta.donoId)
    const { rows } = await banco.sql.query<{ id: string }>('select id from public.job_runs')
    await banco.comoServico()
    // A própria aparece, a vizinha e a da instalação não.
    expect(rows.map((linha) => linha.id)).toEqual([propria])
  }
})

// O índice por conta ----------------------------------------------------------

test('o índice por conta tem conta, rotina e início decrescente, nessa ordem', async () => {
  const { rows } = await banco.sql.query<{ coluna: string }>(
    `select a.attname as coluna
       from pg_index as i
       join pg_class as idx on idx.oid = i.indexrelid
      cross join lateral unnest(string_to_array(i.indkey::text, ' ')::smallint[])
            with ordinality as posicao(atributo, ordem)
       join pg_attribute as a
         on a.attrelid = i.indrelid and a.attnum = posicao.atributo
      where idx.relname = 'job_runs_por_conta_idx'
      order by posicao.ordem`,
  )
  expect(rows.map((linha) => linha.coluna)).toEqual(['account_id', 'routine', 'started_at'])

  const { rows: definicao } = await banco.sql.query<{ texto: string }>(
    `select indexdef as texto from pg_indexes
      where schemaname = 'public' and indexname = 'job_runs_por_conta_idx'`,
  )
  expect(definicao[0]?.texto).toMatch(/started_at desc/i)
})

test('job_runs não tem updated_at, e o comentário da tabela diz por quê', async () => {
  const { rows } = await banco.sql.query<{ existe: boolean; comentario: string }>(
    `select exists (
              select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'job_runs'
                 and column_name = 'updated_at'
            ) as existe,
            obj_description('public.job_runs'::regclass, 'pg_class') as comentario`,
  )
  expect(rows[0]?.existe).toBe(false)
  expect(rows[0]?.comentario).toMatch(/sem updated_at/i)
})

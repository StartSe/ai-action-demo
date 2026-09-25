// Observabilidade: a última execução de cada rotina (L-13, RF-613) e a cadeia
// de toda chamada externa por identificador de chamada telefônica (RNF-16).
//
// O que este arquivo prova:
//
// 1. **A linha da instalação, com conta nula, não é visível para cliente
//    nenhum** — nem para o dono da conta que a rotina processou. É a
//    consequência de isolamento de `account_id` ser nulável em `job_runs`, e
//    ela precisa de teste porque é a única tabela do esquema em que a política
//    não cobre todas as linhas: sem a prova, ninguém descobriria que a decisão
//    mudou de efeito.
// 2. A linha da conta aparece para ela e só para ela, nas duas tabelas.
// 3. **Os dois índices existem no catálogo**, com as colunas na ordem
//    declarada. O de `job_runs` é a consulta de "última execução de cada
//    rotina" do painel de saúde; o de `integration_events` é o que faz
//    "consulta por identificador de chamada devolve a cadeia completa" de
//    RNF-16 ser verdade. A falta de qualquer um dos dois não quebraria
//    consulta nenhuma — só faria a tela ficar mais lenta a cada dia de uso.
// 4. **O gatilho redige antes de gravar**: o cabeçalho de autorização, que
//    mora dentro de `headers`, e a chave de api, que mora na raiz de
//    `request`. A regressão no fim do arquivo tira o gatilho e encontra os
//    dois em claro, que é o que dá dente a esta prova.
// 5. Classe Servidor da seção 3.9: o membro lê, e ninguém do cliente insere,
//    altera nem apaga — nem o dono da conta.
//
// Referência: migração 20260922090000_observabilidade.sql,
// docs/PRD-implementacao.md seções 3.8, 3.9 e 4.6, docs/revisao-tecnica.md
// L-13, docs/PRD.md RF-613 e RNF-16.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly operadorId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

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

/**
 * Insert pela sessão de serviço, que é o único caminho que as duas tabelas
 * têm: são da classe Servidor e não há política de escrita de cliente. Quem
 * grava de verdade são as rotinas e as funções de borda.
 */
async function inserir(
  tabela: 'job_runs' | 'integration_events',
  campos: Readonly<Record<string, unknown>>,
): Promise<string> {
  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.${tabela} (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

/** Uma ida ao provedor, com os segredos que a borda de fato manda. */
async function registrarEvento(
  conta: Conta,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  return inserir('integration_events', {
    account_id: conta.id,
    direction: 'outbound',
    provider: 'telefonia',
    endpoint: '/Calls',
    ...extras,
  })
}

/** Roda a manobra e desfaz tudo o que ela fizer. */
async function descartando(manobra: () => Promise<void>): Promise<void> {
  await banco.sql.query('begin')
  try {
    await manobra()
  } finally {
    await banco.comoServico()
    await banco.sql.query('rollback')
  }
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
  await banco.sql.query('delete from public.integration_events')
})

// job_runs: a execução que atravessa contas ------------------------------------

test('a passagem da instalação entra com conta nula', async () => {
  // A rotina acorda para a instalação inteira, e obrigar essa linha a ter
  // conta faria a rotina inventar uma.
  const id = await inserir('job_runs', { routine: 'cron-dial' })
  expect(id).toBeTruthy()

  const { rows } = await banco.sql.query<{
    account_id: string | null
    items: number
    finished_at: string | null
    error: string | null
  }>(
    'select account_id, items, finished_at, error from public.job_runs where id = $1',
    [id],
  )
  const execucao = rows[0]
  expect(execucao?.account_id).toBeNull()
  expect(execucao?.items).toBe(0)
  // A rotina grava o início antes de trabalhar: execução que morre no meio
  // fica com o fim nulo, e é a morte que RF-613 quer expor.
  expect(execucao?.finished_at).toBeNull()
  expect(execucao?.error).toBeNull()
})

test('a linha da instalação não aparece para membro nenhum', async () => {
  await inserir('job_runs', { routine: 'cron-dial' })
  await inserir('job_runs', { account_id: contaA.id, routine: 'cron-dial' })

  for (const conta of [contaA, contaB]) {
    for (const usuario of [conta.donoId, conta.operadorId]) {
      await banco.comoUsuario(usuario)
      const { rows } = await banco.sql.query<{ account_id: string | null }>(
        'select account_id from public.job_runs',
      )
      // `is_member(null)` é falso, e é por isso que a linha da instalação não
      // é de ninguém: quem a lê é o operador da instalação, com o segredo de
      // serviço.
      expect(
        rows.every((linha) => linha.account_id !== null),
        'a linha de conta nula chegou a um cliente: a política deixou de ser ' +
          'is_member(account_id) ou a coluna deixou de ser nulável',
      ).toBe(true)
    }
  }
})

test('a linha da conta aparece só para ela', async () => {
  const daA = await inserir('job_runs', {
    account_id: contaA.id,
    routine: 'cron-retention',
    items: 12,
  })
  await inserir('job_runs', { account_id: contaB.id, routine: 'cron-retention' })

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.job_runs',
  )
  expect(rows.map((linha) => linha.id)).toEqual([daA])
})

test('o fim antes do início é recusado e a contagem negativa também', async () => {
  await expect(
    inserir('job_runs', {
      routine: 'cron-dial',
      started_at: '2026-09-22T12:00:00Z',
      finished_at: '2026-09-22T11:59:00Z',
    }),
  ).rejects.toThrow(/job_runs_check/i)

  await expect(
    inserir('job_runs', { routine: 'cron-dial', items: -1 }),
  ).rejects.toThrow(/job_runs_items_check/i)
})

test('rotina sem nome é recusada', async () => {
  // Execução de rotina anônima não responde "esta rotina ainda roda?", que é
  // a única pergunta que a tabela existe para responder.
  await expect(
    inserir('job_runs', { routine: '   ' }),
  ).rejects.toThrow(/job_runs_routine_check/i)
})

test('apagar a conta leva as execuções dela e deixa a da instalação', async () => {
  const { rows: contas } = await banco.sql.query<{ id: string }>(
    "insert into public.accounts (name) values ('Conta efêmera') returning id",
  )
  const efemera = contas[0]!.id
  const daInstalacao = await inserir('job_runs', { routine: 'cron-cadence' })
  await inserir('job_runs', { account_id: efemera, routine: 'cron-cadence' })

  await banco.sql.query('delete from public.accounts where id = $1', [efemera])

  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.job_runs',
  )
  expect(rows.map((linha) => linha.id)).toEqual([daInstalacao])
})

// integration_events: a cadeia da ligação --------------------------------------

test('a cadeia de uma ligação sai pelo identificador de chamada', async () => {
  const correlacao = 'chamada-7'
  await registrarEvento(contaA, { correlation_id: correlacao, endpoint: '/Calls' })
  await registrarEvento(contaA, {
    correlation_id: correlacao,
    direction: 'inbound',
    endpoint: '/webhooks/status',
    status_code: 200,
    latency_ms: 140,
  })
  await registrarEvento(contaA, { correlation_id: 'chamada-8' })

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query<{ endpoint: string }>(
    `select endpoint from public.integration_events
      where correlation_id = $1
      order by at, endpoint`,
    [correlacao],
  )
  // É isto que RNF-16 cobra: o identificador da chamada devolve a cadeia
  // completa, ida e volta.
  expect(rows.map((linha) => linha.endpoint)).toEqual([
    '/Calls',
    '/webhooks/status',
  ])
})

test('a chamada externa sem ligação entra com correlação nula', async () => {
  // Sincronização de agenda e busca de preço não nascem de ligação nenhuma.
  const id = await registrarEvento(contaA, {
    provider: 'calendario',
    endpoint: '/freeBusy',
  })
  const { rows } = await banco.sql.query<{
    correlation_id: string | null
    status_code: number | null
    request: Record<string, unknown>
    response: Record<string, unknown>
  }>(
    'select correlation_id, status_code, request, response from public.integration_events where id = $1',
    [id],
  )
  expect(rows[0]?.correlation_id).toBeNull()
  // Nulo em `status_code` é "não chegou a ter resposta", que é diferente de
  // 500 e importa para o disjuntor.
  expect(rows[0]?.status_code).toBeNull()
  expect(rows[0]?.request).toEqual({})
  expect(rows[0]?.response).toEqual({})
})

test('direção fora das duas é recusada e o código fora da faixa também', async () => {
  await expect(
    registrarEvento(contaA, { direction: 'interna' }),
  ).rejects.toThrow(/integration_events_direction_check/i)

  await expect(
    registrarEvento(contaA, { status_code: 99 }),
  ).rejects.toThrow(/integration_events_status_code_check/i)

  await expect(
    registrarEvento(contaA, { latency_ms: -1 }),
  ).rejects.toThrow(/integration_events_latency_ms_check/i)
})

test('provedor e caminho vazios são recusados', async () => {
  await expect(
    registrarEvento(contaA, { provider: ' ' }),
  ).rejects.toThrow(/integration_events_provider_check/i)

  await expect(
    registrarEvento(contaA, { endpoint: '' }),
  ).rejects.toThrow(/integration_events_endpoint_check/i)
})

// Redação antes de gravar ------------------------------------------------------

/** O que a borda de fato manda: o cabeçalho dentro de `headers`, a chave fora. */
const PEDIDO_COM_SEGREDO = {
  headers: { Authorization: 'Basic dGVzdGU6ZGVzY2FydGU=', accept: 'json' },
  api_key: 'chave-do-provedor',
  account_sid: 'identificador-da-conta-do-provedor',
  to: '+5511999998888',
}

test('o gatilho redige o cabeçalho de autorização e a chave de api', async () => {
  const id = await registrarEvento(contaA, {
    request: JSON.stringify(PEDIDO_COM_SEGREDO),
    response: JSON.stringify({ sid: 'CA123', status: 'queued' }),
  })

  const { rows } = await banco.sql.query<{
    request: Record<string, unknown>
    response: Record<string, unknown>
  }>('select request, response from public.integration_events where id = $1', [
    id,
  ])

  // A regra é sobre o nome da chave, e desce por dentro do objeto: uma versão
  // que só olhasse o primeiro nível deixaria em claro o caso mais comum.
  expect(rows[0]?.request).toEqual({
    headers: { Authorization: '[redigido]', accept: 'json' },
    api_key: '[redigido]',
    account_sid: '[redigido]',
    to: '+5511999998888',
  })
  expect(rows[0]?.response).toEqual({ sid: '[redigido]', status: 'queued' })
})

test('a redação desce por listas e preserva o que não é segredo', async () => {
  const id = await registrarEvento(contaA, {
    request: JSON.stringify({
      lote: [{ token: 'um' }, { nome: 'dois' }],
      tentativas: 3,
      ativo: true,
      nulo: null,
    }),
  })

  const { rows } = await banco.sql.query<{ request: Record<string, unknown> }>(
    'select request from public.integration_events where id = $1',
    [id],
  )
  expect(rows[0]?.request).toEqual({
    lote: [{ token: '[redigido]' }, { nome: 'dois' }],
    tentativas: 3,
    ativo: true,
    nulo: null,
  })
})

test('a redação vale também no update que completa o evento', async () => {
  // A rotina que grava o pedido antes da resposta volta para completar a
  // linha, e em `after` a resposta já teria existido em claro.
  const id = await registrarEvento(contaA)
  await banco.sql.query(
    `update public.integration_events
        set response = $2::jsonb, status_code = 201
      where id = $1`,
    [id, JSON.stringify({ auth_token: 'segredo que voltou' })],
  )

  const { rows } = await banco.sql.query<{
    response: Record<string, unknown>
  }>('select response from public.integration_events where id = $1', [id])
  expect(rows[0]?.response).toEqual({ auth_token: '[redigido]' })
})

// Os dois índices --------------------------------------------------------------

/** Colunas de um índice, na ordem, direto do catálogo. */
async function colunasDoIndice(nome: string): Promise<string[]> {
  const { rows } = await banco.sql.query<{ coluna: string }>(
    `select a.attname as coluna
       from pg_index as i
       join pg_class as idx on idx.oid = i.indexrelid
      cross join lateral unnest(string_to_array(i.indkey::text, ' ')::smallint[])
            with ordinality as posicao(atributo, ordem)
       join pg_attribute as a
         on a.attrelid = i.indrelid and a.attnum = posicao.atributo
      where idx.relname = $1
      order by posicao.ordem`,
    [nome],
  )
  return rows.map((linha) => linha.coluna)
}

test('o índice da última execução tem rotina e início, nessa ordem', async () => {
  // Direto do catálogo, e não do texto do `indexdef`: regex sobre o DDL passa
  // a aceitar qualquer ordem no dia em que alguém reformatar a migração.
  expect(await colunasDoIndice('job_runs_ultima_execucao_idx')).toEqual([
    'routine',
    'started_at',
  ])

  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select indexdef as definicao
       from pg_indexes
      where schemaname = 'public' and indexname = 'job_runs_ultima_execucao_idx'`,
  )
  // Sem o decrescente, a consulta do painel ainda seria servida, mas com uma
  // varredura ao contrário por rotina.
  expect(rows[0]?.definicao).toMatch(/started_at desc/i)
})

test('o índice da correlação tem conta e identificador de chamada', async () => {
  expect(await colunasDoIndice('integration_events_correlacao_idx')).toEqual([
    'account_id',
    'correlation_id',
  ])
})

test('as duas tabelas têm a chave primária e o índice declarado, e nada mais', async () => {
  for (const [tabela, esperados] of [
    // O índice por conta é da F6 (20261010100000_registro_de_execucao.sql), e
    // quem prova as colunas dele é registro-de-execucao-de-rotinas.test.ts.
    [
      'job_runs',
      ['job_runs_pkey', 'job_runs_por_conta_idx', 'job_runs_ultima_execucao_idx'],
    ],
    [
      'integration_events',
      ['integration_events_correlacao_idx', 'integration_events_pkey'],
    ],
  ] as const) {
    const { rows } = await banco.sql.query<{ nome: string }>(
      `select indexname as nome
         from pg_indexes
        where schemaname = 'public' and tablename = $1
        order by indexname`,
      [tabela],
    )
    // Índice a mais é índice que ninguém declarou qual consulta serve.
    expect(rows.map((linha) => linha.nome)).toEqual(esperados)
  }
})

// Isolamento (classe Servidor) -------------------------------------------------

test('o dono lê e não insere, não altera e não apaga', async () => {
  const execucao = await inserir('job_runs', {
    account_id: contaA.id,
    routine: 'cron-dial',
  })
  const evento = await registrarEvento(contaA, { correlation_id: 'chamada-9' })

  await banco.comoUsuario(contaA.donoId)

  for (const [tabela, id] of [
    ['job_runs', execucao],
    ['integration_events', evento],
  ] as const) {
    const { rows: lidos } = await banco.sql.query(
      `select id from public.${tabela} where id = $1`,
      [id],
    )
    expect(lidos).toHaveLength(1)

    // RLS que não casa não levanta erro: simplesmente não afeta linha.
    const { rows: apagados } = await banco.sql.query(
      `delete from public.${tabela} where id = $1 returning id`,
      [id],
    )
    expect(apagados).toEqual([])
  }

  await expect(
    banco.sql.query(
      `insert into public.job_runs (account_id, routine)
       values ($1, 'cron-inventada')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  await expect(
    banco.sql.query(
      `insert into public.integration_events (account_id, direction, provider, endpoint)
       values ($1, 'outbound', 'telefonia', '/Calls')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  const { rows: alterados } = await banco.sql.query(
    `update public.integration_events set endpoint = '/Outro'
      where id = $1 returning id`,
    [evento],
  )
  expect(alterados).toEqual([])
})

test('a conta vizinha e a sessão anônima recebem zero linha', async () => {
  await inserir('job_runs', { account_id: contaA.id, routine: 'cron-dial' })
  await registrarEvento(contaA, { correlation_id: 'chamada-10' })

  await banco.comoUsuario(contaB.donoId)
  for (const tabela of ['job_runs', 'integration_events']) {
    const { rows } = await banco.sql.query(`select id from public.${tabela}`)
    expect(rows, `a conta vizinha alcançou ${tabela}`).toEqual([])
  }

  await banco.comoAnonimo()
  for (const tabela of ['job_runs', 'integration_events']) {
    const { rows } = await banco.sql.query(`select id from public.${tabela}`)
    expect(rows, `o anônimo alcançou ${tabela}`).toEqual([])
  }
})

test('nenhuma das duas tem política de escrita no catálogo', async () => {
  const { rows } = await banco.sql.query<{ tablename: string; cmd: string }>(
    `select tablename, cmd from pg_policies
      where schemaname = 'public'
        and tablename in ('job_runs', 'integration_events')
      order by tablename`,
  )
  // A ausência é o contrato da classe Servidor.
  expect(rows).toEqual([
    { tablename: 'integration_events', cmd: 'SELECT' },
    { tablename: 'job_runs', cmd: 'SELECT' },
  ])
})

// Regressão --------------------------------------------------------------------
// Prova que a redação acima tem dente: sem o gatilho, os dois segredos entram
// em claro.

test('sem o gatilho, a chave de api e o cabeçalho ficam em claro', async () => {
  await descartando(async () => {
    await banco.sql.query(
      'drop trigger integration_events_redacao on public.integration_events',
    )
    const id = await registrarEvento(contaA, {
      request: JSON.stringify(PEDIDO_COM_SEGREDO),
    })
    const { rows } = await banco.sql.query<{
      request: { api_key?: string; headers?: { Authorization?: string } }
    }>('select request from public.integration_events where id = $1', [id])

    expect(
      rows[0]?.request.api_key,
      'a chave continuou redigida sem o gatilho: a redação vem de outro ' +
        'lugar e o teste acima não estaria medindo o gatilho',
    ).toBe(PEDIDO_COM_SEGREDO.api_key)
    expect(rows[0]?.request.headers?.Authorization).toBe(
      PEDIDO_COM_SEGREDO.headers.Authorization,
    )
  })
})

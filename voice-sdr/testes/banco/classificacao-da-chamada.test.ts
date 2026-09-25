// A classificação com confiança e a trava da correção humana (US-129). O que
// se prova:
//
// 1. A confiança fica entre 0 e 1, é obrigatória em backfill e proibida em
//    human e tool.
// 2. Depois de human, o update da chave de serviço não altera classificação,
//    avaliação nem sentimento, e as outras colunas continuam entrando.
// 3. A linha corrigida guarda autor e instante.
// 4. calls continua sem política de escrita de cliente, e cada conta lê só as
//    próprias chamadas.
//
// Referência: migração 20260929130000_classificacao_com_confianca.sql.

import { afterAll, beforeAll, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const CHECK_VIOLADO = '23514'

interface Conta {
  readonly id: string
  readonly operadorId: string
  readonly leadId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta
let sequencia = 0

async function criarConta(nome: string, dominio: string, telefone: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'operator')`,
    [id, operadorId],
  )
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164) values ($1, 'Marcos', $2) returning id`,
    [id, telefone],
  )
  return { id, operadorId, leadId: leads[0]!.id }
}

async function semearChamada(conta: Conta, extras: Record<string, unknown> = {}): Promise<string> {
  await banco.comoServico()
  sequencia += 1
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    lead_id: conta.leadId,
    purpose: 'discovery',
    direction: 'outbound',
    idempotency_key: `classificacao-${sequencia}`,
    ...extras,
  }
  const colunas = Object.keys(campos)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (${colunas.join(', ')})
     values (${colunas.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    Object.values(campos),
  )
  return rows[0]!.id
}

async function codigoDoErro(manobra: Promise<unknown>): Promise<string | undefined> {
  try {
    await manobra
  } catch (erro) {
    return (erro as { code?: string }).code
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test', '+5548999990001')
  contaB = await criarConta('Cooperativa Sul', 'sul.test', '+5548999990002')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

test.each([-0.1, 1.2])('confiança %s fora de 0 a 1 é recusada', async (valor) => {
  expect(
    await codigoDoErro(
      semearChamada(contaA, { classification_source: 'backfill', classification_confidence: valor }),
    ),
  ).toBe(CHECK_VIOLADO)
})

test('backfill sem confiança é recusado, e com confiança entra', async () => {
  expect(
    await codigoDoErro(semearChamada(contaA, { classification_source: 'backfill' })),
  ).toBe(CHECK_VIOLADO)
  expect(
    await semearChamada(contaA, { classification_source: 'backfill', classification_confidence: 0.72 }),
  ).toBeTruthy()
})

test.each(['human', 'tool'])('%s com confiança é recusado', async (fonte) => {
  expect(
    await codigoDoErro(
      semearChamada(contaA, { classification_source: fonte, classification_confidence: 0.5 }),
    ),
  ).toBe(CHECK_VIOLADO)
  expect(await semearChamada(contaA, { classification_source: fonte })).toBeTruthy()
})

test('depois da correção humana, o update da chave de serviço não muda a classificação', async () => {
  const id = await semearChamada(contaA, {
    classification: JSON.stringify({ stage_key: 'qualified' }),
    classification_source: 'human',
    classification_corrected_by: contaA.operadorId,
    classification_corrected_at: '2026-09-21T14:12:00Z',
    evaluation: JSON.stringify({ criterios: { aviso: true } }),
    evaluation_score: 8,
    sentiment: 0.4,
  })

  await banco.comoServico()
  await banco.sql.query('set role service_role')
  await banco.sql.query(
    `update public.calls
        set classification = '{"stage_key":"lost"}'::jsonb,
            classification_source = 'backfill',
            classification_confidence = 0.8,
            evaluation = '{}'::jsonb,
            evaluation_score = 2,
            sentiment = -0.9,
            classification_corrected_by = null,
            recovery_note = 'passou por aqui'
      where id = $1`,
    [id],
  )

  await banco.comoServico()
  const { rows } = await banco.sql.query<Record<string, unknown>>(
    `select classification, classification_source, classification_confidence,
            evaluation_score::float8 as evaluation_score, sentiment::float8 as sentiment,
            classification_corrected_by, classification_corrected_at, recovery_note
       from public.calls where id = $1`,
    [id],
  )
  expect(rows[0]).toMatchObject({
    classification: { stage_key: 'qualified' },
    classification_source: 'human',
    classification_confidence: null,
    evaluation_score: 8,
    sentiment: 0.4,
    classification_corrected_by: contaA.operadorId,
    recovery_note: 'passou por aqui',
  })
  expect(new Date(rows[0]!.classification_corrected_at as string).toISOString()).toBe(
    '2026-09-21T14:12:00.000Z',
  )
})

test('antes da correção, a retaguarda escreve normalmente', async () => {
  const id = await semearChamada(contaA)
  await banco.sql.query(
    `update public.calls set classification_source = 'backfill', classification_confidence = 0.6,
            classification = '{"stage_key":"contacted"}'::jsonb where id = $1`,
    [id],
  )
  const { rows } = await banco.sql.query<{ classification: { stage_key: string } }>(
    'select classification from public.calls where id = $1',
    [id],
  )
  expect(rows[0]!.classification.stage_key).toBe('contacted')
})

test('calls continua sem política de escrita de cliente', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ cmd: string }>(
    `select cmd from pg_policies where schemaname = 'public' and tablename = 'calls'`,
  )
  expect(rows.map((r) => r.cmd)).toEqual(['SELECT'])
})

test('cada conta lê só as próprias chamadas', async () => {
  await semearChamada(contaB, { classification_source: 'human' })
  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select distinct account_id from public.calls',
  )
  expect(rows.map((r) => r.account_id)).toEqual([contaA.id])
})

// A correção humana da classificação (US-130). O que se prova:
//
// 1. Caminho feliz: autor é auth.uid(), instante gravado, confiança anulada.
// 2. As quatro recusas: inexistente, outra conta, sem permissão, inválida
//    (inclusive motivo vazio).
// 3. A auditoria guarda o motivo.
// 4. A correção que muda a etapa move o lead com actor='user'.
// 5. A retaguarda posterior não tem efeito.
// 6. Corrigir duas vezes gera duas linhas de auditoria, e vale a última hora.
//
// Referência: migração 20260929140000_corrigir_classificacao.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly operadorId: string
  readonly observadorId: string
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
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Ana')
  const observadorId = await banco.criarUsuario(`observador@${dominio}`, 'Observador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'operator'), ($1, $3, 'viewer')`,
    [id, operadorId, observadorId],
  )
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164) values ($1, 'Marcos', $2) returning id`,
    [id, telefone],
  )
  return { id, operadorId, observadorId, leadId: leads[0]!.id }
}

async function semearChamada(conta: Conta): Promise<string> {
  await banco.comoServico()
  sequencia += 1
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (account_id, lead_id, purpose, direction, idempotency_key,
                               classification, classification_source, classification_confidence)
     values ($1, $2, 'discovery', 'outbound', $3, '{"stage_key":"contacted"}'::jsonb, 'backfill', 0.6)
     returning id`,
    [conta.id, conta.leadId, `correcao-${sequencia}`],
  )
  return rows[0]!.id
}

async function corrigir(
  usuario: string,
  chamada: string,
  classificacao: unknown,
  motivo: string | null,
): Promise<string> {
  await banco.comoUsuario(usuario)
  const { rows } = await banco.sql.query<{ r: string }>(
    'select public.corrigir_classificacao($1, $2::jsonb, $3) as r',
    [chamada, classificacao === null ? null : JSON.stringify(classificacao), motivo],
  )
  return rows[0]!.r
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test', '+5548999990001')
  contaB = await criarConta('Cooperativa Sul', 'sul.test', '+5548999990002')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.lead_events')
})

test('a correção grava autor, instante e anula a confiança', async () => {
  const id = await semearChamada(contaA)
  expect(await corrigir(contaA.operadorId, id, { stage_key: 'contacted', pain: 'Planilha' }, 'lead disse que tem dor')).toBe('corrigida')

  await banco.comoServico()
  const { rows } = await banco.sql.query<Record<string, unknown>>(
    `select classification, classification_source, classification_confidence,
            classification_corrected_by, classification_corrected_at from public.calls where id = $1`,
    [id],
  )
  expect(rows[0]).toMatchObject({
    classification: { stage_key: 'contacted', pain: 'Planilha' },
    classification_source: 'human',
    classification_confidence: null,
    classification_corrected_by: contaA.operadorId,
  })
  expect(rows[0]!.classification_corrected_at).not.toBeNull()
})

test('a auditoria guarda o motivo e o autor', async () => {
  const id = await semearChamada(contaA)
  await corrigir(contaA.operadorId, id, { stage_key: 'contacted' }, 'transcrição mal lida')
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ actor: string; actor_id: string; reason: string }>(
    `select actor, actor_id, reason from public.audit_log where target_id = $1 and action = 'correct_classification'`,
    [id],
  )
  expect(rows).toEqual([{ actor: 'user', actor_id: contaA.operadorId, reason: 'transcrição mal lida' }])
})

test('as recusas vêm por código', async () => {
  const id = await semearChamada(contaA)
  expect(
    await corrigir(contaA.operadorId, '00000000-0000-4000-8000-000000000000', { stage_key: 'lost' }, 'x'),
  ).toBe('chamada_inexistente')
  expect(await corrigir(contaB.operadorId, id, { stage_key: 'lost' }, 'x')).toBe('chamada_de_outra_conta')
  expect(await corrigir(contaA.observadorId, id, { stage_key: 'lost' }, 'x')).toBe('sem_permissao')
  expect(await corrigir(contaA.operadorId, id, { stage_key: 'lost' }, '   ')).toBe('classificacao_invalida')
  expect(await corrigir(contaA.operadorId, id, { stage_key: 'lost' }, null)).toBe('classificacao_invalida')
  expect(await corrigir(contaA.operadorId, id, ['lost'], 'x')).toBe('classificacao_invalida')
  expect(await corrigir(contaA.operadorId, id, { stage_key: 'Perdido' }, 'x')).toBe('classificacao_invalida')

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ classification_source: string }>(
    'select classification_source from public.calls where id = $1',
    [id],
  )
  expect(rows[0]!.classification_source).toBe('backfill')
})

test('a correção que muda a etapa move o lead com o autor humano', async () => {
  const id = await semearChamada(contaA)
  expect(await corrigir(contaA.operadorId, id, { stage_key: 'qualified' }, 'tem fit')).toBe('corrigida')

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ actor: string; actor_id: string; payload: { para: { key: string } } }>(
    `select actor, actor_id, payload from public.lead_events where lead_id = $1 and kind = 'stage_change'`,
    [contaA.leadId],
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ actor: 'user', actor_id: contaA.operadorId, payload: { para: { key: 'qualified' } } })
})

test('a retaguarda posterior não desfaz a correção', async () => {
  const id = await semearChamada(contaA)
  await corrigir(contaA.operadorId, id, { stage_key: 'lost' }, 'pediu para não ligar')

  await banco.comoServico()
  await banco.sql.query('set role service_role')
  await banco.sql.query(
    `update public.calls set classification = '{"stage_key":"qualified"}'::jsonb,
            classification_source = 'backfill', classification_confidence = 0.8
      where id = $1`,
    [id],
  )
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ classification: { stage_key: string }; classification_source: string }>(
    'select classification, classification_source from public.calls where id = $1',
    [id],
  )
  expect(rows[0]).toEqual({ classification: { stage_key: 'lost' }, classification_source: 'human' })
})

test('corrigir duas vezes gera duas linhas de trilha e guarda a hora da última', async () => {
  const id = await semearChamada(contaA)
  await corrigir(contaA.operadorId, id, { stage_key: 'contacted' }, 'primeira')
  await banco.comoServico()
  await banco.sql.query(
    `update public.calls set classification_corrected_at = '2020-01-01T00:00:00Z' where id = $1`,
    [id],
  )
  expect(await corrigir(contaA.operadorId, id, { stage_key: 'new' }, 'segunda')).toBe('corrigida')

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ reason: string }>(
    `select reason from public.audit_log where target_id = $1 and action = 'correct_classification' order by created_at`,
    [id],
  )
  expect(rows.map((r) => r.reason).toSorted()).toEqual(['primeira', 'segunda'])
  const { rows: chamada } = await banco.sql.query<{ classification: { stage_key: string }; recente: boolean }>(
    `select classification, classification_corrected_at > now() - interval '1 minute' as recente
       from public.calls where id = $1`,
    [id],
  )
  expect(chamada[0]).toEqual({ classification: { stage_key: 'new' }, recente: true })
})

test('só authenticated executa', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee from information_schema.routine_privileges
      where routine_name = 'corrigir_classificacao' and privilege_type = 'EXECUTE'`,
  )
  const quem = rows.map((r) => r.grantee)
  expect(quem).toContain('authenticated')
  expect(quem).not.toContain('anon')
  expect(quem).not.toContain('PUBLIC')
})

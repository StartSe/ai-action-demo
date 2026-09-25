// A pendência de classificação na fila (US-139). O que se prova:
//
// 1. O gênero `classificacao_pendente` entra pela borda (service_role), com a
//    chave que call-classify forma, e a segunda tentativa com a mesma chave
//    responde ja_aberto sem segunda linha (RNF-06).
// 2. Resolvido, a chave se libera: a pendência seguinte da mesma chamada abre
//    item novo.
// 3. Os gêneros anteriores continuam valendo, e gênero inventado continua
//    recusado.
// 4. O update da retaguarda, com a condição que call-classify manda
//    (`classification_source is null`), não alcança a chamada corrigida por
//    gente: é a primeira linha, antes da trava da US-129.
//
// Referência: migração 20260929160000_classificacao_pendente.sql.

import { afterAll, beforeAll, expect, test } from 'vitest'

import { chaveDaPendencia, GENERO_DA_PENDENCIA } from '../../supabase/functions/call-classify/classificacao.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let operadorId: string
let leadId: string
let sequencia = 0

async function semearChamada(extras: Record<string, unknown> = {}): Promise<string> {
  await banco.comoServico()
  sequencia += 1
  const campos: Record<string, unknown> = {
    account_id: contaId,
    lead_id: leadId,
    purpose: 'discovery',
    direction: 'outbound',
    idempotency_key: `pendencia-${sequencia}`,
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

async function registrarComoBorda(chamadaId: string, kind: string = GENERO_DA_PENDENCIA): Promise<string> {
  await banco.comoServico()
  await banco.sql.query('set role service_role')
  const { rows } = await banco.sql.query<{ r: string }>(
    `select public.registrar_item_de_fila($1, $2, 'media', $3, $4::jsonb, null, $5, $6) as r`,
    [contaId, kind, chaveDaPendencia(chamadaId), JSON.stringify({ call_id: chamadaId, motivo: 'modelo_indisponivel' }), leadId, chamadaId],
  )
  await banco.comoServico()
  return rows[0]!.r
}

async function itensDaChamada(chamadaId: string): Promise<{ id: string; status: string; deduplicacao_key: string }[]> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string; status: string; deduplicacao_key: string }>(
    `select id, status, deduplicacao_key from public.exception_items where call_id = $1 order by created_at`,
    [chamadaId],
  )
  return rows
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Transportes Aurora') returning id`,
  )
  contaId = rows[0]!.id
  operadorId = await banco.criarUsuario('operador@aurora.test', 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'operator')`,
    [contaId, operadorId],
  )
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164) values ($1, 'Marcos', '+5548999990011') returning id`,
    [contaId],
  )
  leadId = leads[0]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

test('a pendência entra pela borda, e a segunda tentativa não abre segundo item', async () => {
  const chamada = await semearChamada()
  expect(await registrarComoBorda(chamada)).toBe('criado')
  expect(await registrarComoBorda(chamada)).toBe('ja_aberto')
  const itens = await itensDaChamada(chamada)
  expect(itens).toHaveLength(1)
  expect(itens[0]).toMatchObject({ status: 'aberto', deduplicacao_key: `classificacao:${chamada}` })
})

test('resolvida, a chave se libera para a pendência seguinte da mesma chamada', async () => {
  const chamada = await semearChamada()
  expect(await registrarComoBorda(chamada)).toBe('criado')
  const [item] = await itensDaChamada(chamada)
  await banco.comoUsuario(operadorId)
  const { rows } = await banco.sql.query<{ r: string }>('select public.resolver_item_de_fila($1, $2) as r', [
    item!.id,
    'Classificada à mão.',
  ])
  expect(rows[0]!.r).toBe('resolvido')
  expect(await registrarComoBorda(chamada)).toBe('criado')
  expect((await itensDaChamada(chamada)).map((i) => i.status)).toEqual(['resolvido', 'aberto'])
})

test('os gêneros anteriores continuam, e o inventado continua recusado', async () => {
  const chamada = await semearChamada()
  for (const kind of ['sentimento_negativo', 'repeated_failure', 'credito_baixo']) {
    await banco.comoServico()
    await banco.sql.query(`delete from public.exception_items where call_id = $1`, [chamada])
    expect(await registrarComoBorda(chamada, kind)).toBe('criado')
  }
  await expect(registrarComoBorda(chamada, 'modelo_caiu')).rejects.toThrow(/exception_items_genero_conhecido/)
  await banco.comoServico()
})

test('o update da retaguarda não alcança a chamada corrigida por gente', async () => {
  const chamada = await semearChamada({
    classification_source: 'human',
    classification: JSON.stringify({ stage_key: 'lost' }),
  })
  await banco.sql.query('set role service_role')
  const { rows } = await banco.sql.query<{ id: string }>(
    `update public.calls
        set classification = '{"stage_key":"qualified"}'::jsonb,
            classification_source = 'backfill',
            classification_confidence = 0.7
      where id = $1 and classification_source is null
      returning id`,
    [chamada],
  )
  await banco.comoServico()
  expect(rows).toHaveLength(0)
  const { rows: linha } = await banco.sql.query<{ classification_source: string; classification: unknown }>(
    'select classification_source, classification from public.calls where id = $1',
    [chamada],
  )
  expect(linha[0]).toEqual({ classification_source: 'human', classification: { stage_key: 'lost' } })
})

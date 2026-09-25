// A lista de bloqueio completa da F3: o lugar onde cai o pedido de não
// perturbe que a Sarah promete em voz alta (RF-805) e o número errado de
// RF-422.
//
// O que este arquivo prova:
//
// 1. Um bloqueio ativo por número por conta: o segundo é barrado, o removido
//    libera um novo, e o mesmo número em duas contas convive.
// 2. As quatro origens da F3 entram, `lead_request` e `wrong_number` entre
//    elas, e a antiga `call` é recusada com mensagem em português.
// 3. Classe Operação: cada conta vê as próprias linhas e zero da vizinha,
//    operator escreve e viewer não.
// 4. Remover é `update`: nem o operador apaga a linha pelo cliente (RF-804).
//
// A F2 cobre em `bloqueios.test.ts` a forma do número, os três campos da
// remoção e a trilha; aqui fica o que a migração da F3 acrescenta ou reafirma.
//
// Referência: migração 20260924140000_conformidade_do_bloqueio.sql,
// docs/PRD-implementacao.md seções 3.6 e 3.9, docs/revisao-tecnica.md T-02,
// docs/PRD.md RF-422, RF-804 e RF-805.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

const ORIGENS = ['manual', 'import', 'lead_request', 'wrong_number'] as const

const NUMERO = '+5511988887777'

interface Conta {
  readonly id: string
  readonly operadorId: string
  readonly observadorId: string
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
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  const observadorId = await banco.criarUsuario(`viewer@${dominio}`, 'Viewer')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'operator'), ($1, $3, 'viewer')`,
    [id, operadorId, observadorId],
  )
  return { id, operadorId, observadorId }
}

async function bloquear(
  conta: Conta,
  source: string = 'lead_request',
): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.dnc_entries (account_id, phone_e164, reason, source)
     values ($1, $2, 'pediu para não ser chamado', $3)
     returning id`,
    [conta.id, NUMERO, source],
  )
  return rows[0]!.id
}

async function remover(id: string, quem: string): Promise<void> {
  await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'cliente voltou a autorizar'
      where id = $1`,
    [id, quem],
  )
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
  await banco.sql.query('delete from public.dnc_entries')
})

// Um ativo por vez ----------------------------------------------------------------

test('dois bloqueios ativos do mesmo número na mesma conta reprovam', async () => {
  await bloquear(contaA)
  await expect(bloquear(contaA, 'manual')).rejects.toThrow(
    /dnc_entries_ativo_unico_por_conta/,
  )
})

test('o bloqueio removido libera um novo, como linha nova', async () => {
  const primeiro = await bloquear(contaA)
  await remover(primeiro, contaA.operadorId)

  const segundo = await bloquear(contaA)
  expect(segundo).not.toBe(primeiro)

  const { rows } = await banco.sql.query<{ ativo: boolean }>(
    `select removed_at is null as ativo from public.dnc_entries
      where account_id = $1 order by created_at, ativo`,
    [contaA.id],
  )
  expect(rows.map((linha) => linha.ativo).sort()).toEqual([false, true])
})

test('o mesmo número em duas contas convive', async () => {
  await bloquear(contaA)
  await bloquear(contaB)
  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.dnc_entries where phone_e164 = $1',
    [NUMERO],
  )
  expect(rows[0]?.total).toBe(2)
})

// A origem --------------------------------------------------------------------------

test.each(ORIGENS)('a origem %s entra', async (origem) => {
  await bloquear(contaA, origem)
})

test('a origem call da F2 é recusada com mensagem em português', async () => {
  await expect(bloquear(contaA, 'call')).rejects.toThrow(
    /origem de bloqueio desconhecida: call/,
  )
})

test('o comentário da origem diz que wrong_number fecha RF-422', async () => {
  const { rows } = await banco.sql.query<{ comentario: string }>(
    `select col_description('public.dnc_entries'::regclass, a.attnum) as comentario
       from pg_attribute a
      where a.attrelid = 'public.dnc_entries'::regclass and a.attname = 'source'`,
  )
  expect(rows[0]?.comentario).toMatch(/wrong_number.*RF-422/)
})

// Isolamento ------------------------------------------------------------------------

test('cada conta vê as próprias linhas e zero da vizinha', async () => {
  const deA = await bloquear(contaA)
  const deB = await bloquear(contaB)

  for (const [conta, propria] of [
    [contaA, deA],
    [contaB, deB],
  ] as const) {
    await banco.comoUsuario(conta.observadorId)
    const { rows } = await banco.sql.query<{ id: string }>(
      'select id from public.dnc_entries',
    )
    expect(rows.map((linha) => linha.id)).toEqual([propria])
  }
})

test('o operator bloqueia e remove; o viewer não faz nenhum dos dois', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const id = await bloquear(contaA)

  await banco.comoUsuario(contaA.observadorId)
  await expect(bloquear(contaB)).rejects.toThrow(/row-level security/)
  const { rows: alterados } = await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'quis tirar'
      where id = $1 returning id`,
    [id, contaA.observadorId],
  )
  expect(alterados).toEqual([])

  await banco.comoUsuario(contaA.operadorId)
  const { rows: removidos } = await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removal_reason = 'cliente voltou a autorizar'
      where id = $1 returning id`,
    [id],
  )
  expect(removidos).toHaveLength(1)
})

test('o viewer não bloqueia nem na própria conta', async () => {
  await banco.comoUsuario(contaA.observadorId)
  await expect(bloquear(contaA)).rejects.toThrow(/row-level security/)
})

test('nem o operator apaga o bloqueio pelo cliente: remover é update', async () => {
  const id = await bloquear(contaA)

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query(
    'delete from public.dnc_entries where id = $1 returning id',
    [id],
  )
  expect(rows).toEqual([])

  await banco.comoServico()
  const { rows: restantes } = await banco.sql.query(
    'select id from public.dnc_entries where id = $1',
    [id],
  )
  expect(restantes).toHaveLength(1)
})

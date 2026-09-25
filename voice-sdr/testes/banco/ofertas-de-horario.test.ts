// Ofertas de horário: a oferta mora no servidor e se escolhe por posição.
// O que se prova aqui:
//
// 1. O único recusa duas ofertas na mesma posição da mesma chamada, e a mesma
//    posição em outra chamada convive.
// 2. O check recusa a posição 0 e a 5.
// 3. expires_at nasce com a duração máxima da chamada da conta, não com dez
//    minutos, e quem informa o valor fica com o dele.
// 4. Classe Servidor: pg_policies devolve só SELECT; o cliente lê as ofertas
//    da própria conta e não escreve nenhuma; a conta vizinha recebe zero linha.
// 5. Não há coluna de token.
//
// Referência: migração 20260930110000_ofertas_de_horario.sql, T-09,
// docs/PRD-implementacao.md seções 3.9 e 5.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly adminId: string
  readonly especialistaId: string
  readonly chamadaId: string
  readonly outraChamadaId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function um(sql: string, parametros: unknown[]): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

async function criarConta(nome: string, dominio: string, sufixo: string): Promise<Conta> {
  const id = await um('insert into public.accounts (name) values ($1) returning id', [nome])
  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'admin')`,
    [id, adminId],
  )
  const especialistaId = await um(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, $2, $3, array['video']::text[]) returning id`,
    [id, `Ana de ${nome}`, `ana@${dominio}`],
  )
  const leadId = await um(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead', $2, 'teste') returning id`,
    [id, `+55119900000${sufixo}1`],
  )
  const chamada = (chave: string) =>
    um(
      `insert into public.calls (account_id, lead_id, purpose, direction, idempotency_key, to_number)
       values ($1, $2, 'discovery', 'outbound', $3, $4) returning id`,
      [id, leadId, `ofertas:${sufixo}:${chave}`, `+55119900000${sufixo}1`],
    )
  return {
    id,
    adminId,
    especialistaId,
    chamadaId: await chamada('um'),
    outraChamadaId: await chamada('dois'),
  }
}

function ofertar(
  conta: Conta,
  campos: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const linha: Record<string, unknown> = {
    account_id: conta.id,
    call_id: conta.chamadaId,
    position: 1,
    specialist_id: conta.especialistaId,
    starts_at: '2026-10-06T17:00:00Z',
    ends_at: '2026-10-06T17:30:00Z',
    ...campos,
  }
  const colunas = Object.keys(linha)
  return um(
    `insert into public.call_slot_offers (${colunas.join(', ')})
     values (${colunas.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    Object.values(linha),
  )
}

async function erroDe(manobra: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await manobra
  } catch (erro) {
    const bruto = erro as { code?: string; message?: string }
    return { code: bruto.code, message: String(bruto.message) }
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test', '1')
  contaB = await criarConta('Cooperativa Sul', 'sul.test', '2')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.call_slot_offers')
})

test('duas ofertas na mesma posição da mesma chamada são recusadas', async () => {
  await ofertar(contaA, { position: 2 })
  const erro = await erroDe(ofertar(contaA, { position: 2 }))
  expect(erro.code).toBe('23505')
  expect(erro.message).toMatch(/call_slot_offers_uma_por_posicao/)

  const outraChamada = await ofertar(contaA, { position: 2, call_id: contaA.outraChamadaId })
  expect(outraChamada).toBeTruthy()
})

test('a posição vai de 1 a 4', async () => {
  for (const posicao of [1, 2, 3, 4]) await ofertar(contaA, { position: posicao })
  for (const posicao of [0, 5]) {
    const erro = await erroDe(ofertar(contaA, { position: posicao, call_id: contaA.outraChamadaId }))
    expect(erro.message).toMatch(/call_slot_offers_posicao_util/)
  }
})

test('expires_at nasce com a duração máxima da chamada da conta', async () => {
  await banco.sql.query(
    'update public.account_settings set max_duration_seconds = 1200 where account_id = $1',
    [contaA.id],
  )
  const id = await ofertar(contaA)
  const { rows } = await banco.sql.query<{ segundos: number }>(
    `select round(extract(epoch from expires_at - created_at))::int as segundos
       from public.call_slot_offers where id = $1`,
    [id],
  )
  expect(rows[0]?.segundos).toBe(1200)

  const informado = await ofertar(contaA, { position: 2, expires_at: '2030-01-01T00:00:00Z' })
  const { rows: linhas } = await banco.sql.query<{ vence: string }>(
    `select to_char(expires_at at time zone 'UTC', 'YYYY-MM-DD') as vence
       from public.call_slot_offers where id = $1`,
    [informado],
  )
  expect(linhas[0]?.vence).toBe('2030-01-01')
})

test('classe Servidor: só há política de SELECT, e não há coluna de token', async () => {
  const { rows } = await banco.sql.query<{ cmd: string }>(
    `select cmd from pg_policies where tablename = 'call_slot_offers'`,
  )
  expect(rows.map((linha) => linha.cmd)).toEqual(['SELECT'])

  const { rows: colunas } = await banco.sql.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'call_slot_offers'`,
  )
  expect(colunas.map((c) => c.column_name).filter((nome) => /token/i.test(nome))).toEqual([])
})

test('o cliente lê as ofertas da própria conta e não escreve nenhuma', async () => {
  const id = await ofertar(contaA)
  await ofertar(contaB)

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.call_slot_offers',
  )
  expect(rows.map((linha) => linha.account_id)).toEqual([contaA.id])

  const recusa = await erroDe(ofertar(contaA, { position: 3 }))
  expect(recusa.message).toMatch(/row-level security/i)
  const { rows: alteradas } = await banco.sql.query(
    'update public.call_slot_offers set position = 4 where id = $1 returning id',
    [id],
  )
  expect(alteradas).toHaveLength(0)
  const { rows: apagadas } = await banco.sql.query(
    'delete from public.call_slot_offers where id = $1 returning id',
    [id],
  )
  expect(apagadas).toHaveLength(0)

  await banco.comoAnonimo()
  const { rows: anonimas } = await banco.sql.query('select id from public.call_slot_offers')
  expect(anonimas).toHaveLength(0)
})

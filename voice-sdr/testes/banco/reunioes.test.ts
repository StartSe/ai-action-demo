// Reuniões: a restrição de exclusão e o índice do lead. O que se prova aqui:
//
// 1. Horários encostados do mesmo especialista convivem: o intervalo é '[)'.
// 2. O horário sobreposto do mesmo especialista é recusado com SQLSTATE 23P01.
// 3. Cancelar a reunião a tira do predicado e libera o horário para uma nova.
// 4. Dois especialistas no mesmo horário convivem.
// 5. A segunda reunião ativa do mesmo lead é recusada (23505).
// 6. Classe Operação: o viewer lê e não escreve, o operador escreve, e a conta
//    vizinha recebe zero linha.
//
// btree_gist existe no PGlite desta versão (contrib/btree_gist), então a
// restrição e o 23P01 se provam em processo. A concorrência real, com duas
// transações de verdade, é da US-183 e fica para o CI.
//
// Referência: migração 20260930100000_reunioes.sql, docs/PRD-implementacao.md
// seções 3.3 e 3.9, docs/revisao-tecnica.md T-08.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

const CONFLITO_DE_EXCLUSAO = '23P01'
const VIOLACAO_DE_UNICO = '23505'

interface Conta {
  readonly id: string
  readonly operadorId: string
  readonly observadorId: string
  readonly especialistaId: string
  readonly outroEspecialistaId: string
  readonly leadId: string
  readonly outroLeadId: string
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
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  const observadorId = await banco.criarUsuario(`observador@${dominio}`, 'Observador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'operator'), ($1, $3, 'viewer')`,
    [id, operadorId, observadorId],
  )
  const especialista = (rotulo: string) =>
    um(
      `insert into public.specialists (account_id, name, email, modalities)
       values ($1, $2, $3, array['video']::text[]) returning id`,
      [id, `${rotulo} de ${nome}`, `${rotulo.toLowerCase()}@${dominio}`],
    )
  const lead = (telefone: string) =>
    um(
      `insert into public.leads (account_id, name, phone_e164, source)
       values ($1, $2, $3, 'teste') returning id`,
      [id, `Lead ${telefone}`, telefone],
    )
  return {
    id,
    operadorId,
    observadorId,
    especialistaId: await especialista('Ana'),
    outroEspecialistaId: await especialista('Bruno'),
    leadId: await lead(`+55119900000${sufixo}1`),
    outroLeadId: await lead(`+55119900000${sufixo}2`),
  }
}

function marcar(
  conta: Conta,
  campos: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const linha: Record<string, unknown> = {
    account_id: conta.id,
    lead_id: conta.leadId,
    specialist_id: conta.especialistaId,
    starts_at: '2026-10-06T17:00:00Z',
    ends_at: '2026-10-06T17:30:00Z',
    modality: 'video',
    ...campos,
  }
  const colunas = Object.keys(linha)
  return um(
    `insert into public.meetings (${colunas.join(', ')})
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
  await banco.sql.query('delete from public.meetings')
})

test('horários encostados do mesmo especialista convivem', async () => {
  await marcar(contaA)
  const seguinte = await marcar(contaA, {
    lead_id: contaA.outroLeadId,
    starts_at: '2026-10-06T17:30:00Z',
    ends_at: '2026-10-06T18:00:00Z',
  })
  expect(seguinte).toBeTruthy()
})

test('horário sobreposto do mesmo especialista é recusado com 23P01', async () => {
  await marcar(contaA)
  const erro = await erroDe(
    marcar(contaA, {
      lead_id: contaA.outroLeadId,
      starts_at: '2026-10-06T17:15:00Z',
      ends_at: '2026-10-06T17:45:00Z',
    }),
  )
  expect(erro.code).toBe(CONFLITO_DE_EXCLUSAO)
  expect(erro.message).toMatch(/meetings_sem_sobreposicao/)
})

test('cancelar tira a reunião do predicado e libera o horário', async () => {
  const primeira = await marcar(contaA)
  await banco.sql.query(
    `update public.meetings set status = 'canceled', cancel_reason = 'lead pediu' where id = $1`,
    [primeira],
  )
  const nova = await marcar(contaA, { lead_id: contaA.outroLeadId })
  expect(nova).not.toBe(primeira)
})

test('dois especialistas no mesmo horário convivem', async () => {
  await marcar(contaA)
  const outra = await marcar(contaA, {
    lead_id: contaA.outroLeadId,
    specialist_id: contaA.outroEspecialistaId,
  })
  expect(outra).toBeTruthy()
})

test('a segunda reunião ativa do mesmo lead é recusada, a remarcada não conta', async () => {
  const primeira = await marcar(contaA)
  const erro = await erroDe(
    marcar(contaA, {
      specialist_id: contaA.outroEspecialistaId,
      starts_at: '2026-10-07T17:00:00Z',
      ends_at: '2026-10-07T17:30:00Z',
    }),
  )
  expect(erro.code).toBe(VIOLACAO_DE_UNICO)
  expect(erro.message).toMatch(/meetings_one_active_per_lead/)

  await banco.sql.query(`update public.meetings set status = 'rescheduled' where id = $1`, [
    primeira,
  ])
  const remarcada = await marcar(contaA, {
    starts_at: '2026-10-07T17:00:00Z',
    ends_at: '2026-10-07T17:30:00Z',
    rescheduled_from_id: primeira,
  })
  expect(remarcada).toBeTruthy()
})

test('os checks recusam status, atestado e modalidade fora da lista', async () => {
  for (const campos of [
    { status: 'marcada' },
    { attestation_status: 'talvez' },
    { modality: 'carta' },
    { ends_at: '2026-10-06T17:00:00Z' },
  ]) {
    const erro = await erroDe(marcar(contaA, campos))
    expect(erro.code).toBe('23514')
  }
})

test('o viewer lê e não escreve; o operador escreve', async () => {
  const id = await marcar(contaA)

  await banco.comoUsuario(contaA.observadorId)
  const { rows: vistas } = await banco.sql.query('select id from public.meetings')
  expect(vistas).toHaveLength(1)
  const recusa = await erroDe(marcar(contaA, { lead_id: contaA.outroLeadId, specialist_id: contaA.outroEspecialistaId }))
  expect(recusa.message).toMatch(/row-level security/i)
  // O desfecho (status, apuração, motivo) só muda por marcar_desfecho_da_reuniao
  // desde a US-181, e quem prova isso é desfecho-da-reuniao.test.ts. A
  // política de operador se mede aqui por uma coluna que continua dela.
  const { rows: alteradas } = await banco.sql.query(
    `update public.meetings set notes = 'Levar a proposta.' where id = $1 returning id`,
    [id],
  )
  expect(alteradas).toHaveLength(0)

  await banco.comoUsuario(contaA.operadorId)
  const { rows: anotadas } = await banco.sql.query(
    `update public.meetings set notes = 'Levar a proposta.' where id = $1 returning id`,
    [id],
  )
  expect(anotadas).toHaveLength(1)
})

test('a conta vizinha recebe zero linha, e a sessão anônima também', async () => {
  await marcar(contaA)
  await marcar(contaB)

  await banco.comoUsuario(contaB.operadorId)
  const { rows: daVizinha } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.meetings',
  )
  expect(daVizinha.map((linha) => linha.account_id)).toEqual([contaB.id])

  await banco.comoAnonimo()
  const { rows: anonimas } = await banco.sql.query('select id from public.meetings')
  expect(anonimas).toHaveLength(0)
})

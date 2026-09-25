// marcar_desfecho_da_reuniao: o desfecho marcado à mão (US-181, RF-512).
// O que se prova aqui:
//
// 1. Cada desfecho grava status, attestation_status 'attested', attested_by,
//    attested_at e attested_source 'manual', e uma linha de trilha com autor e
//    motivo, na mesma chamada.
// 2. Cancelar sem motivo devolve `motivo_obrigatorio` e nada muda.
// 3. Cancelar libera o horário: outra reunião entra no mesmo intervalo.
// 4. A segunda marcação devolve `ja_apurada` sem `p_sobrescrever`; com ele,
//    grava, e as duas ficam na trilha com autor e hora.
// 5. O viewer recebe `sem_papel`; a conta vizinha e a reunião de ensaio
//    recebem o mesmo `nao_encontrada` da inexistente.
// 6. Update direto das colunas do desfecho por sessão com usuário é recusado
//    (42501); a rotina do servidor, sem usuário, continua podendo.
// 7. Reunião que ninguém apurou continua 'pending' (RF-516): nada aqui a muda
//    sozinho.
//
// Referência: migração 20260930190000_desfecho_da_reuniao.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly operadorId: string
  readonly outroOperadorId: string
  readonly observadorId: string
  readonly especialistaId: string
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
  const outroOperadorId = await banco.criarUsuario(`outro@${dominio}`, 'Outro operador')
  const observadorId = await banco.criarUsuario(`observador@${dominio}`, 'Observador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'operator'), ($1, $3, 'admin'), ($1, $4, 'viewer')`,
    [id, operadorId, outroOperadorId, observadorId],
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
    outroOperadorId,
    observadorId,
    especialistaId: await um(
      `insert into public.specialists (account_id, name, email, modalities)
       values ($1, $2, $3, array['video']::text[]) returning id`,
      [id, `Ana de ${nome}`, `ana@${dominio}`],
    ),
    leadId: await lead(`+55119800000${sufixo}1`),
    outroLeadId: await lead(`+55119800000${sufixo}2`),
  }
}

function marcarReuniao(conta: Conta, campos: Readonly<Record<string, unknown>> = {}): Promise<string> {
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

async function desfecho(
  usuarioId: string,
  reuniaoId: string,
  valor: string,
  motivo: string | null = null,
  sobrescrever = false,
): Promise<string> {
  await banco.comoUsuario(usuarioId)
  const { rows } = await banco.sql.query<{ codigo: string }>(
    'select public.marcar_desfecho_da_reuniao($1, $2, $3, $4) as codigo',
    [reuniaoId, valor, motivo, sobrescrever],
  )
  await banco.comoServico()
  return rows[0]!.codigo
}

interface LinhaDaReuniao {
  status: string
  attestation_status: string
  attested_by: string | null
  apurada: boolean
  attested_source: string | null
  cancel_reason: string | null
}

async function reuniao(id: string): Promise<LinhaDaReuniao> {
  const { rows } = await banco.sql.query<LinhaDaReuniao>(
    `select status, attestation_status, attested_by, attested_at is not null as apurada,
            attested_source, cancel_reason
       from public.meetings where id = $1`,
    [id],
  )
  return rows[0]!
}

interface LinhaDaTrilha {
  actor: string
  actor_id: string | null
  reason: string | null
  depois: Record<string, unknown>
}

async function trilha(id: string): Promise<LinhaDaTrilha[]> {
  const { rows } = await banco.sql.query<LinhaDaTrilha>(
    `select actor, actor_id, reason, payload -> 'depois' as depois
       from public.audit_log
      where target_type = 'meetings' and target_id = $1 and action = 'update'
      order by created_at, id`,
    [id],
  )
  return rows
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
  await banco.sql.query(`delete from public.audit_log where target_type = 'meetings'`)
})

test.each([
  ['attended', null, null],
  ['no_show', 'Esperou 15 minutos.', 'Esperou 15 minutos.'],
  ['canceled', 'O lead pediu para desmarcar.', 'O lead pediu para desmarcar.'],
])('%s grava a apuração manual e a trilha com autor e motivo', async (valor, motivo, razao) => {
  const id = await marcarReuniao(contaA)

  expect(await desfecho(contaA.operadorId, id, valor, motivo)).toBe('marcada')

  expect(await reuniao(id)).toEqual({
    status: valor,
    attestation_status: 'attested',
    attested_by: contaA.operadorId,
    apurada: true,
    attested_source: 'manual',
    cancel_reason: valor === 'canceled' ? motivo : null,
  })
  const linhas = await trilha(id)
  expect(linhas).toHaveLength(1)
  expect(linhas[0]).toMatchObject({ actor: 'user', actor_id: contaA.operadorId, reason: razao })
  expect(linhas[0]!.depois).toMatchObject({ status: valor, attestation_status: 'attested', attested_source: 'manual' })
})

test('cancelar sem motivo devolve motivo_obrigatorio, e nada muda', async () => {
  const id = await marcarReuniao(contaA)

  for (const motivo of [null, '', '   ']) {
    expect(await desfecho(contaA.operadorId, id, 'canceled', motivo)).toBe('motivo_obrigatorio')
  }
  expect(await reuniao(id)).toMatchObject({ status: 'scheduled', attestation_status: 'pending', attested_by: null })
  expect(await trilha(id)).toEqual([])
})

test('desfecho fora dos três devolve desfecho_desconhecido', async () => {
  const id = await marcarReuniao(contaA)
  for (const valor of ['confirmed', 'rescheduled', 'realizada']) {
    expect(await desfecho(contaA.operadorId, id, valor)).toBe('desfecho_desconhecido')
  }
  expect((await reuniao(id)).status).toBe('scheduled')
})

test('cancelar libera o horário: outra reunião entra no mesmo intervalo', async () => {
  const id = await marcarReuniao(contaA)
  const antes = await erroDe(marcarReuniao(contaA, { lead_id: contaA.outroLeadId }))
  expect(antes.code).toBe('23P01')

  expect(await desfecho(contaA.operadorId, id, 'canceled', 'Especialista doente.')).toBe('marcada')

  const nova = await marcarReuniao(contaA, { lead_id: contaA.outroLeadId })
  expect(nova).not.toBe(id)
})

test('a segunda marcação pede confirmação, e as duas ficam na trilha com autor e hora', async () => {
  const id = await marcarReuniao(contaA)
  expect(await desfecho(contaA.operadorId, id, 'no_show')).toBe('marcada')

  expect(await desfecho(contaA.outroOperadorId, id, 'attended')).toBe('ja_apurada')
  expect(await reuniao(id)).toMatchObject({ status: 'no_show', attested_by: contaA.operadorId })

  expect(await desfecho(contaA.outroOperadorId, id, 'attended', 'O lead entrou atrasado.', true)).toBe('marcada')
  expect(await reuniao(id)).toMatchObject({ status: 'attended', attested_by: contaA.outroOperadorId })

  const { rows } = await banco.sql.query<{ actor_id: string; reason: string; status: string; hora: boolean }>(
    `select actor_id, reason, payload -> 'depois' ->> 'status' as status, created_at is not null as hora
       from public.audit_log
      where target_type = 'meetings' and target_id = $1 and action = 'update'
      order by actor_id = $2 desc`,
    [id, contaA.operadorId],
  )
  expect(rows).toEqual([
    { actor_id: contaA.operadorId, reason: null, status: 'no_show', hora: true },
    { actor_id: contaA.outroOperadorId, reason: 'O lead entrou atrasado.', status: 'attended', hora: true },
  ])
})

test('o viewer recebe sem_papel e lê a reunião intocada', async () => {
  const id = await marcarReuniao(contaA)

  expect(await desfecho(contaA.observadorId, id, 'attended')).toBe('sem_papel')
  expect(await reuniao(id)).toMatchObject({ status: 'scheduled', attestation_status: 'pending' })
  expect(await trilha(id)).toEqual([])
})

test('a conta vizinha, a reunião inexistente e a de ensaio dão o mesmo nao_encontrada', async () => {
  const id = await marcarReuniao(contaA)
  expect(await desfecho(contaB.operadorId, id, 'attended')).toBe('nao_encontrada')
  expect(await desfecho(contaA.operadorId, '00000000-0000-4000-8000-000000000000', 'attended')).toBe(
    'nao_encontrada',
  )

  const ensaio = await um(
    `insert into public.calls (account_id, purpose, direction, status, idempotency_key)
     values ($1, 'discovery', 'rehearsal', 'ended', $2) returning id`,
    [contaA.id, crypto.randomUUID()],
  )
  const deEnsaio = await marcarReuniao(contaA, {
    lead_id: contaA.outroLeadId,
    starts_at: '2026-10-07T17:00:00Z',
    ends_at: '2026-10-07T17:30:00Z',
    booked_call_id: ensaio,
  })
  expect(await desfecho(contaA.operadorId, deEnsaio, 'attended')).toBe('nao_encontrada')

  expect((await reuniao(id)).status).toBe('scheduled')
  expect((await reuniao(deEnsaio)).status).toBe('scheduled')
})

test('update direto do desfecho com sessão é recusado; o da rotina passa', async () => {
  const id = await marcarReuniao(contaA)

  await banco.comoUsuario(contaA.operadorId)
  for (const conjunto of [
    `status = 'canceled'`,
    `attestation_status = 'attested'`,
    `attested_at = now()`,
    `cancel_reason = 'por fora'`,
  ]) {
    const erro = await erroDe(banco.sql.query(`update public.meetings set ${conjunto} where id = $1`, [id]))
    expect({ conjunto, code: erro.code }).toEqual({ conjunto, code: '42501' })
  }
  // As demais colunas continuam do operador pela política de sempre.
  const { rows } = await banco.sql.query(`update public.meetings set notes = 'Levar a proposta.' where id = $1 returning id`, [id])
  expect(rows).toHaveLength(1)

  await banco.comoServico()
  await banco.sql.query(`update public.meetings set status = 'rescheduled' where id = $1`, [id])
  expect((await reuniao(id)).status).toBe('rescheduled')
})

test('a trava do RPC cai com a própria escrita: o update seguinte volta a ser recusado', async () => {
  const id = await marcarReuniao(contaA)
  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query<{ codigo: string }>(
    `select public.marcar_desfecho_da_reuniao($1, 'attended') as codigo`,
    [id],
  )
  expect(rows[0]!.codigo).toBe('marcada')
  const erro = await erroDe(banco.sql.query(`update public.meetings set status = 'no_show' where id = $1`, [id]))
  expect(erro.code).toBe('42501')
  await banco.comoServico()
  expect((await reuniao(id)).status).toBe('attended')
})

test('nada apura sozinho: reunião que passou sem marcação continua pending (RF-516)', async () => {
  const id = await marcarReuniao(contaA, { starts_at: '2026-01-06T17:00:00Z', ends_at: '2026-01-06T17:30:00Z' })
  expect(await reuniao(id)).toMatchObject({ status: 'scheduled', attestation_status: 'pending', apurada: false })

  const { rows } = await banco.sql.query<{ padrao: string }>(
    `select column_default as padrao from information_schema.columns
      where table_schema = 'public' and table_name = 'meetings' and column_name = 'attestation_status'`,
  )
  expect(rows[0]!.padrao).toMatch(/'pending'/)
})

test('só authenticated executa; anon não', async () => {
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee from information_schema.routine_privileges
      where routine_schema = 'public' and routine_name = 'marcar_desfecho_da_reuniao'
        and privilege_type = 'EXECUTE'
      order by grantee`,
  )
  const quem = rows.map((linha) => linha.grantee)
  expect(quem).toContain('authenticated')
  expect(quem).not.toContain('anon')
  expect(quem).not.toContain('PUBLIC')
})

// agendar_reuniao: teto e antecedência na mesma transação da inserção.
// O que se prova aqui:
//
// 1. Cada código de recusa aparece no caso que o gera, e nenhum SQLSTATE sai.
// 2. O teto conta só scheduled e confirmed: a cancelada não consome vaga.
// 3. A virada do dia do teto é a do especialista: a reunião das 23h de Manaus
//    conta no dia de Manaus, mesmo com a conta em São Paulo.
// 4. O sucesso grava last_assigned_at e uma linha de auditoria com o motivo.
// 5. Só service_role executa.
//
// A concorrência real (duas transações ao mesmo tempo) é da US-183 e fica para
// o CI: o PGlite é uma conexão só.
//
// Referência: migração 20260930120000_agendar_reuniao.sql, T-08 item 4.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

const SP = 'America/Sao_Paulo'
const MANAUS = 'America/Manaus'

let banco: BancoDeTeste
let contaId: string
let adminId: string
let anaId: string
let manausId: string
let inativoId: string
let semFaixaId: string
let leadsCriados = 0

async function um(sql: string, parametros: unknown[]): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

async function especialista(
  nome: string,
  campos: { fuso?: string; teto?: number; ativo?: boolean; faixas?: boolean } = {},
): Promise<string> {
  const id = await um(
    `insert into public.specialists
       (account_id, name, email, modalities, timezone, daily_cap, min_notice_min, max_notice_days, active)
     values ($1, $2, $3, array['video']::text[], $4, $5, 120, 30, $6) returning id`,
    [contaId, nome, `${nome.toLowerCase()}@aurora.test`, campos.fuso ?? SP, campos.teto ?? 6, campos.ativo ?? true],
  )
  if (campos.faixas ?? true) {
    await banco.sql.query(
      `insert into public.specialist_availability (account_id, specialist_id, weekday, start_time, end_time)
       select $1, $2, d, '00:00', '24:00' from generate_series(0, 6) d`,
      [contaId, id],
    )
  }
  return id
}

async function novoLead(): Promise<string> {
  leadsCriados += 1
  return um(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead', $2, 'teste') returning id`,
    [contaId, `+551198${String(leadsCriados).padStart(7, '0')}`],
  )
}

/** O instante de "daqui a N dias, às HH:MM" no fuso pedido. */
async function instante(fuso: string, dias: number, hora: string): Promise<string> {
  const { rows } = await banco.sql.query<{ iso: string }>(
    `select to_char(
       ((date_trunc('day', now() at time zone $1) + make_interval(days => $2) + $3::time)
          at time zone $1) at time zone 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS"Z"') as iso`,
    [fuso, dias, hora],
  )
  return rows[0]!.iso
}

async function mais(iso: string, minutos: number): Promise<string> {
  return new Date(Date.parse(iso) + minutos * 60_000).toISOString()
}

async function agendar(
  especialistaId: string,
  inicio: string,
  campos: { lead?: string; duracao?: number } = {},
): Promise<{ resultado: string; reuniao_id: string | null }> {
  const lead = campos.lead ?? (await novoLead())
  const { rows } = await banco.sql.query<{ resultado: string; reuniao_id: string | null }>(
    `select * from public.agendar_reuniao($1, $2, $3, $4, $5, 'video', null, null)`,
    [contaId, lead, especialistaId, inicio, await mais(inicio, campos.duracao ?? 30)],
  )
  return rows[0]!
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaId = await um(`insert into public.accounts (name, timezone) values ('Transportes Aurora', $1) returning id`, [SP])
  adminId = await banco.criarUsuario('admin@aurora.test', 'Admin')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'admin')`,
    [contaId, adminId],
  )
  anaId = await especialista('Ana')
  manausId = await especialista('Mauro', { fuso: MANAUS, teto: 1 })
  inativoId = await especialista('Ines', { ativo: false })
  semFaixaId = await especialista('Sergio', { faixas: false })
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.meetings')
})

test('a reunião entra, com last_assigned_at e auditoria', async () => {
  await banco.sql.query(`select set_config('app.audit_reason', 'marcada na ligação', false)`)
  const inicio = await instante(SP, 3, '14:00')
  const { resultado, reuniao_id } = await agendar(anaId, inicio)
  expect(resultado).toBe('agendada')
  expect(reuniao_id).toBeTruthy()

  const { rows: marca } = await banco.sql.query<{ marcado: boolean }>(
    `select last_assigned_at is not null as marcado from public.specialists where id = $1`,
    [anaId],
  )
  expect(marca[0]?.marcado).toBe(true)

  const { rows: trilha } = await banco.sql.query<{ source: string; reason: string | null }>(
    `select source, reason from public.audit_log where target_id = $1`,
    [reuniao_id],
  )
  expect(trilha).toEqual([{ source: 'rpc:agendar_reuniao', reason: 'marcada na ligação' }])
  await banco.sql.query(`select set_config('app.audit_reason', '', false)`)
})

test('a sétima do dia com teto 6 recebe teto_diario, e a cancelada não consome vaga', async () => {
  const ids: string[] = []
  for (let i = 0; i < 6; i += 1) {
    const inicio = await instante(SP, 4, `${String(8 + i).padStart(2, '0')}:00`)
    const { resultado, reuniao_id } = await agendar(anaId, inicio)
    expect(resultado).toBe('agendada')
    ids.push(reuniao_id!)
  }
  const setima = await agendar(anaId, await instante(SP, 4, '16:00'))
  expect(setima.resultado).toBe('teto_diario')

  await banco.sql.query(`update public.meetings set status = 'canceled' where id = $1`, [ids[0]])
  const depois = await agendar(anaId, await instante(SP, 4, '16:00'))
  expect(depois.resultado).toBe('agendada')
})

test('a virada do dia do teto é a do especialista, em Manaus', async () => {
  // Teto 1. A das 23h de Manaus é 01h do dia seguinte em São Paulo e 03h em UTC;
  // contada no dia de Manaus, ela ocupa a vaga daquele dia e a das 10h recusa.
  const noite = await agendar(manausId, await instante(MANAUS, 5, '23:00'))
  expect(noite.resultado).toBe('agendada')
  const manha = await agendar(manausId, await instante(MANAUS, 5, '10:00'))
  expect(manha.resultado).toBe('teto_diario')
  const seguinte = await agendar(manausId, await instante(MANAUS, 6, '10:00'))
  expect(seguinte.resultado).toBe('agendada')
})

test('antecedência mínima e máxima', async () => {
  const cedo = new Date(Date.now() + 30 * 60_000).toISOString()
  expect((await agendar(anaId, cedo)).resultado).toBe('antecedencia_minima')
  expect((await agendar(anaId, await instante(SP, 40, '14:00'))).resultado).toBe(
    'antecedencia_maxima',
  )
})

test('horário sobreposto e lead com reunião ativa viram código, não SQLSTATE', async () => {
  const inicio = await instante(SP, 3, '10:00')
  const lead = await novoLead()
  expect((await agendar(anaId, inicio, { lead })).resultado).toBe('agendada')
  expect((await agendar(anaId, await mais(inicio, 15))).resultado).toBe('horario_ocupado')
  expect((await agendar(anaId, await instante(SP, 3, '15:00'), { lead })).resultado).toBe(
    'lead_com_reuniao_ativa',
  )
})

test('especialista inativo, de outra conta ou fora da disponibilidade', async () => {
  const inicio = await instante(SP, 3, '14:00')
  expect((await agendar(inativoId, inicio)).resultado).toBe('especialista_inativo')
  expect((await agendar('00000000-0000-4000-8000-000000000000', inicio)).resultado).toBe(
    'especialista_inativo',
  )
  expect((await agendar(semFaixaId, inicio)).resultado).toBe('fora_da_disponibilidade')

  await banco.sql.query(
    `insert into public.specialist_blocks (account_id, specialist_id, starts_at, ends_at)
     values ($1, $2, $3, $4)`,
    [contaId, anaId, inicio, await mais(inicio, 60)],
  )
  expect((await agendar(anaId, inicio)).resultado).toBe('fora_da_disponibilidade')
  await banco.sql.query('delete from public.specialist_blocks')
})

test('só service_role executa', async () => {
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee from information_schema.routine_privileges
      where routine_schema = 'public' and routine_name = 'agendar_reuniao'
        and privilege_type = 'EXECUTE'
      order by grantee`,
  )
  const quem = rows.map((linha) => linha.grantee)
  expect(quem).toContain('service_role')
  expect(quem).not.toContain('authenticated')
  expect(quem).not.toContain('anon')
  expect(quem).not.toContain('PUBLIC')
})

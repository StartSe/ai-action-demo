// O calendário por endereço iCal no banco: `conectar_calendario_ical`. O que
// se prova aqui:
//
// 1. O administrador grava o endereço com a própria sessão; ele vai para o
//    Vault e a linha fica com `provider = 'ical'` e o ponteiro.
// 2. Trocar o endereço reaproveita o mesmo segredo e limpa a falha antiga.
// 3. Operador, especialista de outra conta e sessão anônima são recusados.
// 4. Endereço sem TLS ou com espaço é recusado pelo banco também.
//
// Referência: migração 20261012110000_calendario_por_endereco_ical.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let especialistaId: string
let especialistaAlheioId: string
let adminId: string
let operadorId: string

const ENDERECO = 'https://calendar.google.com/calendar/ical/ana%40exemplo.test/private-abc123/basic.ics'

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Agenda por Endereço'), ('Outra Conta') returning id`,
  )
  contaId = rows[0]!.id
  const outraContaId = rows[1]!.id
  adminId = await banco.criarUsuario('admin@ical.test', 'Admin')
  operadorId = await banco.criarUsuario('operador@ical.test', 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'operator')`,
    [contaId, adminId, operadorId],
  )
  const especialistas = await banco.sql.query<{ id: string }>(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, 'Ana', 'ana@ical.test', array['video']::text[]),
            ($2, 'Alheio', 'alheio@ical.test', array['video']::text[])
     returning id`,
    [contaId, outraContaId],
  )
  especialistaId = especialistas.rows[0]!.id
  especialistaAlheioId = especialistas.rows[1]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.specialist_calendars')
  await banco.sql.query(`delete from vault.secrets where name like 'calendar:%'`)
})

async function conectar(endereco: string, especialista = especialistaId): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>('select public.conectar_calendario_ical($1, $2) as id', [
    especialista,
    endereco,
  ])
  return rows[0]!.id
}

async function enderecoLido(calendarioId: string): Promise<string | null> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ endereco: string | null }>('select public.token_do_calendario($1, $2) as endereco', [
    contaId,
    calendarioId,
  ])
  return rows[0]!.endereco
}

test('o administrador grava o endereço: Vault para o valor, linha com o ponteiro', async () => {
  await banco.comoUsuario(adminId)
  const id = await conectar(ENDERECO)

  expect(await enderecoLido(id)).toBe(ENDERECO)
  const { rows } = await banco.sql.query<Record<string, unknown>>(
    'select provider, external_id, sync_error from public.specialist_calendars where id = $1',
    [id],
  )
  expect(rows).toEqual([{ provider: 'ical', external_id: 'endereco_ical', sync_error: null }])
  // O endereço não está na tabela, em coluna nenhuma.
  const linha = await banco.sql.query('select * from public.specialist_calendars where id = $1', [id])
  expect(JSON.stringify(linha.rows)).not.toContain('private-abc123')
})

test('trocar o endereço reaproveita o segredo e limpa a falha', async () => {
  await banco.comoUsuario(adminId)
  const primeiro = await conectar(ENDERECO)
  await banco.comoServico()
  await banco.sql.query(`update public.specialist_calendars set sync_error = 'O endereço iCal não abriu.' where id = $1`, [primeiro])
  const { rows: antes } = await banco.sql.query<{ n: number }>(`select count(*)::int as n from vault.secrets where name like 'calendar:%'`)

  await banco.comoUsuario(adminId)
  const segundo = await conectar(`${ENDERECO}?novo=1`)
  expect(segundo).toBe(primeiro)
  expect(await enderecoLido(segundo)).toBe(`${ENDERECO}?novo=1`)
  const { rows: depois } = await banco.sql.query<{ n: number }>(`select count(*)::int as n from vault.secrets where name like 'calendar:%'`)
  expect(depois[0]!.n).toBe(antes[0]!.n)
  const { rows } = await banco.sql.query('select sync_error from public.specialist_calendars where id = $1', [segundo])
  expect(rows).toEqual([{ sync_error: null }])
})

test('operador, especialista de outra conta e anônimo são recusados', async () => {
  await banco.comoUsuario(operadorId)
  await expect(conectar(ENDERECO)).rejects.toMatchObject({ code: '42501' })

  await banco.comoUsuario(adminId)
  await expect(conectar(ENDERECO, especialistaAlheioId)).rejects.toMatchObject({ code: '42501' })

  await banco.comoAnonimo()
  await expect(conectar(ENDERECO)).rejects.toThrow(/permission denied/i)

  await banco.comoServico()
  const { rows } = await banco.sql.query('select id from public.specialist_calendars')
  expect(rows).toEqual([])
})

test('endereço sem TLS, com espaço ou vazio é recusado pelo banco', async () => {
  await banco.comoUsuario(adminId)
  for (const errado of ['http://calendario.test/a.ics', 'https://calendario.test/a b.ics', '   ', 'webcal://calendario.test/a.ics']) {
    await expect(conectar(errado)).rejects.toMatchObject({ code: '22023' })
  }
})

// Ligar a ligação ao lead novo pela tela (D-03, RF-610).
//
// Referência: migração 20261013110000_ligacao_ao_lead_novo.sql. O que se prova:
// o admin liga e o prazo muda com o motivo na trilha; operador e conta vizinha
// são recusados; motivo em branco e prazo fora da faixa são recusados; ligado,
// o lead do formulário vira candidato de `candidatos_do_fala_rapido`; e o
// padrão da conta nova continua desligado.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly adminId: string
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
  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'admin'), ($1, $3, 'operator')`,
    [id, adminId, operadorId],
  )
  return { id, adminId, operadorId }
}

async function erroDe(manobra: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await manobra
  } catch (erro) {
    const bruto = erro as { code?: string; message?: string }
    return { code: bruto.code, message: String(bruto.message) }
  } finally {
    await banco.comoServico()
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

function definir(contaId: string, ligada: boolean | null, minutos: number | null, motivo: string | null) {
  return banco.sql.query<{ r: { speed_to_lead_enabled: boolean; speed_to_lead_minutes: number } }>(
    'select public.definir_ligacao_ao_lead_novo($1, $2, $3, $4) as r',
    [contaId, ligada, minutos, motivo],
  )
}

async function lerConfiguracao(contaId: string) {
  const { rows } = await banco.sql.query<{ ligada: boolean; minutos: number }>(
    `select speed_to_lead_enabled as ligada, speed_to_lead_minutes as minutos
       from public.account_settings where account_id = $1`,
    [contaId],
  )
  return rows[0]!
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Sol do Vale Energia', 'soldovale.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query(
    'update public.account_settings set speed_to_lead_enabled = default, speed_to_lead_minutes = default',
  )
  await banco.sql.query(`delete from public.audit_log where target_type = 'account_settings'`)
})

test('a conta nasce com a ligação ao lead novo desligada', async () => {
  expect(await lerConfiguracao(contaA.id)).toEqual({ ligada: false, minutos: 5 })
})

test('o admin liga com o prazo, e a trilha leva o autor e o motivo', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await definir(contaA.id, true, 10, 'Formulário do site no ar.')
  await banco.comoServico()

  expect(rows[0]?.r).toEqual({ speed_to_lead_enabled: true, speed_to_lead_minutes: 10 })
  expect(await lerConfiguracao(contaA.id)).toEqual({ ligada: true, minutos: 10 })

  const { rows: trilha } = await banco.sql.query<{ actor_id: string; reason: string }>(
    `select actor_id, reason from public.audit_log
      where account_id = $1 and target_type = 'account_settings'`,
    [contaA.id],
  )
  expect(trilha).toEqual([{ actor_id: contaA.adminId, reason: 'Formulário do site no ar.' }])
})

test('prazo nulo não mexe no prazo', async () => {
  await banco.comoUsuario(contaA.adminId)
  await definir(contaA.id, true, null, 'Só ligar.')
  await banco.comoServico()
  expect(await lerConfiguracao(contaA.id)).toEqual({ ligada: true, minutos: 5 })
})

test('operador e admin da conta vizinha recebem 42501, e nada muda', async () => {
  await banco.comoUsuario(contaA.operadorId)
  expect(await erroDe(definir(contaA.id, true, 5, 'Tentativa.'))).toMatchObject({ code: '42501' })
  await banco.comoUsuario(contaB.adminId)
  expect(await erroDe(definir(contaA.id, true, 5, 'Tentativa.'))).toMatchObject({ code: '42501' })
  expect(await lerConfiguracao(contaA.id)).toEqual({ ligada: false, minutos: 5 })
})

test('motivo em branco e prazo fora de 1 a 1440 são recusados', async () => {
  await banco.comoUsuario(contaA.adminId)
  expect(await erroDe(definir(contaA.id, true, 5, '   '))).toMatchObject({ code: '22023' })
  await banco.comoUsuario(contaA.adminId)
  expect(await erroDe(definir(contaA.id, true, 0, 'Prazo zero.'))).toMatchObject({ code: '23514' })
  await banco.comoUsuario(contaA.adminId)
  expect(await erroDe(definir(contaA.id, null, 5, 'Sem decisão.'))).toMatchObject({ code: '22023' })
  expect(await lerConfiguracao(contaA.id)).toEqual({ ligada: false, minutos: 5 })
})

test('ligada pela tela, o lead do formulário vira candidato da ligação imediata', async () => {
  const { rows: lead } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Joana Prado', '+5548999123456', 'intake') returning id`,
    [contaA.id],
  )
  const candidatos = async () => {
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ lead_id: string }>(
      'select lead_id from public.candidatos_do_fala_rapido($1, 25)',
      [new Date(Date.now() + 60_000).toISOString()],
    )
    return rows.map((linha) => linha.lead_id)
  }

  expect(await candidatos()).not.toContain(lead[0]!.id)
  await banco.comoUsuario(contaA.adminId)
  await definir(contaA.id, true, 5, 'Formulário do site no ar.')
  expect(await candidatos()).toContain(lead[0]!.id)
})

test('execução só para authenticated', async () => {
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee from information_schema.routine_privileges
      where routine_schema = 'public' and routine_name = 'definir_ligacao_ao_lead_novo'
        and privilege_type = 'EXECUTE'`,
  )
  const papeis = rows.map((linha) => linha.grantee)
  expect(papeis).toContain('authenticated')
  expect(papeis).not.toContain('PUBLIC')
  expect(papeis).not.toContain('anon')
})

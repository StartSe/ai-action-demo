// O caminho único para mover lead de etapa (US-128). O que se prova:
//
// 1. Move pela chave e escreve o evento com autor, de e para.
// 2. Recusa lead de outra conta, chave inexistente, papel insuficiente.
// 3. Mesma etapa não grava segundo evento.
// 4. Renomear o rótulo de qualified e mover de novo continua funcionando, e o
//    evento antigo guarda o nome de então: é a prova de banco do terceiro
//    critério de aceite da F4.
//
// Referência: migração 20260929120000_mover_lead_de_etapa.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly adminId: string
  readonly operadorId: string
  readonly observadorId: string
  readonly leadId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(nome: string, dominio: string, telefone: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  const observadorId = await banco.criarUsuario(`observador@${dominio}`, 'Observador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'admin'), ($1, $3, 'operator'), ($1, $4, 'viewer')`,
    [id, adminId, operadorId, observadorId],
  )
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164) values ($1, 'Marcos', $2) returning id`,
    [id, telefone],
  )
  return { id, adminId, operadorId, observadorId, leadId: leads[0]!.id }
}

interface Resultado {
  resultado: string
  stage_id: string | null
}

async function mover(
  chave: string,
  lead: string,
  ator = 'agent',
  atorId: string | null = null,
): Promise<Resultado> {
  const { rows } = await banco.sql.query<Resultado>(
    'select * from public.mover_lead_de_etapa($1, $2, $3, $4, $5)',
    [lead, chave, ator, atorId, 'teste'],
  )
  return rows[0]!
}

async function comoBorda(): Promise<void> {
  await banco.comoServico()
  await banco.sql.query('set role service_role')
}

async function eventos(conta: Conta): Promise<
  { actor: string; actor_id: string | null; payload: { de: { key: string | null; label: string | null }; para: { key: string; label: string } } }[]
> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    actor: string
    actor_id: string | null
    payload: { de: { key: string | null; label: string | null }; para: { key: string; label: string } }
  }>(
    `select actor, actor_id, payload from public.lead_events
      where lead_id = $1 and kind = 'stage_change' order by created_at, id`,
    [conta.leadId],
  )
  return rows
}

async function chaveAtual(conta: Conta): Promise<string | null> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ key: string | null }>(
    `select s.key from public.leads as l left join public.pipeline_stages as s on s.id = l.stage_id
      where l.id = $1`,
    [conta.leadId],
  )
  return rows[0]!.key
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
  await banco.sql.query(`update public.pipeline_stages set label = 'Qualificado' where key = 'qualified'`)
  await banco.sql.query('delete from public.lead_events')
  await banco.sql.query(
    `update public.leads as l set stage_id = s.id, last_activity_at = null
       from public.pipeline_stages as s
      where s.account_id = l.account_id and s.key = 'new'`,
  )
})

test('a borda move pela chave, com a Sarah como autora', async () => {
  await comoBorda()
  const r = await mover('qualified', contaA.leadId)
  expect(r.resultado).toBe('movido')
  expect(await chaveAtual(contaA)).toBe('qualified')

  const lista = await eventos(contaA)
  expect(lista).toHaveLength(1)
  expect(lista[0]).toMatchObject({
    actor: 'agent',
    payload: {
      de: { key: 'new', label: 'Novo' },
      para: { key: 'qualified', label: 'Qualificado' },
    },
  })

  const { rows } = await banco.sql.query<{ last_activity_at: string | null }>(
    'select last_activity_at from public.leads where id = $1',
    [contaA.leadId],
  )
  expect(rows[0]!.last_activity_at).not.toBeNull()
})

test('o operador move, e o autor é quem está na sessão', async () => {
  await banco.comoUsuario(contaA.operadorId)
  // O argumento de autor é ignorado com sessão.
  const r = await mover('contacted', contaA.leadId, 'agent', null)
  expect(r.resultado).toBe('movido')
  const lista = await eventos(contaA)
  expect(lista[0]).toMatchObject({ actor: 'user', actor_id: contaA.operadorId })
})

test('o observador não move', async () => {
  await banco.comoUsuario(contaA.observadorId)
  expect((await mover('contacted', contaA.leadId)).resultado).toBe('sem_permissao')
  expect(await chaveAtual(contaA)).toBe('new')
})

test('lead de outra conta é recusado', async () => {
  await banco.comoUsuario(contaA.adminId)
  expect((await mover('qualified', contaB.leadId)).resultado).toBe('lead_de_outra_conta')
  expect(await chaveAtual(contaB)).toBe('new')
})

test('lead inexistente e chave inexistente são recusados', async () => {
  await comoBorda()
  expect((await mover('qualified', '00000000-0000-4000-8000-000000000000')).resultado).toBe(
    'lead_inexistente',
  )
  expect((await mover('Qualificado', contaA.leadId)).resultado).toBe('etapa_inexistente')
  expect(await eventos(contaA)).toHaveLength(0)
})

test('mover para a mesma etapa não grava segundo evento', async () => {
  await comoBorda()
  expect((await mover('qualified', contaA.leadId)).resultado).toBe('movido')
  await comoBorda()
  expect((await mover('qualified', contaA.leadId)).resultado).toBe('mesma_etapa')
  expect(await eventos(contaA)).toHaveLength(1)
})

test('renomear qualified para Tem fit não quebra a automação, e a história guarda o nome de então', async () => {
  await comoBorda()
  expect((await mover('qualified', contaA.leadId)).resultado).toBe('movido')
  await comoBorda()
  expect((await mover('contacted', contaA.leadId)).resultado).toBe('movido')

  await banco.comoUsuario(contaA.adminId)
  await banco.sql.query(
    `update public.pipeline_stages set label = 'Tem fit' where account_id = $1 and key = 'qualified'`,
    [contaA.id],
  )

  await comoBorda()
  const r = await mover('qualified', contaA.leadId)
  expect(r.resultado).toBe('movido')
  expect(await chaveAtual(contaA)).toBe('qualified')

  const lista = await eventos(contaA)
  expect(lista.map((e) => e.payload.para.label)).toEqual(['Qualificado', 'Contatado', 'Tem fit'])
  // O nome antigo não pode ser usado como chave.
  await comoBorda()
  expect((await mover('Tem fit', contaA.leadId)).resultado).toBe('etapa_inexistente')
})

test('anônimo não executa, e os grants são os declarados', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee from information_schema.routine_privileges
      where routine_name = 'mover_lead_de_etapa' and privilege_type = 'EXECUTE'
      order by grantee`,
  )
  const quem = rows.map((r) => r.grantee)
  expect(quem).toContain('authenticated')
  expect(quem).toContain('service_role')
  expect(quem).not.toContain('anon')
  expect(quem).not.toContain('PUBLIC')
})

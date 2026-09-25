// O lead de ensaio (US-112, T-25).
//
// O que este arquivo prova:
//
// 1. `abrir_ensaio` pendura a chamada de ensaio num lead sintético da conta,
//    marcado como tal, e o segundo ensaio reusa o mesmo lead.
// 2. Cada conta tem o seu: o lead de ensaio de uma não serve à outra.
// 3. O lead sintético fica fora da listagem: o membro lê os leads da conta e
//    não o vê, nem na contagem.
// 4. O perfil escolhido fica em `rehearsals.persona_profile`, que é de onde
//    `call-init` o lê pelo `call_id`.
// 5. Só `service_role` executa `lead_de_ensaio`.
//
// Referência: migração 20260924210000_lead_de_ensaio.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaA: string
let donoA: string
let contaB: string
const publicacoes = new Map<string, string>()

async function criarConta(nome: string, email: string): Promise<{ id: string; donoId: string }> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const donoId = await banco.criarUsuario(email, nome)
  await banco.sql.query(
    "insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')",
    [id, donoId],
  )
  const { rows: agentes } = await banco.sql.query<{ id: string }>(
    "insert into public.agents (account_id, name, company_name) values ($1, 'Sarah', $2) returning id",
    [id, nome],
  )
  const { rows: pubs } = await banco.sql.query<{ id: string }>(
    `insert into public.agent_publications (account_id, agent_id, purpose)
     values ($1, $2, 'discovery') returning id`,
    [id, agentes[0]!.id],
  )
  publicacoes.set(id, pubs[0]!.id)
  return { id, donoId }
}

async function abrir(conta: string, perfil = 'pede_bloqueio'): Promise<{ call_id: string; rehearsal_id: string }> {
  const { rows } = await banco.sql.query<{ call_id: string; rehearsal_id: string }>(
    `select call_id, rehearsal_id
       from public.abrir_ensaio($1, 'discovery', 'text', $2::jsonb, null, $3, null)`,
    [conta, JSON.stringify({ perfil }), publicacoes.get(conta)],
  )
  return rows[0]!
}

async function leadDaChamada(chamadaId: string): Promise<string | null> {
  const { rows } = await banco.sql.query<{ lead_id: string | null }>(
    'select lead_id from public.calls where id = $1',
    [chamadaId],
  )
  return rows[0]?.lead_id ?? null
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()
  const a = await criarConta('Fretes do Vale', 'dono@fretes.test')
  contaA = a.id
  donoA = a.donoId
  contaB = (await criarConta('Metalúrgica Sul', 'dono@metal.test')).id
}, 120_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.calls where account_id = any($1)', [[contaA, contaB]])
  await banco.sql.query('delete from public.leads where account_id = any($1)', [[contaA, contaB]])
})

test('o ensaio nasce pendurado no lead de ensaio da conta, marcado como sintético', async () => {
  const aberto = await abrir(contaA)
  const leadId = await leadDaChamada(aberto.call_id)
  expect(leadId).not.toBeNull()

  const { rows } = await banco.sql.query<{
    account_id: string
    is_synthetic: boolean
    name: string
    phone_e164: string
  }>('select account_id, is_synthetic, name, phone_e164 from public.leads where id = $1', [leadId])
  expect(rows[0]).toMatchObject({ account_id: contaA, is_synthetic: true })
  expect(rows[0]!.name).not.toBe('')
})

test('o segundo ensaio reusa o mesmo lead, e cada conta tem o seu', async () => {
  const primeiro = await leadDaChamada((await abrir(contaA)).call_id)
  const segundo = await leadDaChamada((await abrir(contaA, 'apressado')).call_id)
  const daOutra = await leadDaChamada((await abrir(contaB)).call_id)

  expect(segundo).toBe(primeiro)
  expect(daOutra).not.toBe(primeiro)

  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.leads where is_synthetic and account_id = $1',
    [contaA],
  )
  expect(rows[0]!.total).toBe(1)
})

test('o índice recusa um segundo lead sintético na mesma conta', async () => {
  await abrir(contaA)
  await expect(
    banco.sql.query(
      `insert into public.leads (account_id, name, phone_e164, is_synthetic)
       values ($1, 'Outro', '+5511999990000', true)`,
      [contaA],
    ),
  ).rejects.toThrow(/leads_um_sintetico_por_conta/)
})

test('o lead de ensaio fica fora da listagem e da contagem do membro', async () => {
  await banco.sql.query(
    "insert into public.leads (account_id, name, phone_e164) values ($1, 'Ana Real', '+5511988887777')",
    [contaA],
  )
  await abrir(contaA)

  await banco.comoUsuario(donoA)
  const { rows: lista } = await banco.sql.query<{ name: string; is_synthetic: boolean }>(
    'select name, is_synthetic from public.leads order by name',
  )
  expect(lista).toEqual([{ name: 'Ana Real', is_synthetic: false }])

  const { rows: contagem } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.leads where account_id = $1',
    [contaA],
  )
  expect(contagem[0]!.total).toBe(1)

  // A chamada de ensaio continua abrindo por id: é a ficha que se revisa.
  const { rows: chamadas } = await banco.sql.query<{ direction: string }>(
    "select direction from public.calls where direction = 'rehearsal'",
  )
  expect(chamadas).toHaveLength(1)
})

test('o perfil escolhido fica no ensaio, que é de onde call-init o lê', async () => {
  const aberto = await abrir(contaA, 'pessoa_errada')
  const { rows } = await banco.sql.query<{ perfil: string }>(
    `select r.persona_profile ->> 'perfil' as perfil
       from public.rehearsals as r
      where r.call_id = $1`,
    [aberto.call_id],
  )
  expect(rows[0]!.perfil).toBe('pessoa_errada')
})

test('só service_role executa lead_de_ensaio', async () => {
  const { rows } = await banco.sql.query<{ papel: string; pode: boolean }>(
    `select papel, has_function_privilege(papel, 'public.lead_de_ensaio(uuid)', 'execute') as pode
       from unnest(array['anon', 'authenticated', 'service_role']) as papel`,
  )
  expect(Object.fromEntries(rows.map((linha) => [linha.papel, linha.pode]))).toEqual({
    anon: false,
    authenticated: false,
    service_role: true,
  })
})

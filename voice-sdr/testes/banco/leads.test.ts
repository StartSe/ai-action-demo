// `leads` é a tabela que a F1 inteira serve, e ela carrega três promessas que
// nenhuma camada acima consegue garantir sozinha:
//
// 1. Não existem dois leads com o mesmo telefone na mesma conta — a não ser que
//    um deles já tenha sido mesclado, e aí o telefone volta a estar livre.
// 2. O telefone gravado está em E.164, a temperatura é uma das três e a nota
//    vai de 0 a 100. Normalizar é do módulo portável; recusar é do banco.
// 3. O lead nasce numa etapa, mesmo quando quem escreve não informa nenhuma.
//
// Mais a classe Operação da seção 3.9: membro lê, `operator` escreve, `viewer`
// não escreve, e a conta vizinha não aparece.
//
// Referência: migração 20260921100000_leads.sql, docs/PRD-implementacao.md
// seções 3.2 e 3.9, docs/revisao-tecnica.md T-19.

import { afterAll, beforeAll, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  UUID,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly donoId: string
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

  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  const observadorId = await banco.criarUsuario(
    `observador@${dominio}`,
    'Observador',
  )

  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'operator'), ($1, $4, 'viewer')`,
    [id, donoId, operadorId, observadorId],
  )

  return { id, donoId, operadorId, observadorId }
}

/** Insere como serviço, que é superusuário: aqui a RLS não está em julgamento. */
async function semear(
  conta: Conta,
  telefone: string,
  extras: Record<string, unknown> = {},
): Promise<string> {
  await banco.comoServico()
  const colunas = ['account_id', 'phone_e164', ...Object.keys(extras)]
  const valores = [conta.id, telefone, ...Object.values(extras)]
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// Duplicata ------------------------------------------------------------------

test('o mesmo telefone não entra duas vezes na conta', async () => {
  await semear(contaA, '+5548999990001', { name: 'Primeiro' })

  await expect(
    semear(contaA, '+5548999990001', { name: 'Segundo' }),
  ).rejects.toThrow(/leads_telefone_unico_por_conta/i)
})

test('o telefone se repete entre contas diferentes', async () => {
  const naA = await semear(contaA, '+5548999990002')
  const naB = await semear(contaB, '+5548999990002')

  expect(naA).not.toBe(naB)
})

test('lead mesclado devolve o telefone: o índice parcial deixa o próximo entrar', async () => {
  const original = await semear(contaA, '+5548999990003', { name: 'Original' })
  const destino = await semear(contaA, '+5548999990004', { name: 'Destino' })

  await banco.sql.query(
    'update public.leads set merged_into_id = $2 where id = $1',
    [original, destino],
  )

  const novo = await semear(contaA, '+5548999990003', { name: 'Recadastrado' })
  expect(novo).toMatch(UUID)
  expect(novo).not.toBe(original)
})

test('o lead não aponta para si mesmo', async () => {
  const lead = await semear(contaA, '+5548999990005')

  await expect(
    banco.sql.query(
      'update public.leads set merged_into_id = id where id = $1',
      [lead],
    ),
  ).rejects.toThrow(/leads_check|violates check constraint/i)
})

// Forma do dado --------------------------------------------------------------

test.each([
  ['sem o mais', '5548999990006'],
  ['com pontuação', '+55 (48) 99999-0006'],
  ['país começando em zero', '+0548999990006'],
  ['curto demais', '+5548999'],
  ['longo demais', '+554899999000612345'],
  ['vazio', ''],
])('o banco recusa telefone %s', async (_caso, telefone) => {
  await expect(semear(contaA, telefone)).rejects.toThrow(
    /violates check constraint/i,
  )
})

test('o banco aceita o E.164 que o módulo portável produz', async () => {
  const lead = await semear(contaA, '+5548999998888')
  expect(lead).toMatch(UUID)
})

test('temperatura fora das três recusa', async () => {
  await expect(
    semear(contaA, '+5548999990007', { temperature: 'tépido' }),
  ).rejects.toThrow(/violates check constraint/i)

  const lead = await semear(contaA, '+5548999990008', { temperature: 'morno' })
  expect(lead).toMatch(UUID)
})

test('a nota vai de 0 a 100', async () => {
  await expect(
    semear(contaA, '+5548999990009', { score: 101 }),
  ).rejects.toThrow(/violates check constraint/i)

  await expect(semear(contaA, '+5548999990010', { score: -1 })).rejects.toThrow(
    /violates check constraint/i,
  )
})

test('briefing e custom nascem como objeto vazio', async () => {
  const lead = await semear(contaA, '+5548999990011')
  await banco.comoServico()

  const { rows } = await banco.sql.query<{
    briefing: unknown
    custom: unknown
  }>('select briefing, custom from public.leads where id = $1', [lead])

  expect(rows[0]).toEqual({ briefing: {}, custom: {} })
})

test('bloqueio sem motivo escrito recusa', async () => {
  await expect(
    semear(contaA, '+5548999990012', { blocked_at: new Date().toISOString() }),
  ).rejects.toThrow(/violates check constraint/i)
})

// Etapa ----------------------------------------------------------------------

test('lead sem etapa nasce na etapa new do funil padrão da conta', async () => {
  const lead = await semear(contaA, '+5548999990013')
  await banco.comoServico()

  const { rows } = await banco.sql.query<{ key: string; is_default: boolean }>(
    `select s.key, p.is_default
       from public.leads as l
       join public.pipeline_stages as s on s.id = l.stage_id
       join public.pipelines as p on p.id = s.pipeline_id
      where l.id = $1`,
    [lead],
  )

  expect(rows).toEqual([{ key: 'new', is_default: true }])
})

test('a etapa informada é respeitada', async () => {
  await banco.comoServico()
  const { rows: etapas } = await banco.sql.query<{ id: string }>(
    `select s.id
       from public.pipeline_stages as s
      where s.account_id = $1 and s.key = 'contacted'`,
    [contaA.id],
  )
  const etapa = etapas[0]!.id

  const lead = await semear(contaA, '+5548999990014', { stage_id: etapa })
  await banco.comoServico()

  const { rows } = await banco.sql.query<{ stage_id: string }>(
    'select stage_id from public.leads where id = $1',
    [lead],
  )
  expect(rows[0]?.stage_id).toBe(etapa)
})

// Isolamento -----------------------------------------------------------------

test('o operador cadastra lead', async () => {
  await banco.comoUsuario(contaA.operadorId)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, phone_e164, name)
     values ($1, '+5548999990020', 'Cadastrado pelo operador')
     returning id`,
    [contaA.id],
  )

  expect(rows[0]?.id).toMatch(UUID)
})

test('o viewer lê e não escreve', async () => {
  await banco.comoUsuario(contaA.observadorId)

  const { rows: lidos } = await banco.sql.query('select id from public.leads')
  expect(lidos.length).toBeGreaterThan(0)

  await expect(
    banco.sql.query(
      `insert into public.leads (account_id, phone_e164)
       values ($1, '+5548999990021')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  // `using` que não casa não levanta erro: apenas não afeta linha.
  const { rows: alterados } = await banco.sql.query(
    `update public.leads set name = 'Mexido pelo viewer'
      where account_id = $1
      returning id`,
    [contaA.id],
  )
  expect(alterados).toEqual([])

  const { rows: apagados } = await banco.sql.query(
    'delete from public.leads where account_id = $1 returning id',
    [contaA.id],
  )
  expect(apagados).toEqual([])
})

test('o operador não grava lead na conta vizinha', async () => {
  await banco.comoUsuario(contaA.operadorId)

  await expect(
    banco.sql.query(
      `insert into public.leads (account_id, phone_e164)
       values ($1, '+5548999990022')`,
      [contaB.id],
    ),
  ).rejects.toThrow(/row-level security/i)
})

test('a conta vizinha não aparece para quem lê', async () => {
  await semear(contaB, '+5548999990030')
  await banco.comoUsuario(contaA.donoId)

  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.leads',
  )

  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every((linha) => linha.account_id === contaA.id)).toBe(true)
})

test('a sessão anônima não alcança lead nenhum', async () => {
  await banco.comoAnonimo()

  const { rows } = await banco.sql.query('select id from public.leads')

  expect(rows).toEqual([])
})

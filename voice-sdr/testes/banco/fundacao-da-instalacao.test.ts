// A fundação da instalação é a única porta pela qual uma conta nasce sem
// convite, e ela só pode ser atravessada uma vez. O que se prova aqui:
//
// 1. Numa instalação virgem, quem se cadastra primeiro vira dono.
// 2. A porta fecha no instante em que o primeiro dono existe, e não reabre.
// 3. Quem não tem sessão não funda nada.
// 4. A fundação deixa rastro na trilha de auditoria, na mesma transação.
//
// O estado que importa aqui é global à instalação, então cada caso precisa
// começar numa instalação virgem. O banco é um só e o `truncate` em cascata
// desfaz a fundação entre os casos: criar um PGlite por teste custaria mais
// de dez segundos ao `npm run check`, que é o comando do laço.
// Referência: migração 20260921080000_fundacao_da_instalacao.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  UUID,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let ana: string
let bruno: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  ana = await banco.criarUsuario('ana@transportes.com.br', 'Ana')
  bruno = await banco.criarUsuario('bruno@cooperativa.com.br', 'Bruno')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  // A cascata alcança account_members e audit_log, que é o estado inteiro da
  // fundação. Os usuários ficam: eles nascem em auth.users e a fundação não
  // os cria nem os apaga.
  await banco.sql.exec('truncate public.accounts cascade')
})

async function semDono(): Promise<boolean | null> {
  const { rows } = await banco.sql.query<{ sem_dono: boolean | null }>(
    'select public.instalacao_sem_dono() as sem_dono',
  )
  return rows[0]?.sem_dono ?? null
}

async function fundar(nome: string): Promise<string | null> {
  const { rows } = await banco.sql.query<{ conta: string | null }>(
    'select public.fundar_instalacao($1) as conta',
    [nome],
  )
  return rows[0]?.conta ?? null
}

test('a instalação virgem se declara sem dono para quem ainda não entrou', async () => {
  await banco.comoAnonimo()

  await expect(semDono()).resolves.toBe(true)
})

test('quem se cadastra primeiro funda a conta e nasce owner', async () => {
  await banco.comoUsuario(ana)

  const conta = await fundar('Transportes Aurora')

  expect(conta).toMatch(UUID)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ name: string; role: string }>(
    `select c.name, m.role
       from public.accounts as c
       join public.account_members as m on m.account_id = c.id
      where c.id = $1`,
    [conta],
  )

  expect(rows).toEqual([{ name: 'Transportes Aurora', role: 'owner' }])
})

test('o fundador enxerga a própria conta pela RLS, sem passar pelo serviço', async () => {
  await banco.comoUsuario(ana)
  await fundar('Transportes Aurora')

  const { rows } = await banco.sql.query<{ name: string }>(
    'select name from public.accounts',
  )

  expect(rows).toEqual([{ name: 'Transportes Aurora' }])
})

test('a fundação grava a trilha de auditoria na mesma transação', async () => {
  await banco.comoUsuario(ana)
  const conta = await fundar('Transportes Aurora')

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    account_id: string
    actor: string
    actor_id: string
    source: string
    target_type: string
    payload: { papel?: string; nome_da_conta?: string }
  }>(
    `select account_id, actor, actor_id, source, target_type, payload
       from public.audit_log`,
  )

  expect(rows).toEqual([
    {
      account_id: conta,
      actor: 'user',
      actor_id: ana,
      source: 'rpc:fundar_instalacao',
      target_type: 'accounts',
      payload: { papel: 'owner', nome_da_conta: 'Transportes Aurora' },
    },
  ])
})

test('depois de fundada, a instalação deixa de se declarar sem dono', async () => {
  await banco.comoUsuario(ana)
  await fundar('Transportes Aurora')

  await banco.comoAnonimo()

  await expect(semDono()).resolves.toBe(false)
})

test('a segunda fundação é recusada, mesmo vinda de outro usuário', async () => {
  await banco.comoUsuario(ana)
  await fundar('Transportes Aurora')

  await banco.comoUsuario(bruno)

  await expect(fundar('Cooperativa Sul')).rejects.toThrow(/já tem dono/i)
})

test('a porta fecha pelo vínculo, e não pela conta: conta sem dono não conta', async () => {
  // Uma conta criada pelo serviço, sem vínculo nenhum, não é uma instalação
  // fundada — senão uma semente de dados trancaria todo mundo do lado de fora.
  await banco.comoServico()
  await banco.sql.query(
    "insert into public.accounts (name) values ('Conta órfã')",
  )

  await banco.comoAnonimo()
  await expect(semDono()).resolves.toBe(true)
})

test('quem não tem sessão não funda nada', async () => {
  await banco.comoAnonimo()

  await expect(fundar('Transportes Aurora')).rejects.toThrow()
})

test('nome em branco é recusado antes de qualquer escrita', async () => {
  await banco.comoUsuario(ana)

  await expect(fundar('   ')).rejects.toThrow(/nome/i)

  await banco.comoServico()
  // `count` chega como número no PGlite e como texto no driver `pg`: o teste
  // não escolhe banco, então normaliza antes de comparar.
  const { rows } = await banco.sql.query<{ total: string | number }>(
    'select count(*) as total from public.accounts',
  )
  expect(Number(rows[0]?.total)).toBe(0)
})

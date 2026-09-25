// A visão `reunioes_reais`: meetings sem a reunião marcada num ensaio (T-16),
// com a RLS de meetings valendo para quem consulta.
//
// O ensaio não insere reunião (as ferramentas pulam os efeitos), e por isso a
// reunião de ensaio aqui é plantada à mão: é a prova de que a lista não
// depende de a ferramenta lembrar.
//
// Referência: migração 20260930180000_reunioes_reais.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaA: string
let donoA: string
let contaB: string
let donoB: string
let sequencia = 0

async function um(sql: string, parametros: unknown[] = []): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

async function criarConta(nome: string, email: string): Promise<{ id: string; donoId: string }> {
  const id = await um('insert into public.accounts (name) values ($1) returning id', [nome])
  const donoId = await banco.criarUsuario(email, nome)
  await banco.sql.query(
    "insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')",
    [id, donoId],
  )
  return { id, donoId }
}

async function chamada(conta: string, direcao: 'outbound' | 'rehearsal'): Promise<string> {
  return um(
    `insert into public.calls (account_id, purpose, direction, status, idempotency_key)
     values ($1, 'discovery', $2, 'ended', $3) returning id`,
    [conta, direcao, crypto.randomUUID()],
  )
}

/** Uma reunião com lead e especialista próprios, marcada na ligação dada (ou à mão). */
async function reuniao(conta: string, chamadaId: string | null): Promise<string> {
  sequencia += 1
  const leadId = await um(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, $2, $3, 'teste') returning id`,
    [conta, `Lead ${sequencia}`, `+55119800${String(sequencia).padStart(5, '0')}`],
  )
  const especialistaId = await um(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, $2, $3, array['video']::text[]) returning id`,
    [conta, `Especialista ${sequencia}`, `e${sequencia}@teste.test`],
  )
  return um(
    `insert into public.meetings
       (account_id, lead_id, specialist_id, starts_at, ends_at, modality, booked_call_id)
     values ($1, $2, $3, '2026-10-06T13:00:00Z', '2026-10-06T13:30:00Z', 'video', $4)
     returning id`,
    [conta, leadId, especialistaId, chamadaId],
  )
}

async function idsDaVisao(): Promise<string[]> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.reunioes_reais order by id',
  )
  return rows.map((linha) => linha.id)
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()
  const a = await criarConta('Fretes do Vale', 'dono@fretes.test')
  contaA = a.id
  donoA = a.donoId
  const b = await criarConta('Metalúrgica Sul', 'dono@metal.test')
  contaB = b.id
  donoB = b.donoId
}, 120_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.meetings')
  await banco.sql.query('delete from public.calls')
})

test('a reunião marcada num ensaio fica de fora; a manual e a da ligação real entram', async () => {
  const manual = await reuniao(contaA, null)
  const real = await reuniao(contaA, await chamada(contaA, 'outbound'))
  const deEnsaio = await reuniao(contaA, await chamada(contaA, 'rehearsal'))

  await banco.comoUsuario(donoA)
  expect(await idsDaVisao()).toEqual([manual, real].sort())

  // A tabela continua com as três: a visão é o recorte, não uma exclusão.
  const { rows } = await banco.sql.query<{ id: string }>('select id from public.meetings')
  expect(rows.map((linha) => linha.id)).toContain(deEnsaio)
})

test('a chamada apagada pelo expurgo deixa a reunião na visão, como manual', async () => {
  const chamadaId = await chamada(contaA, 'outbound')
  const id = await reuniao(contaA, chamadaId)
  await banco.sql.query('delete from public.calls where id = $1', [chamadaId])

  await banco.comoUsuario(donoA)
  expect(await idsDaVisao()).toEqual([id])
})

test('a RLS de meetings vale pela visão: cada conta vê só as suas, e o anônimo nada', async () => {
  const deA = await reuniao(contaA, null)
  const deB = await reuniao(contaB, await chamada(contaB, 'outbound'))

  await banco.comoUsuario(donoA)
  expect(await idsDaVisao()).toEqual([deA])

  await banco.comoUsuario(donoB)
  expect(await idsDaVisao()).toEqual([deB])

  await banco.comoAnonimo()
  expect(await idsDaVisao()).toEqual([])
})

test('a visão é security_invoker', async () => {
  const { rows } = await banco.sql.query<{ opcoes: string[] | null }>(
    "select reloptions as opcoes from pg_class where oid = 'public.reunioes_reais'::regclass",
  )
  expect(rows[0]?.opcoes).toContain('security_invoker=on')
})

test('a visão tem as mesmas colunas de meetings, na mesma ordem', async () => {
  const colunas = async (relacao: string) => {
    const { rows } = await banco.sql.query<{ attname: string }>(
      `select attname from pg_attribute
        where attrelid = $1::regclass and attnum > 0 and not attisdropped
        order by attnum`,
      [relacao],
    )
    return rows.map((linha) => linha.attname)
  }
  expect(await colunas('public.reunioes_reais')).toEqual(await colunas('public.meetings'))
})

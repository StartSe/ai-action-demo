// O que cron-dial lê e como ele toma o item: `situacao_da_fila` e
// `reivindicar_da_fila` (L-14, seção 4.6, RF-011).
//
// O que este arquivo prova:
//
// 1. **A simultaneidade é contada no banco**: `calls` em `queued`, `ringing` e
//    `in_progress`, mais item tomado que ainda não virou chamada. Chamada
//    encerrada não conta.
// 2. **A reivindicação nunca devolve mais do que cabe.** Com o teto em 2, o
//    terceiro item fica `queued` mesmo que o pedido seja de 25, e a segunda
//    reivindicação seguida não toma nada — os dois já tomados ocupam as vagas.
// 3. **O item sai `claimed` com `claimed_at`**, na mesma instrução.
// 4. **Conta parada devolve zero, e o item fica `queued`.**
// 5. **`run_at` no futuro não é tomado.**
// 6. As duas funções são só de `service_role`.
//
// O `for update skip locked` com duas passagens sobrepostas precisa de duas
// conexões, e o PGlite tem uma: essa prova está em `fila-concorrencia.test.ts`,
// que roda no degrau 3 contra a mesma `reivindicar_da_fila`.
//
// Referência: migração 20260923140000_despacho_da_fila.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let leadId: string

const AGORA = '2026-09-23T15:00:00.000Z'

async function enfileirar(referencia: string, runAt = '2026-09-23T14:59:00.000Z'): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.dial_queue (account_id, lead_id, purpose, source, source_ref, run_at)
     values ($1, $2, 'discovery', 'manual', $3, $4)
     returning id`,
    [contaId, leadId, referencia, runAt],
  )
  return rows[0]!.id
}

async function chamada(status: string, chave: string): Promise<void> {
  await banco.sql.query(
    `insert into public.calls (account_id, lead_id, purpose, direction, idempotency_key, status)
     values ($1, $2, 'discovery', 'outbound', $3, $4)`,
    [contaId, leadId, chave, status],
  )
}

async function reivindicar(limite = 25, instante = AGORA) {
  const { rows } = await banco.sql.query<{ id: string; status: string; claimed_at: string | null }>(
    'select id, status, claimed_at from public.reivindicar_da_fila($1, $2, $3)',
    [contaId, limite, instante],
  )
  return rows
}

async function situacao(instante = AGORA) {
  const { rows } = await banco.sql.query<{
    account_id: string
    dialing_paused_at: string | null
    max_concurrent: number
    ativas: number
  }>('select * from public.situacao_da_fila($1)', [instante])
  return rows
}

async function statusDe(id: string): Promise<string> {
  const { rows } = await banco.sql.query<{ status: string }>(
    'select status from public.dial_queue where id = $1',
    [id],
  )
  return rows[0]!.status
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Despacho Ltda') returning id`,
  )
  contaId = rows[0]!.id
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead do despacho', '+5511990000077', 'cenario') returning id`,
    [contaId],
  )
  leadId = leads[0]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.dial_queue')
  await banco.sql.query('delete from public.calls')
  await banco.sql.query(
    'update public.account_settings set max_concurrent = 2 where account_id = $1',
    [contaId],
  )
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = null, dialing_paused_by = null, dialing_paused_reason = null
      where id = $1`,
    [contaId],
  )
})

test('a situação conta chamadas no ar e item tomado sem chamada, e não conta encerrada', async () => {
  await chamada('queued', 'c1')
  await chamada('ringing', 'c2')
  await chamada('in_progress', 'c3')
  await chamada('ended', 'c4')
  await chamada('failed', 'c5')
  await enfileirar('tomado')
  await banco.sql.query(`update public.dial_queue set status = 'claimed' where source_ref = 'tomado'`)
  await enfileirar('pronto')

  expect(await situacao()).toEqual([
    { account_id: contaId, dialing_paused_at: null, max_concurrent: 2, ativas: 4, primeira_pronta: expect.anything() },
  ])
})

test('a situação não lista conta cujo único item é futuro', async () => {
  await enfileirar('futuro', '2026-09-23T16:00:00.000Z')
  expect(await situacao()).toEqual([])
})

test('com o teto em 2, o terceiro item fica queued e a segunda reivindicação não toma nada', async () => {
  // run_at distintos: a ordem da tomada é run_at, e com empate o id decide.
  const ids = [
    await enfileirar('a', '2026-09-23T14:57:00.000Z'),
    await enfileirar('b', '2026-09-23T14:58:00.000Z'),
    await enfileirar('c', '2026-09-23T14:59:00.000Z'),
  ]

  const tomados = await reivindicar(25)
  expect(tomados).toHaveLength(2)
  for (const item of tomados) {
    expect(item.status).toBe('claimed')
    expect(item.claimed_at).not.toBeNull()
  }
  expect(await statusDe(ids[2]!)).toBe('queued')

  expect(await reivindicar(25)).toHaveLength(0)
  expect(await statusDe(ids[2]!)).toBe('queued')
})

test('chamada no ar ocupa vaga na reivindicação', async () => {
  await chamada('ringing', 'no-ar')
  await enfileirar('a')
  await enfileirar('b')
  expect(await reivindicar(25)).toHaveLength(1)
})

test('o limite pedido vale abaixo do teto', async () => {
  await enfileirar('a')
  await enfileirar('b')
  expect(await reivindicar(1)).toHaveLength(1)
})

test('conta parada devolve zero, e os itens ficam queued', async () => {
  const id = await enfileirar('a')
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = now(), dialing_paused_by = gen_random_uuid(),
            dialing_paused_reason = 'teste do despacho'
      where id = $1`,
    [contaId],
  )
  expect(await reivindicar(25)).toHaveLength(0)
  expect(await statusDe(id)).toBe('queued')
  // A situação ainda lista a conta, com o freio: quem decide pular é o módulo.
  expect((await situacao())[0]?.dialing_paused_at).not.toBeNull()
})

test('run_at no futuro não é tomado', async () => {
  const id = await enfileirar('futuro', '2026-09-23T16:00:00.000Z')
  expect(await reivindicar(25)).toHaveLength(0)
  expect(await statusDe(id)).toBe('queued')
  expect(await reivindicar(25, '2026-09-23T16:00:00.000Z')).toHaveLength(1)
})

test('failures nasce em zero e não aceita negativo', async () => {
  const id = await enfileirar('a')
  const { rows } = await banco.sql.query<{ failures: number }>(
    'select failures from public.dial_queue where id = $1',
    [id],
  )
  expect(rows[0]!.failures).toBe(0)
  await expect(
    banco.sql.query('update public.dial_queue set failures = -1 where id = $1', [id]),
  ).rejects.toThrow(/dial_queue_falhas_nao_negativas/)
})

test.each([
  ['situacao_da_fila(timestamptz)'],
  ['reivindicar_da_fila(uuid, integer, timestamptz)'],
])('%s é só de service_role', async (assinatura) => {
  const { rows } = await banco.sql.query<{ papel: string; pode: boolean }>(
    `select papel, has_function_privilege(papel, $1, 'execute') as pode
       from unnest(array['anon', 'authenticated', 'service_role']) as papel
      order by papel`,
    [`public.${assinatura}`],
  )
  expect(rows).toEqual([
    { papel: 'anon', pode: false },
    { papel: 'authenticated', pode: false },
    { papel: 'service_role', pode: true },
  ])
})

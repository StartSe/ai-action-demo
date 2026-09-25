// O que cron-speed-to-lead lê e onde registra o lead ignorado:
// `candidatos_do_fala_rapido` e `speed_to_lead_skips` (RF-610, R-09).
//
// O que este arquivo prova:
//
// 1. **O recorte**: só lead do formulário (`source = 'intake'`), só conta com
//    o fala-rápido ligado, só nas 24 horas antes do instante, e nunca lead que
//    já tem item `stl` na fila ou registro de ignorado. É esse último par que
//    faz a passagem seguinte não reexaminar o lead.
// 2. **O dado da decisão**: bloqueado vem da linha do lead **ou** da lista de
//    não perturbe ativa (bloqueio removido não conta), mesclado vem de
//    `merged_into_id`, e a janela da conta vem junto.
// 3. **A ordem e o teto**: o mais novo primeiro, e nunca mais de 25 mesmo que
//    o pedido seja maior.
// 4. `speed_to_lead_skips` tem um registro por lead, razão em lista fechada,
//    cascata com o lead. A consulta é só de `service_role`.
//
// O isolamento entre contas de `speed_to_lead_skips` está em
// `travessia-entre-contas.test.ts`. A decisão (janela, precedência) está em
// `supabase/functions/cron-speed-to-lead/enfileiramento.test.ts`.
//
// Referência: migração 20260923160000_fala_rapido.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { ORIGEM } from '../../supabase/functions/lead-intake/entrada.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let desligadaId: string

const AGORA = '2026-09-23T15:00:00.000Z'
const HA_DOIS_MINUTOS = '2026-09-23T14:58:00.000Z'

let sequencia = 0

async function criarLead(
  conta: string,
  extras: { source?: string; created_at?: string; phone?: string } = {},
): Promise<string> {
  sequencia += 1
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source, created_at)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      conta,
      `Lead ${sequencia}`,
      extras.phone ?? `+55119900${String(sequencia).padStart(5, '0')}`,
      // A origem que `lead-intake` grava, lida do módulo dele: se ela mudar lá,
      // o recorte daqui deixa de pegar o formulário e este arquivo reprova.
      extras.source ?? ORIGEM,
      extras.created_at ?? HA_DOIS_MINUTOS,
    ],
  )
  return rows[0]!.id
}

interface Candidato {
  lead_id: string
  account_id: string
  phone_e164: string
  created_at: string
  bloqueado: boolean
  mesclado: boolean
  speed_to_lead_enabled: boolean
  speed_to_lead_minutes: number
}

async function candidatos(limite = 25, instante = AGORA): Promise<Candidato[]> {
  const { rows } = await banco.sql.query<Candidato>(
    'select * from public.candidatos_do_fala_rapido($1, $2)',
    [instante, limite],
  )
  return rows
}

async function ids(limite = 25, instante = AGORA): Promise<string[]> {
  return (await candidatos(limite, instante)).map((c) => c.lead_id)
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Fala Rápido Ltda'), ('Desligada Ltda') returning id`,
  )
  contaId = rows[0]!.id
  desligadaId = rows[1]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.speed_to_lead_skips')
  await banco.sql.query('delete from public.dial_queue')
  await banco.sql.query('delete from public.dnc_entries')
  await banco.sql.query('delete from public.leads')
  await banco.sql.query(
    `update public.account_settings
        set speed_to_lead_enabled = (account_id = $1), speed_to_lead_minutes = 10
      where account_id in ($1, $2)`,
    [contaId, desligadaId],
  )
})

test('devolve o lead do formulário com a janela da conta', async () => {
  const lead = await criarLead(contaId)
  const [candidato, ...resto] = await candidatos()
  expect(resto).toEqual([])
  expect(candidato).toMatchObject({
    lead_id: lead,
    account_id: contaId,
    bloqueado: false,
    mesclado: false,
    speed_to_lead_enabled: true,
    speed_to_lead_minutes: 10,
  })
  expect(new Date(candidato!.created_at).toISOString()).toBe(HA_DOIS_MINUTOS)
})

test('lead importado ou cadastrado à mão não entra', async () => {
  await criarLead(contaId, { source: 'import' })
  await criarLead(contaId, { source: 'manual' })
  expect(await ids()).toEqual([])
})

test('conta com o fala-rápido desligado não entra', async () => {
  await criarLead(desligadaId)
  expect(await ids()).toEqual([])
})

test('o horizonte é de 24 horas antes do instante, e lead do futuro não entra', async () => {
  const dentro = await criarLead(contaId, { created_at: '2026-09-22T15:00:01.000Z' })
  await criarLead(contaId, { created_at: '2026-09-22T15:00:00.000Z' })
  await criarLead(contaId, { created_at: '2026-09-23T15:00:01.000Z' })
  expect(await ids()).toEqual([dentro])
})

test('lead com item stl na fila sai do recorte; item de outra fonte não o tira', async () => {
  const comStl = await criarLead(contaId)
  const comManual = await criarLead(contaId)
  await banco.sql.query(
    `insert into public.dial_queue (account_id, lead_id, purpose, source, source_ref)
     values ($1, $2, 'discovery', 'stl', $3),
            ($1, $4, 'discovery', 'manual', gen_random_uuid()::text)`,
    [contaId, comStl, comStl, comManual],
  )
  expect(await ids()).toEqual([comManual])
})

test('lead com registro de ignorado sai do recorte', async () => {
  const ignorado = await criarLead(contaId)
  const novo = await criarLead(contaId, { created_at: '2026-09-23T14:59:00.000Z' })
  await banco.sql.query(
    `insert into public.speed_to_lead_skips (lead_id, account_id, reason, detail)
     values ($1, $2, 'outside_window', 'examinado tarde')`,
    [ignorado, contaId],
  )
  expect(await ids()).toEqual([novo])
})

test('bloqueado vem da linha do lead ou da lista de não perturbe ativa', async () => {
  const naLinha = await criarLead(contaId, { phone: '+5511990001001' })
  await banco.sql.query(
    `update public.leads set blocked_at = now(), blocked_reason = 'pediu' where id = $1`,
    [naLinha],
  )
  const naLista = await criarLead(contaId, { phone: '+5511990001002' })
  const removido = await criarLead(contaId, { phone: '+5511990001003' })
  const livre = await criarLead(contaId, { phone: '+5511990001004' })
  await banco.sql.query(
    `insert into public.dnc_entries (account_id, phone_e164, reason)
     values ($1, '+5511990001002', 'pediu na ligação')`,
    [contaId],
  )
  await banco.sql.query(
    `insert into public.dnc_entries (account_id, phone_e164, reason, removed_at, removed_by, removal_reason)
     values ($1, '+5511990001003', 'engano', now(), gen_random_uuid(), 'foi engano')`,
    [contaId],
  )
  // Bloqueio do mesmo número em outra conta não conta.
  await banco.sql.query(
    `insert into public.dnc_entries (account_id, phone_e164, reason)
     values ($1, '+5511990001004', 'outra conta')`,
    [desligadaId],
  )

  const porLead = new Map((await candidatos()).map((c) => [c.lead_id, c.bloqueado]))
  expect(Object.fromEntries(porLead)).toEqual({
    [naLinha]: true,
    [naLista]: true,
    [removido]: false,
    [livre]: false,
  })
})

test('mesclado vem de merged_into_id', async () => {
  const destino = await criarLead(contaId, { phone: '+5511990002001' })
  const origem = await criarLead(contaId, { phone: '+5511990002002' })
  await banco.sql.query('update public.leads set merged_into_id = $1 where id = $2', [destino, origem])
  const porLead = new Map((await candidatos()).map((c) => [c.lead_id, c.mesclado]))
  expect(porLead.get(origem)).toBe(true)
  expect(porLead.get(destino)).toBe(false)
})

test('o mais novo primeiro, e nunca mais de 25', async () => {
  const criados: string[] = []
  for (let n = 0; n < 30; n += 1) {
    criados.push(
      await criarLead(contaId, { created_at: new Date(Date.parse(AGORA) - (n + 1) * 1000).toISOString() }),
    )
  }
  expect(await ids(100)).toEqual(criados.slice(0, 25))
  expect(await ids(3)).toEqual(criados.slice(0, 3))
  expect(await ids(0)).toEqual([])
})

test('um registro de ignorado por lead, e a razão é lista fechada', async () => {
  const lead = await criarLead(contaId)
  await banco.sql.query(
    `insert into public.speed_to_lead_skips (lead_id, account_id, reason, detail)
     values ($1, $2, 'blocked', 'bloqueado')`,
    [lead, contaId],
  )
  await expect(
    banco.sql.query(
      `insert into public.speed_to_lead_skips (lead_id, account_id, reason, detail)
       values ($1, $2, 'merged', 'de novo')`,
      [lead, contaId],
    ),
  ).rejects.toMatchObject({ code: '23505' })

  const outro = await criarLead(contaId)
  await expect(
    banco.sql.query(
      `insert into public.speed_to_lead_skips (lead_id, account_id, reason, detail)
       values ($1, $2, 'sem_vontade', 'inventado')`,
      [outro, contaId],
    ),
  ).rejects.toMatchObject({ code: '23514' })
  await expect(
    banco.sql.query(
      `insert into public.speed_to_lead_skips (lead_id, account_id, reason, detail)
       values ($1, $2, 'blocked', '  ')`,
      [outro, contaId],
    ),
  ).rejects.toMatchObject({ code: '23514' })
})

test('apagar o lead apaga o registro de ignorado (RF-808)', async () => {
  const lead = await criarLead(contaId)
  await banco.sql.query(
    `insert into public.speed_to_lead_skips (lead_id, account_id, reason, detail)
     values ($1, $2, 'blocked', 'bloqueado')`,
    [lead, contaId],
  )
  await banco.sql.query('delete from public.leads where id = $1', [lead])
  const { rows } = await banco.sql.query<{ n: number }>(
    'select count(*)::integer as n from public.speed_to_lead_skips',
  )
  expect(rows[0]!.n).toBe(0)
})

test('o índice da consulta é parcial no formulário e ordenado por criação', async () => {
  const { rows } = await banco.sql.query<{ indexdef: string }>(
    `select indexdef from pg_indexes
      where schemaname = 'public' and indexname = 'leads_entrada_recente_idx'`,
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]!.indexdef).toMatch(/\(created_at DESC\)/)
  expect(rows[0]!.indexdef).toMatch(/WHERE \(source = 'intake'::text\)/)
})

test('a consulta é só de service_role', async () => {
  const { rows } = await banco.sql.query<{ papel: string; pode: boolean }>(
    `select papel, has_function_privilege(papel, $1, 'execute') as pode
       from unnest(array['anon', 'authenticated', 'service_role']) as papel
      order by papel`,
    ['public.candidatos_do_fala_rapido(timestamptz, integer)'],
  )
  expect(rows).toEqual([
    { papel: 'anon', pode: false },
    { papel: 'authenticated', pode: false },
    { papel: 'service_role', pode: true },
  ])
})

test('speed_to_lead_skips tem só política de leitura', async () => {
  const { rows } = await banco.sql.query<{ cmd: string }>(
    `select cmd from pg_policies where schemaname = 'public' and tablename = 'speed_to_lead_skips'`,
  )
  expect(rows.map((r) => r.cmd)).toEqual(['SELECT'])
})

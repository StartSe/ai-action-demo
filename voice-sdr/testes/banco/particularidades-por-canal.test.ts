// As particularidades por canal no banco: as três colunas opcionais de
// `agents` recusam texto só de espaço, e o retrato do que foi ao ar em
// `agent_publications` só aceita objeto. Quem monta e lê o retrato é
// `_shared/agente/retrato-da-publicacao.ts`, testado ao lado dele.
//
// Referência: migração 20261012100000_particularidades_por_canal.sql.

import { afterAll, beforeAll, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let agenteId: string
let adminId: string
let operadorId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(`insert into public.accounts (name) values ('Conta') returning id`)
  contaId = rows[0]!.id
  adminId = await banco.criarUsuario('admin@canal.test', 'Admin')
  operadorId = await banco.criarUsuario('operador@canal.test', 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'operator')`,
    [contaId, adminId, operadorId],
  )
  const agente = await banco.sql.query<{ id: string }>(
    `insert into public.agents (account_id, name, company_name) values ($1, 'Ana', 'Aurora') returning id`,
    [contaId],
  )
  agenteId = agente.rows[0]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

test('as três colunas nascem nulas e recusam texto só de espaço', async () => {
  const { rows } = await banco.sql.query(
    'select whatsapp_first_message, voice_channel_style, whatsapp_channel_style from public.agents where id = $1',
    [agenteId],
  )
  expect(rows).toEqual([{ whatsapp_first_message: null, voice_channel_style: null, whatsapp_channel_style: null }])

  for (const coluna of ['whatsapp_first_message', 'voice_channel_style', 'whatsapp_channel_style']) {
    await expect(banco.sql.query(`update public.agents set ${coluna} = '   ' where id = $1`, [agenteId])).rejects.toMatchObject({
      code: '23514',
    })
  }
})

test('o administrador grava as particularidades; o operador não', async () => {
  await banco.comoUsuario(adminId)
  const gravado = await banco.sql.query(
    `update public.agents set whatsapp_first_message = 'Oi, {nome_do_lead}!', whatsapp_channel_style = 'Curto.'
     where id = $1 returning id`,
    [agenteId],
  )
  expect(gravado.rows).toHaveLength(1)

  await banco.comoUsuario(operadorId)
  const doOperador = await banco.sql.query(`update public.agents set voice_channel_style = 'Devagar.' where id = $1 returning id`, [
    agenteId,
  ])
  expect(doOperador.rows).toHaveLength(0)
  await banco.comoServico()
})

test('o retrato da publicação é objeto ou nulo', async () => {
  const { rows } = await banco.sql.query<{ id: string; channel_snapshot: unknown }>(
    `insert into public.agent_publications (account_id, agent_id, purpose, status, provider_agent_id, published_hash, published_at, channel_snapshot)
     values ($1, $2, 'discovery', 'publicado', 'agente-1', $3, now(), $4::jsonb)
     returning id, channel_snapshot`,
    [contaId, agenteId, 'a'.repeat(64), JSON.stringify({ versao: 1 })],
  )
  expect(rows[0]!.channel_snapshot).toEqual({ versao: 1 })

  await expect(
    banco.sql.query(`update public.agent_publications set channel_snapshot = '[]'::jsonb where id = $1`, [rows[0]!.id]),
  ).rejects.toMatchObject({ code: '23514' })
  await banco.sql.query(`update public.agent_publications set channel_snapshot = null where id = $1`, [rows[0]!.id])
})

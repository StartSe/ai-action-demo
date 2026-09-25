// Áudio e imagem no WhatsApp, no banco: as duas tarefas novas de modelo e o
// estado da leitura da mídia em whatsapp_messages.
//
// 1. escolher_modelo_da_conta aceita imagem e audio, e resolver_modelo_da_conta
//    devolve a escolha de cada uma (nulo antes de escolher).
// 2. desconectar zera as cinco tarefas.
// 3. media_status só em mídia, e lida exige media_text.
//
// Referência: migração 20261006110000_midia_do_whatsapp.sql.

import { afterAll, beforeAll, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let donoId: string
let conversaId: string

async function um<T = string>(sql: string, parametros: unknown[], coluna = 'id'): Promise<T> {
  const { rows } = await banco.sql.query<Record<string, T>>(sql, parametros)
  return rows[0]![coluna] as T
}

async function resolver(tarefa: string): Promise<string | null> {
  await banco.comoServico()
  return await um<string | null>('select model from public.resolver_modelo_da_conta($1, $2)', [contaId, tarefa], 'model')
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaId = await um(`insert into public.accounts (name) values ('Conta') returning id`, [])
  donoId = await banco.criarUsuario('dono@midia.test', 'Dono')
  await banco.sql.query(`insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')`, [
    contaId,
    donoId,
  ])
  const { rows } = await banco.sql.query<{ conversation_id: string }>(
    `select * from public.abrir_conversa_do_whatsapp($1, '+5548999998888', null, 'discovery', 'lead')`,
    [contaId],
  )
  conversaId = rows[0]!.conversation_id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

test('imagem e audio são tarefas: a escolha grava e a resolução devolve', async () => {
  expect(await resolver('imagem')).toBeNull()
  expect(await resolver('audio')).toBeNull()

  await banco.comoUsuario(donoId)
  await banco.sql.query(`select public.escolher_modelo_da_conta($1, 'audio', 'google/gemini-3.1-flash-lite')`, [contaId])
  await banco.sql.query(`select public.escolher_modelo_da_conta($1, 'imagem', 'deepseek/deepseek-v4.1-flash')`, [contaId])
  await expect(
    banco.sql.query(`select public.escolher_modelo_da_conta($1, 'video', 'x/y')`, [contaId]),
  ).rejects.toMatchObject({ code: '22023' })

  expect(await resolver('audio')).toBe('google/gemini-3.1-flash-lite')
  expect(await resolver('imagem')).toBe('deepseek/deepseek-v4.1-flash')
  expect(await resolver('draft')).toBeNull()
})

test('desconectar zera as tarefas de mídia junto com as outras', async () => {
  await banco.comoServico()
  await banco.sql.query('select public.desconectar_modelo_da_conta($1)', [contaId])
  expect(await resolver('audio')).toBeNull()
  expect(await resolver('imagem')).toBeNull()
})

test('a leitura da mídia: só em mídia, e lida exige o texto', async () => {
  await banco.comoServico()
  const registrar = async (idDoProvedor: string, midia: string | null, corpo = '') =>
    await um(
      `select message_id from public.registrar_mensagem_do_whatsapp($1, $2, 'in', 'lead', null, $3, $4, $5, 'recebida')`,
      [contaId, conversaId, corpo, midia, idDoProvedor],
      'message_id',
    )
  const audio = await registrar('A-1', 'audio')
  const texto = await registrar('T-1', null, 'Oi')

  await banco.sql.query(`update public.whatsapp_messages set media_status = 'pendente' where id = $1`, [audio])
  await expect(
    banco.sql.query(`update public.whatsapp_messages set media_status = 'lida' where id = $1`, [audio]),
  ).rejects.toMatchObject({ code: '23514' })
  await banco.sql.query(
    `update public.whatsapp_messages set media_status = 'lida', media_text = 'Queria o frete.' where id = $1`,
    [audio],
  )
  await expect(
    banco.sql.query(`update public.whatsapp_messages set media_status = 'pendente' where id = $1`, [texto]),
  ).rejects.toMatchObject({ code: '23514' })
  await expect(
    banco.sql.query(`update public.whatsapp_messages set media_status = 'ouvida' where id = $1`, [audio]),
  ).rejects.toMatchObject({ code: '23514' })
})

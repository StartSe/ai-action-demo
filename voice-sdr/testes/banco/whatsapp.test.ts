// O canal de WhatsApp no banco: conversa, mensagem e os três RPCs da borda.
// O que se prova aqui:
//
// 1. Uma conversa ativa por número: abrir de novo devolve a mesma, e depois de
//    encerrada o mesmo número abre outra.
// 2. O webhook repetido não grava a mensagem duas vezes (provider_message_id
//    único por conta), e a mesma chave em outra conta convive.
// 3. Os checks de forma: autor do sentido, texto ou mídia, humano com autor.
// 4. Mudar o estado devolve código e narra no lead com o kind whatsapp.
// 5. Classe Servidor: pg_policies só SELECT, membro lê a própria conta e não
//    escreve; a vizinha não vê. Os RPCs só executam para service_role.
// 6. Canal e pré-contato nascem desligados em account_settings.
//
// Referência: migração 20261004100000_whatsapp.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly leadId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function um<T = string>(sql: string, parametros: unknown[], coluna = 'id'): Promise<T> {
  const { rows } = await banco.sql.query<Record<string, T>>(sql, parametros)
  return rows[0]![coluna] as T
}

async function criarConta(nome: string, sufixo: string): Promise<Conta> {
  const id = await um('insert into public.accounts (name) values ($1) returning id', [nome])
  const donoId = await banco.criarUsuario(`dono.${sufixo}@whatsapp.test`, 'Dono')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')`,
    [id, donoId],
  )
  const leadId = await um(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Joana', $2, 'whatsapp') returning id`,
    [id, `+55489999900${sufixo}0`],
  )
  return { id, donoId, leadId }
}

async function abrir(
  conta: Conta,
  telefone: string,
  lead: string | null = conta.leadId,
): Promise<{ conversation_id: string; criada: boolean }> {
  const { rows } = await banco.sql.query<{ conversation_id: string; criada: boolean }>(
    `select * from public.abrir_conversa_do_whatsapp($1, $2, $3, 'discovery', 'lead')`,
    [conta.id, telefone, lead],
  )
  return rows[0]!
}

async function registrar(
  conta: Conta,
  conversa: string,
  idDoProvedor: string | null,
  corpo = 'Oi, quero saber mais',
): Promise<{ message_id: string; nova: boolean }> {
  const { rows } = await banco.sql.query<{ message_id: string; nova: boolean }>(
    `select * from public.registrar_mensagem_do_whatsapp($1, $2, 'in', 'lead', null, $3, null, $4, 'recebida')`,
    [conta.id, conversa, corpo, idDoProvedor],
  )
  return rows[0]!
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Conta A', '1')
  contaB = await criarConta('Conta B', '2')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.whatsapp_conversations')
})

test('abrir de novo devolve a conversa ativa, e encerrada o número abre outra', async () => {
  const primeira = await abrir(contaA, '+5548999990011')
  expect(primeira.criada).toBe(true)
  const segunda = await abrir(contaA, '+5548999990011')
  expect(segunda).toEqual({ conversation_id: primeira.conversation_id, criada: false })

  await banco.sql.query(`update public.whatsapp_conversations set status = 'encerrada' where id = $1`, [
    primeira.conversation_id,
  ])
  const terceira = await abrir(contaA, '+5548999990011')
  expect(terceira.criada).toBe(true)
  expect(terceira.conversation_id).not.toBe(primeira.conversation_id)
})

test('o índice parcial recusa a segunda conversa ativa do mesmo número', async () => {
  await abrir(contaA, '+5548999990012')
  await expect(
    banco.sql.query(
      `insert into public.whatsapp_conversations (account_id, phone_e164, started_by)
       values ($1, '+5548999990012', 'lead')`,
      [contaA.id],
    ),
  ).rejects.toMatchObject({ code: '23505' })
})

test('a conversa aberta sem lead ganha o lead na volta seguinte', async () => {
  const sem = await abrir(contaA, '+5548999990013', null)
  await abrir(contaA, '+5548999990013', contaA.leadId)
  const lead = await um(
    'select lead_id from public.whatsapp_conversations where id = $1',
    [sem.conversation_id],
    'lead_id',
  )
  expect(lead).toBe(contaA.leadId)
})

test('abrir com lead narra a conversa iniciada na linha do tempo', async () => {
  const { conversation_id } = await abrir(contaA, '+5548999990014')
  const { rows } = await banco.sql.query<{ actor: string; payload: Record<string, unknown> }>(
    `select actor, payload from public.lead_events
      where lead_id = $1 and kind = 'whatsapp' and payload ->> 'conversation_id' = $2`,
    [contaA.leadId, conversation_id],
  )
  expect(rows).toEqual([
    { actor: 'system', payload: { acao: 'iniciada', conversation_id, started_by: 'lead' } },
  ])
})

test('o webhook repetido não grava a mensagem duas vezes', async () => {
  const { conversation_id } = await abrir(contaA, '+5548999990015')
  const primeira = await registrar(contaA, conversation_id, 'ZAPI-1')
  const repetida = await registrar(contaA, conversation_id, 'ZAPI-1')
  expect(primeira.nova).toBe(true)
  expect(repetida).toEqual({ message_id: primeira.message_id, nova: false })

  const total = await um(
    'select count(*)::int as n from public.whatsapp_messages where conversation_id = $1',
    [conversation_id],
    'n',
  )
  expect(total).toBe(1)

  // A mesma chave em outra conta é outra mensagem.
  const daVizinha = await abrir(contaB, '+5548999990015')
  expect((await registrar(contaB, daVizinha.conversation_id, 'ZAPI-1')).nova).toBe(true)
})

test('mensagem sem id do provedor nunca colide', async () => {
  const { conversation_id } = await abrir(contaA, '+5548999990016')
  expect((await registrar(contaA, conversation_id, null)).nova).toBe(true)
  expect((await registrar(contaA, conversation_id, null)).nova).toBe(true)
})

test('os checks de forma recusam o que o canal não produz', async () => {
  const { conversation_id } = await abrir(contaA, '+5548999990017')
  const inserir = (campos: string, valores: string) =>
    banco.sql.query(
      `insert into public.whatsapp_messages (account_id, conversation_id, ${campos}) values ($1, $2, ${valores})`,
      [contaA.id, conversation_id],
    )
  // Entrada escrita por quem não é o lead.
  await expect(inserir('direction, author, body, status', `'in', 'assistente', 'oi', 'recebida'`)).rejects.toMatchObject({ code: '23514' })
  // Texto vazio sem mídia.
  await expect(inserir('direction, author, body, status', `'in', 'lead', '  ', 'recebida'`)).rejects.toMatchObject({ code: '23514' })
  // Humano sem autor.
  await expect(inserir('direction, author, body, status', `'out', 'humano', 'oi', 'enviada'`)).rejects.toMatchObject({ code: '23514' })
  // Saída marcada como recebida.
  await expect(inserir('direction, author, body, status', `'out', 'assistente', 'oi', 'recebida'`)).rejects.toMatchObject({ code: '23514' })
  // Áudio sem legenda entra.
  await inserir('direction, author, body, media_kind, status', `'in', 'lead', '', 'audio', 'recebida'`)
})

test('mudar o estado devolve código e narra no lead', async () => {
  const { conversation_id } = await abrir(contaA, '+5548999990018')
  const mudar = (de: string[], para: string, acao: string) =>
    um<string>(
      `select public.mudar_estado_da_conversa_do_whatsapp($1, $2, $3, $4, $5, 'user', $6) as r`,
      [contaA.id, conversation_id, de, para, acao, contaA.donoId],
      'r',
    )

  expect(await mudar(['assistente'], 'humano', 'assumida')).toBe('mudou')
  expect(await mudar(['assistente'], 'humano', 'assumida')).toBe('mesmo_estado')
  expect(await mudar(['assistente'], 'encerrada', 'encerrada')).toBe('estado_incompativel')
  expect(await mudar(['humano'], 'assistente', 'devolvida')).toBe('mudou')

  const { rows } = await banco.sql.query<{ acao: string; actor: string; actor_id: string }>(
    `select payload ->> 'acao' as acao, actor, actor_id from public.lead_events
      where kind = 'whatsapp' and payload ->> 'conversation_id' = $1 order by created_at, id`,
    [conversation_id],
  )
  expect(rows.map((linha) => linha.acao).sort()).toEqual(['assumida', 'devolvida', 'iniciada'])
  expect(rows.filter((linha) => linha.acao !== 'iniciada').every((linha) => linha.actor_id === contaA.donoId)).toBe(true)

  const inexistente = await um<string>(
    `select public.mudar_estado_da_conversa_do_whatsapp($1, gen_random_uuid(), array['assistente'], 'humano', 'assumida', 'system', null) as r`,
    [contaA.id],
    'r',
  )
  expect(inexistente).toBe('nao_encontrada')
})

test('conversa de outra conta é nao_encontrada para quem muda o estado', async () => {
  const { conversation_id } = await abrir(contaB, '+5548999990019')
  const resultado = await um<string>(
    `select public.mudar_estado_da_conversa_do_whatsapp($1, $2, array['assistente'], 'humano', 'assumida', 'system', null) as r`,
    [contaA.id, conversation_id],
    'r',
  )
  expect(resultado).toBe('nao_encontrada')
})

test('classe Servidor: só há política de leitura nas duas tabelas', async () => {
  const { rows } = await banco.sql.query<{ tablename: string; cmd: string }>(
    `select tablename, cmd from pg_policies
      where tablename in ('whatsapp_conversations', 'whatsapp_messages') order by tablename`,
  )
  expect(rows).toEqual([
    { tablename: 'whatsapp_conversations', cmd: 'SELECT' },
    { tablename: 'whatsapp_messages', cmd: 'SELECT' },
  ])
})

test('o membro lê a própria conversa, não escreve e não vê a da vizinha', async () => {
  const daA = await abrir(contaA, '+5548999990020')
  await registrar(contaA, daA.conversation_id, 'ZAPI-A')
  const daB = await abrir(contaB, '+5548999990020')
  await registrar(contaB, daB.conversation_id, 'ZAPI-B')

  await banco.comoUsuario(contaA.donoId)
  const conversas = await banco.sql.query<{ id: string }>('select id from public.whatsapp_conversations')
  expect(conversas.rows.map((linha) => linha.id)).toEqual([daA.conversation_id])
  const mensagens = await banco.sql.query<{ provider_message_id: string }>(
    'select provider_message_id from public.whatsapp_messages',
  )
  expect(mensagens.rows.map((linha) => linha.provider_message_id)).toEqual(['ZAPI-A'])

  const alterada = await banco.sql.query(
    `update public.whatsapp_conversations set status = 'humano' where id = $1 returning id`,
    [daA.conversation_id],
  )
  expect(alterada.rows).toEqual([])
  await expect(
    banco.sql.query(
      `insert into public.whatsapp_messages (account_id, conversation_id, direction, author, author_id, body, status)
       values ($1, $2, 'out', 'humano', $3, 'oi', 'enviada')`,
      [contaA.id, daA.conversation_id, contaA.donoId],
    ),
  ).rejects.toThrow(/row-level security/i)
})

test('só uma execução toma a resposta, e soltar diz se chegou mensagem depois do corte', async () => {
  const { conversation_id } = await abrir(contaA, '+5548999990021')
  await registrar(contaA, conversation_id, 'RAJADA-1')
  // Instantes explícitos: o relógio do PGlite sob carga repete o milissegundo.
  await banco.sql.query(
    `update public.whatsapp_messages set created_at = now() - interval '1 minute' where provider_message_id = 'RAJADA-1'`,
  )
  const reivindicar = () =>
    um<Date | null>(
      'select public.reivindicar_resposta_do_whatsapp($1, $2) as corte',
      [contaA.id, conversation_id],
      'corte',
    )
  const corte = await reivindicar()
  expect(corte).not.toBeNull()
  expect(await reivindicar()).toBeNull()

  const soltar = (instante: Date) =>
    um<boolean>('select public.soltar_resposta_do_whatsapp($1, $2, $3) as nova', [contaA.id, conversation_id, instante], 'nova')
  expect(await soltar(corte!)).toBe(false)

  // Mensagem que chega com a conversa tomada é da rodada seguinte.
  const segundo = await reivindicar()
  await registrar(contaA, conversation_id, 'RAJADA-2')
  await banco.sql.query(
    `update public.whatsapp_messages set created_at = $1::timestamptz + interval '1 millisecond' where provider_message_id = 'RAJADA-2'`,
    [segundo],
  )
  expect(await soltar(segundo!)).toBe(true)

  // Reivindicação velha (execução que morreu) pode ser tomada de novo.
  await banco.sql.query(
    `update public.whatsapp_conversations set replying_at = now() - interval '3 minutes' where id = $1`,
    [conversation_id],
  )
  expect(await reivindicar()).not.toBeNull()

  // Conversa com gente não é da assistente.
  await banco.sql.query(`update public.whatsapp_conversations set status = 'humano', replying_at = null where id = $1`, [
    conversation_id,
  ])
  expect(await reivindicar()).toBeNull()
})

test('os RPCs do canal só executam para service_role', async () => {
  const { rows } = await banco.sql.query<{ routine_name: string; grantee: string }>(
    `select routine_name, grantee from information_schema.routine_privileges
      where routine_name in ('abrir_conversa_do_whatsapp', 'registrar_mensagem_do_whatsapp',
                             'mudar_estado_da_conversa_do_whatsapp', 'reivindicar_resposta_do_whatsapp',
                             'soltar_resposta_do_whatsapp')
        and privilege_type = 'EXECUTE' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
      order by routine_name, grantee`,
  )
  expect(rows).toEqual([
    { routine_name: 'abrir_conversa_do_whatsapp', grantee: 'service_role' },
    { routine_name: 'mudar_estado_da_conversa_do_whatsapp', grantee: 'service_role' },
    { routine_name: 'registrar_mensagem_do_whatsapp', grantee: 'service_role' },
    { routine_name: 'reivindicar_resposta_do_whatsapp', grantee: 'service_role' },
    { routine_name: 'soltar_resposta_do_whatsapp', grantee: 'service_role' },
  ])
})

test('canal e pré-contato nascem desligados, e o texto do pré-contato nasce nulo', async () => {
  const { rows } = await banco.sql.query<Record<string, unknown>>(
    `select whatsapp_enabled, whatsapp_pre_contact, whatsapp_pre_contact_text
       from public.account_settings where account_id = $1`,
    [contaA.id],
  )
  expect(rows).toEqual([
    { whatsapp_enabled: false, whatsapp_pre_contact: false, whatsapp_pre_contact_text: null },
  ])
  await expect(
    banco.sql.query(`update public.account_settings set whatsapp_pre_contact_text = '  ' where account_id = $1`, [
      contaA.id,
    ]),
  ).rejects.toMatchObject({ code: '23514' })
})

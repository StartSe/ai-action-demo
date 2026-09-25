// `lead_events` é a linha do tempo do lead, e o que ela promete não é o que
// guarda, é como foi escrita: nenhuma linha entrou por fora do RPC, e nenhuma
// foi assinada por quem não a fez.
//
// Três coisas se provam aqui, e as três são sobre a ausência de caminho:
//
// 1. Não há política de escrita. Membro, operador e owner recebem a mesma
//    recusa no insert direto, e o catálogo confirma que a política continua
//    ausente — sem isso, a declaração envelheceria calada.
// 2. O RPC é o caminho, e ele resolve a conta pelo lead: evento em lead de
//    outra conta é `sem_permissao`, não linha gravada no lugar errado.
// 3. Com sessão, o autor é `auth.uid()` e não o argumento. É o que impede o
//    cliente de gravar um evento assinado pela Sarah.
//
// Referência: migração 20260921110000_lead_events.sql,
// docs/PRD-implementacao.md seções 3.2 e 3.9, docs/PRD.md RF-113.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

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
  readonly leadId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(
  nome: string,
  dominio: string,
  telefone: string,
): Promise<Conta> {
  await banco.comoServico()

  const { rows: contas } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = contas[0]!.id

  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  const observadorId = await banco.criarUsuario(
    `observador@${dominio}`,
    'Observador',
  )

  await banco.comoServico()
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'operator'), ($1, $4, 'viewer')`,
    [id, donoId, operadorId, observadorId],
  )

  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164)
     values ($1, $2, $3)
     returning id`,
    [id, `Lead de ${nome}`, telefone],
  )

  return { id, donoId, operadorId, observadorId, leadId: leads[0]!.id }
}

/** Chama o RPC na sessão em curso e devolve o id do evento. */
async function registrar(
  leadId: string,
  kind: string,
  extras: {
    actor?: string
    actorId?: string | null
    summary?: string | null
    payload?: unknown
  } = {},
): Promise<string> {
  const { rows } = await banco.sql.query<{ registrar_evento_de_lead: string }>(
    `select public.registrar_evento_de_lead($1, $2, $3, $4, $5, $6)`,
    [
      leadId,
      kind,
      extras.actor ?? 'user',
      extras.actorId ?? null,
      extras.summary ?? null,
      JSON.stringify(extras.payload ?? {}),
    ],
  )
  return rows[0]!.registrar_evento_de_lead
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test', '+5548999880001')
  contaB = await criarConta('Cooperativa Sul', 'sul.test', '+5548999880002')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
})

// Nenhum caminho de escrita pelo cliente ------------------------------------

test('a tabela não tem política de escrita no catálogo', async () => {
  const { rows } = await banco.sql.query<{ cmd: string; policyname: string }>(
    `select cmd, policyname
       from pg_policies
      where schemaname = 'public'
        and tablename = 'lead_events'`,
  )

  expect(
    rows.map((linha) => linha.cmd).sort(),
    'lead_events é classe Servidor: uma política, de select. Política de ' +
      'escrita aqui devolve ao cliente a chance de forjar autor de evento',
  ).toEqual(['SELECT'])
})

test.each([
  ['o owner', (conta: Conta) => conta.donoId],
  ['o operador', (conta: Conta) => conta.operadorId],
  ['o viewer', (conta: Conta) => conta.observadorId],
])('%s não insere evento direto na tabela', async (_papel, escolher) => {
  await banco.comoUsuario(escolher(contaA))

  await expect(
    banco.sql.query(
      `insert into public.lead_events (account_id, lead_id, kind, actor, actor_id)
       values ($1, $2, 'note', 'user', $3)`,
      [contaA.id, contaA.leadId, escolher(contaA)],
    ),
  ).rejects.toThrow(/row-level security/i)
})

test('o evento gravado não se altera nem se apaga pelo cliente', async () => {
  const evento = await registrar(contaA.leadId, 'note', {
    actor: 'system',
    summary: 'anotação original',
  })

  await banco.comoUsuario(contaA.donoId)

  // Sem política de update nem de delete, o `using` não casa com linha nenhuma:
  // o comando não levanta erro, apenas não afeta nada.
  const { rows: alterados } = await banco.sql.query(
    `update public.lead_events set summary = 'reescrito' where id = $1 returning id`,
    [evento],
  )
  expect(alterados).toEqual([])

  const { rows: apagados } = await banco.sql.query(
    'delete from public.lead_events where id = $1 returning id',
    [evento],
  )
  expect(apagados).toEqual([])

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ summary: string }>(
    'select summary from public.lead_events where id = $1',
    [evento],
  )
  expect(rows[0]?.summary).toBe('anotação original')
})

// O RPC é o caminho ----------------------------------------------------------

test('o RPC insere e devolve o id do evento', async () => {
  await banco.comoUsuario(contaA.operadorId)

  const evento = await registrar(contaA.leadId, 'stage_change', {
    summary: 'moveu para contatado',
    payload: { de: 'new', para: 'contacted' },
  })

  expect(evento).toMatch(UUID)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    account_id: string
    lead_id: string
    kind: string
    actor: string
    actor_id: string
    payload: unknown
  }>(
    `select account_id, lead_id, kind, actor, actor_id, payload
       from public.lead_events where id = $1`,
    [evento],
  )

  expect(rows[0]).toEqual({
    account_id: contaA.id,
    lead_id: contaA.leadId,
    kind: 'stage_change',
    actor: 'user',
    actor_id: contaA.operadorId,
    payload: { de: 'new', para: 'contacted' },
  })
})

test('quem tem sessão assina com o próprio id, não com o que o argumento diz', async () => {
  await banco.comoUsuario(contaA.observadorId)

  const evento = await registrar(contaA.leadId, 'note', {
    actor: 'agent',
    actorId: contaA.donoId,
    summary: 'tentou assinar como a Sarah',
  })

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ actor: string; actor_id: string }>(
    'select actor, actor_id from public.lead_events where id = $1',
    [evento],
  )

  expect(
    rows[0],
    'com sessão, o autor é auth.uid(): aceitar o argumento deixaria o ' +
      'cliente gravar evento assinado pelo agente ou por outra pessoa',
  ).toEqual({ actor: 'user', actor_id: contaA.observadorId })
})

test('a borda, sem sessão, registra evento do agente', async () => {
  const evento = await registrar(contaA.leadId, 'lead_imported', {
    actor: 'agent',
    actorId: null,
    summary: 'importado da planilha',
  })

  const { rows } = await banco.sql.query<{ actor: string; actor_id: null }>(
    'select actor, actor_id from public.lead_events where id = $1',
    [evento],
  )
  expect(rows[0]).toEqual({ actor: 'agent', actor_id: null })
})

test('o RPC recusa evento em lead de outra conta', async () => {
  await banco.comoUsuario(contaA.operadorId)

  await expect(registrar(contaB.leadId, 'note')).rejects.toThrow(
    /sem_permissao/,
  )

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ total: number }>(
    `select count(*)::int as total
       from public.lead_events where lead_id = $1`,
    [contaB.leadId],
  )
  expect(rows[0]?.total).toBe(0)
})

test('o RPC recusa lead que não existe', async () => {
  await banco.comoUsuario(contaA.operadorId)

  await expect(
    registrar('00000000-0000-4000-8000-000000000000', 'note'),
  ).rejects.toThrow(/lead_inexistente/)
})

test('o RPC recusa tipo de evento fora do vocabulário', async () => {
  await expect(
    registrar(contaA.leadId, 'ligacao_perdida', { actor: 'system' }),
  ).rejects.toThrow(/violates check constraint/i)
})

test('só authenticated e service_role executam o RPC', async () => {
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee
       from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'registrar_evento_de_lead'
        and privilege_type = 'EXECUTE'`,
  )

  const concedidos = rows.map((linha) => linha.grantee)
  expect(concedidos).toContain('authenticated')
  expect(concedidos).toContain('service_role')
  expect(
    concedidos,
    'PUBLIC alcança qualquer papel presente ou futuro, e anon não tem lead ' +
      'para narrar',
  ).not.toContain('PUBLIC')
  expect(concedidos).not.toContain('anon')
})

// Leitura --------------------------------------------------------------------

test('cada conta lê os próprios eventos e nenhum da vizinha', async () => {
  const naA = await registrar(contaA.leadId, 'lead_created', {
    actor: 'system',
  })
  const naB = await registrar(contaB.leadId, 'lead_created', {
    actor: 'system',
  })

  await banco.comoUsuario(contaA.donoId)
  const { rows: vistosPelaA } = await banco.sql.query<{ id: string }>(
    'select id from public.lead_events',
  )
  const idsDaA = vistosPelaA.map((linha) => linha.id)
  expect(idsDaA).toContain(naA)
  expect(idsDaA).not.toContain(naB)

  await banco.comoUsuario(contaB.donoId)
  const { rows: vistosPelaB } = await banco.sql.query<{ id: string }>(
    'select id from public.lead_events',
  )
  const idsDaB = vistosPelaB.map((linha) => linha.id)
  expect(idsDaB).toContain(naB)
  expect(idsDaB).not.toContain(naA)
})

test('a sessão anônima não alcança evento nenhum', async () => {
  await registrar(contaA.leadId, 'note', { actor: 'system' })
  await banco.comoAnonimo()

  const { rows } = await banco.sql.query('select id from public.lead_events')
  expect(rows).toEqual([])
})

// Forma da tabela ------------------------------------------------------------

test('a tabela não tem updated_at, e a razão está no comentário', async () => {
  const { rows: colunas } = await banco.sql.query<{ attname: string }>(
    `select a.attname
       from pg_attribute as a
      where a.attrelid = 'public.lead_events'::regclass
        and a.attname = 'updated_at'
        and not a.attisdropped`,
  )
  expect(
    colunas,
    'updated_at aqui significaria linha do tempo reescrita, e puxaria a ' +
      'tabela para a varredura de auditoria sem ter o que auditar',
  ).toEqual([])

  const { rows } = await banco.sql.query<{ comentario: string | null }>(
    `select obj_description('public.lead_events'::regclass, 'pg_class') as comentario`,
  )
  expect(rows[0]?.comentario ?? '').toMatch(/updated_at/)
})

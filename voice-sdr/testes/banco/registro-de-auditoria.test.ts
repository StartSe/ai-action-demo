// Registro de auditoria: a promessa é "dá para saber quem mudou o quê, e o
// cliente não consegue mentir sobre isso". Ela se parte em três perguntas, e
// cada uma tem teste aqui:
//
// 1. A mudança gera registro, com o autor certo e o antes/depois certo?
// 2. O registro é inescapável — nasce na mesma transação, some com ela, e
//    aparece mesmo quando ninguém pediu?
// 3. O cliente consegue escrever na trilha, de algum jeito?
//
// Referência: docs/PRD-implementacao.md seções 3.1 (audit_log) e 3.9.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  UUID,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** Erro que a RLS levanta quando o `with check` recusa a linha. */
const RECUSA_DE_RLS = /row-level security/i

/**
 * Tabela com `updated_at` é tabela que alguém edita, e edição de configuração
 * é o que a trilha existe para registrar. A varredura estrutural cobra gatilho
 * de todas elas; sair da lista exige razão escrita aqui.
 */
const SEM_AUDITORIA: Record<string, string> = {
  profiles:
    'não tem conta: o mesmo usuário serve várias, e não há account_id para ' +
    'onde mandar o registro. Mudança de perfil é do usuário, não da empresa.',
  calls:
    'tabela de servidor: cada chamada passa por fila, toque, conversa e ' +
    'finalização, e a trilha teria dezenas de linhas por ligação dizendo o ' +
    'que a própria linha já diz, nenhuma com autor humano. O que precisa de ' +
    'autor é a decisão de discar, e essa call-place registra.',
  call_reviews:
    'tabela de servidor, pela razão de calls: um ciclo passa por análise, ' +
    'questionário, propostas e encerramento, e quase toda escrita é do ' +
    'servidor. O ato humano que muda o produto é aplicar, e ele não fica ' +
    'aqui: ele vira linha em playbook_versions, que é auditada e carrega ' +
    'author_id de quem aprovou e change_note dizendo de qual revisão veio. ' +
    'Quem abriu o ciclo fica em created_by.',
  call_review_questions:
    'conteúdo da revisão, não decisão: a pergunta é do modelo e a resposta é ' +
    'de quem administra, e as duas moram na própria linha com answered_at. ' +
    'Auditar aqui duplicaria o que a coluna já diz, uma linha por pergunta.',
  whatsapp_conversations:
    'tabela de servidor, pela razão de calls: cada mensagem avança ' +
    'last_message_at e cada consulta de horário reescreve slot_offers, sem ' +
    'autor humano. Os atos de gente (assumir, devolver, encerrar) passam por ' +
    'mudar_estado_da_conversa_do_whatsapp, que narra a ação com o autor em ' +
    'lead_events, e a mensagem de gente guarda author_id na própria linha.',
  call_review_changes:
    'rascunho de rascunho: a proposta é do modelo e se reescreve no lugar a ' +
    'cada questionamento. O que precisa de história é o texto que a Sarah ' +
    'fala, e esse é imutável em playbook_versions, que é auditada. A decisão ' +
    'de cada proposta fica em decision e decided_at, e applied_version_id ' +
    'liga a aceita à versão que ela gerou.',
}

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly viewerId: string
}

interface Registro {
  account_id: string
  actor: string
  actor_id: string | null
  source: string
  action: string
  target_type: string
  target_id: string | null
  reason: string | null
  payload: {
    campos?: string[]
    antes?: Record<string, unknown>
    depois?: Record<string, unknown>
  }
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await montarConta('A')
  contaB = await montarConta('B')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.audit_log')
})

async function montarConta(rotulo: string): Promise<Conta> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [`Conta ${rotulo}`],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`Não foi possível criar a conta ${rotulo}`)

  const donoId = await banco.criarUsuario(
    `dono.${rotulo.toLowerCase()}@auditoria.test`,
    `Dono ${rotulo}`,
  )
  const viewerId = await banco.criarUsuario(
    `viewer.${rotulo.toLowerCase()}@auditoria.test`,
    `Viewer ${rotulo}`,
  )
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'viewer')`,
    [id, donoId, viewerId],
  )

  return { id, donoId, viewerId }
}

/** A trilha da conta, da mais antiga para a mais nova. */
async function trilha(conta: Conta): Promise<Registro[]> {
  const { rows } = await banco.sql.query<Registro>(
    `select account_id, actor, actor_id, source, action, target_type,
            target_id, reason, payload
       from public.audit_log
      where account_id = $1
      order by created_at, target_type`,
    [conta.id],
  )
  return rows
}

/** Convite pendente, para ter uma linha com coluna sensível para editar. */
async function semearConvite(conta: Conta, sufixo: string): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.invitations (account_id, email, role, token_hash, invited_by)
     values ($1, $2, 'viewer', repeat('a', 64), $3)
     returning id`,
    [conta.id, `convidado.${sufixo}@auditoria.test`, conta.donoId],
  )
  const id = rows[0]?.id
  if (!id) throw new Error('Não foi possível semear o convite')
  return id
}

// O que o gatilho registra ----------------------------------------------------

test('alterar a conta grava uma linha de auditoria com o autor da sessão', async () => {
  await banco.comoUsuario(contaA.donoId)
  const { rows } = await banco.sql.query(
    'update public.accounts set name = $2 where id = $1 returning id',
    [contaA.id, 'Conta A renomeada'],
  )
  expect(rows, 'o owner precisa conseguir renomear a própria conta').toHaveLength(1)

  await banco.comoServico()
  const registros = await trilha(contaA)
  expect(registros).toHaveLength(1)

  const registro = registros[0]
  expect(registro?.actor).toBe('user')
  expect(registro?.actor_id).toBe(contaA.donoId)
  expect(registro?.source).toBe('trigger')
  expect(registro?.action).toBe('update')
  expect(registro?.target_type).toBe('accounts')
  expect(registro?.target_id).toBe(contaA.id)
  expect(registro?.payload.campos).toEqual(['name'])
  expect(registro?.payload.antes).toEqual({ name: 'Conta A' })
  expect(registro?.payload.depois).toEqual({ name: 'Conta A renomeada' })
})

test('o registro guarda só os campos que mudaram, e não a linha inteira', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.accounts set status = 'suspended' where id = $1`,
    [contaB.id],
  )

  const registro = (await trilha(contaB))[0]
  expect(registro?.payload.campos).toEqual(['status'])
  expect(
    Object.keys(registro?.payload.antes ?? {}),
    'feature_flags e timezone não mudaram e não têm por que estar no payload',
  ).toEqual(['status'])
})

test('update que não muda nada além de updated_at não vira registro', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query(
    'update public.accounts set name = name where id = $1 returning id',
    [contaA.id],
  )
  expect(rows, 'o update aconteceu; o que não deve acontecer é o registro').toHaveLength(1)

  expect(
    await trilha(contaA),
    'updated_at muda em toda escrita, por gatilho: registrar isso seria ruído',
  ).toEqual([])
})

test('escrita sem sessão de usuário fica marcada como system, sem autor', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.accounts set timezone = 'America/Belem' where id = $1`,
    [contaA.id],
  )

  const registro = (await trilha(contaA))[0]
  expect(registro?.actor).toBe('system')
  expect(registro?.actor_id).toBeNull()
})

test('apagar um vínculo registra a linha inteira como estava', async () => {
  await banco.comoServico()
  const forasteiro = await banco.criarUsuario('saindo@auditoria.test', 'Saindo')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'operator')`,
    [contaA.id, forasteiro],
  )

  await banco.comoUsuario(contaA.donoId)
  await banco.sql.query(
    'delete from public.account_members where account_id = $1 and user_id = $2',
    [contaA.id, forasteiro],
  )

  await banco.comoServico()
  const registro = (await trilha(contaA))[0]
  expect(registro?.action).toBe('delete')
  expect(registro?.target_type).toBe('account_members')
  expect(registro?.actor_id).toBe(contaA.donoId)
  expect(registro?.payload.antes).toMatchObject({
    account_id: contaA.id,
    user_id: forasteiro,
    role: 'operator',
  })
  expect(registro?.payload.depois).toBeUndefined()
})

test('o motivo da mudança entra no registro quando a sessão o declara', async () => {
  await banco.comoServico()
  await banco.sql.query('select set_config($1, $2, false)', [
    'app.audit_reason',
    'suspensão por inadimplência',
  ])
  try {
    await banco.sql.query(
      `update public.accounts set status = 'cancelled' where id = $1`,
      [contaB.id],
    )
  } finally {
    await banco.sql.query('select set_config($1, $2, false)', [
      'app.audit_reason',
      '',
    ])
  }

  expect((await trilha(contaB))[0]?.reason).toBe('suspensão por inadimplência')

  await banco.sql.query(
    `update public.accounts set status = 'active' where id = $1`,
    [contaB.id],
  )
  const semMotivo = (await trilha(contaB))[1]
  expect(semMotivo?.reason, 'sem declaração, o motivo é nulo e não vazio').toBeNull()
})

// O que o registro nunca guarda ------------------------------------------------

test('coluna sensível entra redigida no payload', async () => {
  await banco.comoServico()
  const conviteId = await semearConvite(contaA, 'redacao')
  await banco.sql.query(
    'update public.invitations set token_hash = $2 where id = $1',
    [conviteId, 'b'.repeat(64)],
  )

  const registro = (await trilha(contaA))[0]
  expect(registro?.payload.campos).toEqual(['token_hash'])
  expect(registro?.payload.antes).toEqual({ token_hash: '[redigido]' })
  expect(registro?.payload.depois).toEqual({ token_hash: '[redigido]' })
})

test('apagar credencial registra o fato sem registrar o ponteiro do cofre', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `insert into public.account_secrets (account_id, provider, key_name, secret_id)
     values ($1, 'elevenlabs', 'api_key',
             vault.create_secret('valor-que-nao-pode-vazar', $2, 'auditoria'))`,
    [contaA.id, `auditoria:${contaA.id}:elevenlabs:api_key`],
  )

  await banco.sql.query(
    `delete from public.account_secrets where account_id = $1`,
    [contaA.id],
  )

  const registro = (await trilha(contaA))[0]
  expect(registro?.target_type).toBe('account_secrets')
  expect(registro?.payload.antes).toMatchObject({
    provider: 'elevenlabs',
    key_name: 'api_key',
    secret_id: '[redigido]',
  })
  expect(JSON.stringify(registro?.payload)).not.toContain('valor-que-nao-pode-vazar')
})

// Inescapável -------------------------------------------------------------------

test('a mudança e o registro vivem na mesma transação', async () => {
  await banco.comoServico()
  await banco.sql.query('begin')
  await banco.sql.query(
    `update public.accounts set timezone = 'Europe/Lisbon' where id = $1`,
    [contaA.id],
  )
  expect(await trilha(contaA)).toHaveLength(1)
  await banco.sql.query('rollback')

  expect(
    await trilha(contaA),
    'o rollback desfez a mudança; auditoria que sobrevivesse a ele seria mentira',
  ).toEqual([])
})

test('apagar a conta não trava na cascata da própria trilha', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Conta que some') returning id`,
  )
  const contaId = rows[0]?.id
  if (!contaId) throw new Error('Não foi possível criar a conta descartável')

  const usuarioId = await banco.criarUsuario('some@auditoria.test', 'Some')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner')`,
    [contaId, usuarioId],
  )

  await expect(
    banco.sql.query('delete from public.accounts where id = $1', [contaId]),
  ).resolves.toBeDefined()

  const { rows: sobrando } = await banco.sql.query(
    'select 1 from public.audit_log where account_id = $1',
    [contaId],
  )
  expect(sobrando, 'a trilha da conta vai junto com a conta').toHaveLength(0)
})

// Nenhuma escrita pelo cliente ---------------------------------------------------

test('audit_log não tem política de insert, update ou delete', async () => {
  const { rows } = await banco.sql.query<{ policyname: string; cmd: string }>(
    `select policyname, cmd
       from pg_policies
      where schemaname = 'public'
        and tablename = 'audit_log'
      order by policyname`,
  )
  expect(rows.map((linha) => linha.cmd)).toEqual(['SELECT'])
})

test('o cliente autenticado não insere na trilha, nem na própria conta', async () => {
  await banco.comoUsuario(contaA.donoId)
  await expect(
    banco.sql.query(
      `insert into public.audit_log
         (account_id, actor, actor_id, source, action, target_type)
       values ($1, 'user', $2, 'forjado', 'update', 'accounts')`,
      [contaA.id, contaA.donoId],
    ),
  ).rejects.toThrow(RECUSA_DE_RLS)

  await banco.comoAnonimo()
  await expect(
    banco.sql.query(
      `insert into public.audit_log
         (account_id, actor, source, action, target_type)
       values ($1, 'system', 'forjado', 'delete', 'accounts')`,
      [contaA.id],
    ),
  ).rejects.toThrow(RECUSA_DE_RLS)
})

test('o cliente não apaga nem reescreve o que a trilha já registrou', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.accounts set timezone = 'America/Manaus' where id = $1`,
    [contaA.id],
  )

  await banco.comoUsuario(contaA.donoId)
  const { rows: apagadas } = await banco.sql.query(
    'delete from public.audit_log where account_id = $1 returning id',
    [contaA.id],
  )
  expect(apagadas, 'sem política de delete, o using não casa e nada é afetado').toHaveLength(0)

  const { rows: alteradas } = await banco.sql.query(
    `update public.audit_log set action = 'nada aconteceu' where account_id = $1 returning id`,
    [contaA.id],
  )
  expect(alteradas).toHaveLength(0)

  await banco.comoServico()
  expect(await trilha(contaA)).toHaveLength(1)
})

// Leitura ------------------------------------------------------------------------

test('membro lê a trilha da própria conta e nenhuma linha da vizinha', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.accounts set timezone = 'America/Recife' where id in ($1, $2)`,
    [contaA.id, contaB.id],
  )

  await banco.comoUsuario(contaA.viewerId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.audit_log',
  )
  expect(rows.map((linha) => linha.account_id)).toEqual([contaA.id])
})

// Cobertura ------------------------------------------------------------------------

test('toda tabela editável de public tem gatilho de auditoria', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    nome: string
    auditada: boolean
  }>(
    `select c.relname as nome,
            exists (
              select 1
                from pg_trigger as t
               where t.tgrelid = c.oid
                 and not t.tgisinternal
                 and t.tgfoid = 'public.registrar_auditoria()'::regprocedure
                 -- Bitmap de pg_trigger.tgtype: 1 = por linha, 2 = before
                 -- (zero significa after), 8 = delete, 16 = update.
                 and (t.tgtype & 1) = 1
                 and (t.tgtype & 2) = 0
                 and (t.tgtype & 8) = 8
                 and (t.tgtype & 16) = 16
            ) as auditada
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and exists (
          select 1
            from pg_attribute as a
           where a.attrelid = c.oid
             and a.attname = 'updated_at'
             and a.attnum > 0
             and not a.attisdropped
        )
      order by c.relname`,
  )

  expect(rows.length).toBeGreaterThan(0)
  const descobertas = rows
    .filter((linha) => !linha.auditada && !(linha.nome in SEM_AUDITORIA))
    .map((linha) => linha.nome)
  expect(
    descobertas,
    'tabela que alguém edita e a trilha não registra: ou falta o create ' +
      'trigger na migração, ou falta a razão em SEM_AUDITORIA',
  ).toEqual([])

  for (const nome of Object.keys(SEM_AUDITORIA)) {
    expect(
      rows.some((linha) => linha.nome === nome),
      `${nome} está em SEM_AUDITORIA e não existe mais: a declaração venceu`,
    ).toBe(true)
  }
})

test('o id do registro é uuid e a trilha não tem updated_at', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.accounts set timezone = 'America/Cuiaba' where id = $1`,
    [contaA.id],
  )

  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.audit_log where account_id = $1',
    [contaA.id],
  )
  expect(rows[0]?.id).toMatch(UUID)

  const { rows: colunas } = await banco.sql.query<{ attname: string }>(
    `select a.attname
       from pg_attribute as a
      where a.attrelid = 'public.audit_log'::regclass
        and a.attname = 'updated_at'
        and not a.attisdropped`,
  )
  expect(
    colunas,
    'trilha é append-only: coluna de atualização convidaria a reescrever o passado',
  ).toHaveLength(0)
})

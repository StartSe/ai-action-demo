// O ensaio no banco (US-247).
//
// O que este arquivo prova:
//
// 1. `abrir_ensaio` cria a chamada e o ensaio na mesma transação, e a chamada
//    nasce `in_progress` com `direction = 'rehearsal'` — que é o que faz o
//    ciclo de evolução funcionar sobre ela sem uma linha a mais.
// 2. A chave de idempotência nunca colide entre dois ensaios da mesma conta.
// 3. `encerrar_ensaio` grava uma vez só: a segunda passagem devolve falso e
//    não sobrescreve a transcrição com uma leitura mais velha do provedor.
// 4. Classe Servidor: membro lê, ninguém escreve pelo cliente.
// 5. Apagar a chamada leva o ensaio junto.
// 6. Não existe ensaio sem publicação (US-098, T-16), e o gatilho recusa o
//    ensaio pendurado em chamada real, de outra conta, ou contra publicação de
//    outra conta ou de outro propósito.
//
// Referência: migrações 20260924120000_ensaio.sql e
// 20260924160000_ensaio_sobre_a_publicacao.sql,
// supabase/functions/rehearsal-session/sessao.ts.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let donoId: string
let operadorId: string
let outraContaId: string
let outroDonoId: string
/** A publicação de descoberta de cada conta, pelo id da conta. */
const publicacoes = new Map<string, string>()
let publicacaoDeLembreteId: string

const TRANSCRICAO = {
  turns: [
    { role: 'agent', text: 'Oi, aqui é a Sarah. Esta ligação é gravada.' },
    { role: 'lead', text: 'Pode falar.' },
  ],
}

interface Aberto {
  call_id: string
  rehearsal_id: string
}

async function criarConta(nome: string, email: string): Promise<{ id: string; donoId: string }> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const usuarioId = await banco.criarUsuario(email, nome)
  await banco.sql.query(
    'insert into public.account_members (account_id, user_id, role) values ($1, $2, $3)',
    [id, usuarioId, 'owner'],
  )
  const { rows: agentes } = await banco.sql.query<{ id: string }>(
    "insert into public.agents (account_id, name, company_name) values ($1, 'Sarah', $2) returning id",
    [id, nome],
  )
  const { rows: pubs } = await banco.sql.query<{ id: string }>(
    `insert into public.agent_publications (account_id, agent_id, purpose)
     values ($1, $2, 'discovery') returning id`,
    [id, agentes[0]!.id],
  )
  publicacoes.set(id, pubs[0]!.id)
  return { id, donoId: usuarioId }
}

function publicacaoDe(conta: string): string {
  const publicacao = publicacoes.get(conta)
  if (!publicacao) throw new Error(`conta ${conta} sem publicação no cenário`)
  return publicacao
}

async function chamada(direcao: string, conta = contaId, chave = crypto.randomUUID()): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (account_id, purpose, direction, idempotency_key)
     values ($1, 'discovery', $2, $3) returning id`,
    [conta, direcao, chave],
  )
  return rows[0]!.id
}

async function abrir(conta = contaId, autor = donoId, modo = 'text'): Promise<Aberto> {
  const { rows } = await banco.sql.query<Aberto>(
    `select call_id, rehearsal_id
       from public.abrir_ensaio($1, 'discovery', $2, $3::jsonb, $4, $5, null)`,
    [conta, modo, JSON.stringify({ perfil: 'interessado' }), autor, publicacaoDe(conta)],
  )
  return rows[0]!
}

async function recusa(executar: () => Promise<unknown>): Promise<string | null> {
  try {
    await executar()
    return null
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro)
  }
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()

  const a = await criarConta('Fretes do Vale', 'dono@fretes.test')
  contaId = a.id
  donoId = a.donoId

  operadorId = await banco.criarUsuario('operador@fretes.test', 'Operador')
  await banco.sql.query(
    'insert into public.account_members (account_id, user_id, role) values ($1, $2, $3)',
    [contaId, operadorId, 'operator'],
  )

  const b = await criarConta('Metalúrgica Sul', 'dono@metal.test')
  outraContaId = b.id
  outroDonoId = b.donoId

  const { rows: lembrete } = await banco.sql.query<{ id: string }>(
    `insert into public.agent_publications (account_id, agent_id, purpose)
     select account_id, agent_id, 'reminder' from public.agent_publications where id = $1
     returning id`,
    [publicacaoDe(contaId)],
  )
  publicacaoDeLembreteId = lembrete[0]!.id
}, 120_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.calls where account_id = any($1)', [
    [contaId, outraContaId],
  ])
})

test('abrir_ensaio cria a chamada e o ensaio numa transação', async () => {
  const { call_id, rehearsal_id } = await abrir()

  const { rows: chamadas } = await banco.sql.query<{
    direction: string
    status: string
    purpose: string
    lead_id: string | null
    answered_at: string | null
    idempotency_key: string
  }>(
    'select direction, status, purpose, lead_id, answered_at, idempotency_key from public.calls where id = $1',
    [call_id],
  )
  const chamada = chamadas[0]!
  // É uma chamada: é isso que faz o ciclo de evolução funcionar sobre ela.
  expect(chamada.direction).toBe('rehearsal')
  expect(chamada.status).toBe('in_progress')
  expect(chamada.purpose).toBe('discovery')
  // Pendurada no lead de ensaio da conta, e nunca num lead real: isso
  // sujaria o histórico dele com uma conversa que não aconteceu (US-112).
  const { rows: leads } = await banco.sql.query<{ is_synthetic: boolean }>(
    'select is_synthetic from public.leads where id = $1',
    [chamada.lead_id],
  )
  expect(leads[0]?.is_synthetic).toBe(true)
  // No ensaio não há toque nem atendimento: a conversa começa quando a sessão
  // abre, e é esse o instante de `answered_at`.
  expect(chamada.answered_at).not.toBeNull()
  expect(chamada.idempotency_key).toBe(`rehearsal:${rehearsal_id}`)

  const { rows: ensaios } = await banco.sql.query<{ mode: string; persona_profile: unknown }>(
    'select mode, persona_profile from public.rehearsals where id = $1',
    [rehearsal_id],
  )
  expect(ensaios[0]?.mode).toBe('text')
  expect(ensaios[0]?.persona_profile).toEqual({ perfil: 'interessado' })
})

test('dois ensaios seguidos da mesma conta não colidem na idempotência', async () => {
  // O único de `calls` é por (conta, chave): a chave leva o identificador do
  // próprio ensaio justamente para dois no mesmo segundo não colidirem.
  const primeiro = await abrir()
  const segundo = await abrir()

  expect(primeiro.call_id).not.toBe(segundo.call_id)
  const { rows } = await banco.sql.query<{ total: number }>(
    "select count(*)::int as total from public.calls where account_id = $1 and direction = 'rehearsal'",
    [contaId],
  )
  expect(rows[0]?.total).toBe(2)
})

test('encerrar_ensaio grava a transcrição e fecha a chamada', async () => {
  const { call_id, rehearsal_id } = await abrir()

  const { rows } = await banco.sql.query<{ encerrar_ensaio: boolean }>(
    'select public.encerrar_ensaio($1, $2::jsonb, $3, $4)',
    [rehearsal_id, JSON.stringify(TRANSCRICAO), 'conv_do_ensaio', 42],
  )
  expect(rows[0]?.encerrar_ensaio).toBe(true)

  const { rows: chamadas } = await banco.sql.query<{
    status: string
    end_reason: string
    duration_sec: number
    transcript: unknown
    provider_conversation_id: string
    finalized_at: string | null
  }>(
    `select status, end_reason, duration_sec, transcript, provider_conversation_id, finalized_at
       from public.calls where id = $1`,
    [call_id],
  )
  const chamada = chamadas[0]!
  expect(chamada.status).toBe('ended')
  expect(chamada.end_reason).toBe('completed')
  expect(chamada.duration_sec).toBe(42)
  expect(chamada.transcript).toEqual(TRANSCRICAO)
  expect(chamada.provider_conversation_id).toBe('conv_do_ensaio')
  expect(chamada.finalized_at).not.toBeNull()
})

test('encerrar duas vezes grava uma vez', async () => {
  const { call_id, rehearsal_id } = await abrir()

  await banco.sql.query('select public.encerrar_ensaio($1, $2::jsonb, $3, $4)', [
    rehearsal_id,
    JSON.stringify(TRANSCRICAO),
    'conv_do_ensaio',
    42,
  ])

  // A segunda passagem é o botão clicado enquanto a aba fecha. Sem a condição
  // `finished_at is null`, ela sobrescreveria a conversa com o que veio depois.
  const { rows } = await banco.sql.query<{ encerrar_ensaio: boolean }>(
    'select public.encerrar_ensaio($1, $2::jsonb, $3, $4)',
    [rehearsal_id, JSON.stringify({ turns: [] }), null, 0],
  )
  expect(rows[0]?.encerrar_ensaio).toBe(false)

  const { rows: chamadas } = await banco.sql.query<{ transcript: unknown; duration_sec: number }>(
    'select transcript, duration_sec from public.calls where id = $1',
    [call_id],
  )
  expect(chamadas[0]?.transcript).toEqual(TRANSCRICAO)
  expect(chamadas[0]?.duration_sec).toBe(42)
})

test('duração negativa vira zero, e não número negativo', async () => {
  const { call_id, rehearsal_id } = await abrir()
  await banco.sql.query('select public.encerrar_ensaio($1, $2::jsonb, $3, $4)', [
    rehearsal_id,
    JSON.stringify(TRANSCRICAO),
    null,
    -5,
  ])

  const { rows } = await banco.sql.query<{ duration_sec: number }>(
    'select duration_sec from public.calls where id = $1',
    [call_id],
  )
  // O check da coluna recusaria negativo; `greatest` é quem o evita antes.
  expect(rows[0]?.duration_sec).toBe(0)
})

test('modo desconhecido não entra', async () => {
  const erro = await recusa(() => abrir(contaId, donoId, 'telepatia'))
  expect(erro).toMatch(/rehearsals_mode_check|violates check/i)
})

test('membro lê; a conta vizinha e o anônimo não veem nada', async () => {
  await abrir()
  await abrir(outraContaId, outroDonoId)

  await banco.comoUsuario(operadorId)
  const doOperador = await banco.sql.query('select id from public.rehearsals')
  expect(doOperador.rows).toHaveLength(1)

  await banco.comoUsuario(outroDonoId)
  const doVizinho = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.rehearsals',
  )
  expect(doVizinho.rows).toHaveLength(1)
  expect(doVizinho.rows[0]?.account_id).toBe(outraContaId)

  await banco.comoAnonimo()
  expect((await banco.sql.query('select id from public.rehearsals')).rows).toHaveLength(0)
})

test('ninguém escreve pelo cliente: quem escreve é a borda', async () => {
  const { call_id } = await abrir()
  await banco.comoUsuario(donoId)

  const insercao = await recusa(() =>
    banco.sql.query(
      `insert into public.rehearsals (account_id, call_id, agent_publication_id, mode)
       values ($1, $2, $3, 'text')`,
      [contaId, call_id, publicacaoDe(contaId)],
    ),
  )
  expect(insercao).toMatch(/row-level security|policy/i)
})

test('só o servidor abre e encerra ensaio', async () => {
  await banco.comoUsuario(donoId)

  const abertura = await recusa(() =>
    banco.sql.query(
      `select public.abrir_ensaio($1, 'discovery', 'text', '{}'::jsonb, $2, $3, null)`,
      [contaId, donoId, publicacaoDe(contaId)],
    ),
  )
  expect(abertura).toMatch(/permission denied|não é permitido/i)
})

test('apagar a chamada leva o ensaio junto', async () => {
  const { call_id, rehearsal_id } = await abrir()

  await banco.sql.query('delete from public.calls where id = $1', [call_id])

  const { rows } = await banco.sql.query('select id from public.rehearsals where id = $1', [
    rehearsal_id,
  ])
  expect(rows).toHaveLength(0)
})

test('um ensaio por chamada', async () => {
  const { call_id } = await abrir()
  const erro = await recusa(() =>
    banco.sql.query(
      `insert into public.rehearsals (account_id, call_id, agent_publication_id, mode)
       values ($1, $2, $3, 'voice')`,
      [contaId, call_id, publicacaoDe(contaId)],
    ),
  )
  // A sessão é de serviço aqui, que passa por cima da RLS: o que recusa é o
  // único, e é ele que este teste mede.
  expect(erro).toMatch(/rehearsals_um_por_chamada|duplicate key/i)
})

test('calls.direction aceita saída, entrada e ensaio', async () => {
  // O ensaio é uma chamada como as outras: se o check da F2 não aceitasse
  // `rehearsal`, a migração o trocaria, e é isto que prova a troca.
  for (const direcao of ['outbound', 'inbound', 'rehearsal']) {
    expect(await recusa(() => chamada(direcao)), direcao).toBeNull()
  }
  expect(await recusa(() => chamada('telepatia'))).toMatch(/violates check/i)
})

test('o gatilho recusa ensaio pendurado em chamada real', async () => {
  const saida = await chamada('outbound')
  const erro = await recusa(() =>
    banco.sql.query(
      `insert into public.rehearsals (account_id, call_id, agent_publication_id, mode)
       values ($1, $2, $3, 'text')`,
      [contaId, saida, publicacaoDe(contaId)],
    ),
  )
  expect(erro).toMatch(/Ensaio só se pendura em chamada de ensaio: esta chamada é outbound/)
})

test('o gatilho recusa a chamada de outra conta', async () => {
  const daVizinha = await chamada('rehearsal', outraContaId)
  const erro = await recusa(() =>
    banco.sql.query(
      `insert into public.rehearsals (account_id, call_id, agent_publication_id, mode)
       values ($1, $2, $3, 'text')`,
      [contaId, daVizinha, publicacaoDe(contaId)],
    ),
  )
  expect(erro).toMatch(/O ensaio e a chamada são de contas diferentes/)
})

test('não existe ensaio sem publicação', async () => {
  // Coluna nula aqui seria a porta pela qual um segundo tempo de execução
  // voltaria (T-16): o ensaio que não aponta para o agente publicado ensaiou
  // outra coisa. A recusa vem do gatilho, em português, antes do not null.
  const erro = await recusa(() =>
    banco.sql.query(
      `select public.abrir_ensaio($1, 'discovery', 'text', '{}'::jsonb, $2, null, null)`,
      [contaId, donoId],
    ),
  )
  expect(erro).toMatch(/Não existe ensaio sem publicação/)

  const { rows } = await banco.sql.query<{ is_nullable: string }>(
    `select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'rehearsals'
        and column_name = 'agent_publication_id'`,
  )
  expect(rows[0]?.is_nullable).toBe('NO')
})

test('o gatilho recusa a publicação de outra conta e a de outro propósito', async () => {
  const daVizinha = await recusa(() =>
    banco.sql.query(
      `select public.abrir_ensaio($1, 'discovery', 'text', '{}'::jsonb, $2, $3, null)`,
      [contaId, donoId, publicacaoDe(outraContaId)],
    ),
  )
  expect(daVizinha).toMatch(/O ensaio e a publicação são de contas diferentes/)

  const deOutroProposito = await recusa(() =>
    banco.sql.query(
      `select public.abrir_ensaio($1, 'discovery', 'text', '{}'::jsonb, $2, $3, null)`,
      [contaId, donoId, publicacaoDeLembreteId],
    ),
  )
  expect(deOutroProposito).toMatch(/A publicação é de reminder, e a chamada do ensaio é de discovery/)
})

test('apagar a publicação ensaiada é recusado; apagar a conta leva tudo', async () => {
  await abrir()
  const erro = await recusa(() =>
    banco.sql.query('delete from public.agent_publications where id = $1', [publicacaoDe(contaId)]),
  )
  expect(erro).toMatch(/rehearsals_agent_publication_id_fkey|foreign key/i)

  // A conta é filha de ninguém: a cascata leva a publicação e o ensaio no
  // mesmo comando, e a chave adiada só confere no fim.
  const { rows: contas } = await banco.sql.query<{ id: string }>(
    "insert into public.accounts (name) values ('Conta de passagem') returning id",
  )
  const passagem = contas[0]!.id
  const { rows: agentes } = await banco.sql.query<{ id: string }>(
    "insert into public.agents (account_id, name, company_name) values ($1, 'Sarah', 'Passagem') returning id",
    [passagem],
  )
  const { rows: pubs } = await banco.sql.query<{ id: string }>(
    `insert into public.agent_publications (account_id, agent_id, purpose)
     values ($1, $2, 'discovery') returning id`,
    [passagem, agentes[0]!.id],
  )
  await banco.sql.query(
    `select public.abrir_ensaio($1, 'discovery', 'text', '{}'::jsonb, null, $2, null)`,
    [passagem, pubs[0]!.id],
  )

  expect(
    await recusa(() => banco.sql.query('delete from public.accounts where id = $1', [passagem])),
  ).toBeNull()
  const { rows } = await banco.sql.query('select id from public.rehearsals where account_id = $1', [
    passagem,
  ])
  expect(rows).toHaveLength(0)
})

test('classe Servidor: só há política de leitura, e a tabela diz de onde vem a transcrição', async () => {
  const { rows: politicas } = await banco.sql.query<{ cmd: string }>(
    "select cmd from pg_policies where schemaname = 'public' and tablename = 'rehearsals'",
  )
  expect(politicas.map((p) => p.cmd)).toEqual(['SELECT'])

  const { rows } = await banco.sql.query<{ comentario: string }>(
    "select obj_description('public.rehearsals'::regclass, 'pg_class') as comentario",
  )
  expect(rows[0]?.comentario).toMatch(/transcrição não se duplica aqui: vem de calls/)
})

// O ciclo de evolução no banco (US-245).
//
// O que este arquivo prova:
//
// 1. Classe Servidor: membro lê as três tabelas, e ninguém escreve pelo
//    cliente — nem o dono da conta. Conta vizinha e sessão anônima veem zero.
// 2. Uma revisão aberta por chamada. Encerrada não conta: revisar de novo
//    depois de aplicar é o laço que o produto quer.
// 3. A forma de cada tipo de proposta. O que se aplica tem texto e não tem
//    caminho; o que não se aplica tem caminho e ação e não tem texto. É a
//    regra do produto virada check, e não convenção que se esquece.
// 4. O que foi recusado não se aplica, e encaminhamento não ganha versão.
// 5. Estado que declara instante precisa do instante, e proposta sem resposta
//    do dono não chega a `proposed`.
// 6. `somar_revisao_da_mudanca` soma e carimba numa escrita só, e só
//    `service_role` a executa.
// 7. Apagar a chamada leva a revisão, as perguntas e as propostas junto.
//
// Referência: migração 20260924100000_revisao_de_chamada.sql,
// supabase/functions/call-review/revisao.ts, docs/PRD-implementacao.md 3.9.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let adminId: string
let operadorId: string
let outraContaId: string
let outroAdminId: string
let chamadaId: string
let sequencia = 0

const ROTEIRO = '1. Cumprimente.\n2. Pergunte sobre a frota.'

async function criarConta(nome: string, email: string): Promise<{ id: string; adminId: string }> {
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
  return { id, adminId: usuarioId }
}

async function criarChamada(conta: string, colunas: Record<string, unknown> = {}): Promise<string> {
  sequencia += 1
  const linha: Record<string, unknown> = {
    account_id: conta,
    purpose: 'discovery',
    direction: 'outbound',
    idempotency_key: `manual:revisao:${sequencia}`,
    status: 'ended',
    end_reason: 'completed',
    duration_sec: 163,
    ...colunas,
  }
  const nomes = Object.keys(linha)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (${nomes.join(', ')})
     values (${nomes.map((_, i) => `$${i + 1}`).join(', ')})
     returning id`,
    nomes.map((nome) => linha[nome]),
  )
  return rows[0]!.id
}

async function criarRevisao(colunas: Record<string, unknown> = {}): Promise<string> {
  const linha: Record<string, unknown> = {
    account_id: contaId,
    call_id: chamadaId,
    purpose: 'discovery',
    created_by: adminId,
    ...colunas,
  }
  const nomes = Object.keys(linha)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.call_reviews (${nomes.join(', ')})
     values (${nomes.map((_, i) => `$${i + 1}`).join(', ')})
     returning id`,
    nomes.map((nome) => linha[nome]),
  )
  return rows[0]!.id
}

async function criarMudanca(revisaoId: string, colunas: Record<string, unknown> = {}): Promise<string> {
  const linha: Record<string, unknown> = {
    account_id: contaId,
    review_id: revisaoId,
    position: 1,
    kind: 'script',
    title: 'Abrir dizendo de onde fala',
    rationale: 'O lead pediu para repetir.',
    body: ROTEIRO,
    ...colunas,
  }
  const nomes = Object.keys(linha)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.call_review_changes (${nomes.join(', ')})
     values (${nomes.map((_, i) => `$${i + 1}`).join(', ')})
     returning id`,
    nomes.map((nome) => linha[nome]),
  )
  return rows[0]!.id
}

/** O erro que o banco levantou, ou null quando a escrita passou. */
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

  const a = await criarConta('Fretes do Vale', 'admin@fretes.test')
  contaId = a.id
  adminId = a.adminId

  operadorId = await banco.criarUsuario('operador@fretes.test', 'Operador')
  await banco.sql.query(
    'insert into public.account_members (account_id, user_id, role) values ($1, $2, $3)',
    [contaId, operadorId, 'operator'],
  )

  const b = await criarConta('Metalúrgica Sul', 'admin@metal.test')
  outraContaId = b.id
  outroAdminId = b.adminId

  chamadaId = await criarChamada(contaId)
}, 120_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.call_reviews where account_id = any($1)', [
    [contaId, outraContaId],
  ])
})

// Isolamento -----------------------------------------------------------------------

test('membro lê as três tabelas; a conta vizinha e o anônimo não veem nada', async () => {
  const revisaoId = await criarRevisao({ status: 'questions' })
  await banco.sql.query(
    `insert into public.call_review_questions (account_id, review_id, position, question, why)
     values ($1, $2, 1, $3, $4)`,
    [contaId, revisaoId, 'Há faixa de preço pública?', 'O lead perguntou o preço.'],
  )
  await criarMudanca(revisaoId)

  await banco.comoUsuario(operadorId)
  const doOperador = await banco.sql.query('select id from public.call_reviews')
  const perguntas = await banco.sql.query('select id from public.call_review_questions')
  const mudancas = await banco.sql.query('select id from public.call_review_changes')
  // Operador lê: a revisão explica por que o roteiro mudou, e isso não é
  // segredo de administrador.
  expect(doOperador.rows).toHaveLength(1)
  expect(perguntas.rows).toHaveLength(1)
  expect(mudancas.rows).toHaveLength(1)

  await banco.comoUsuario(outroAdminId)
  expect((await banco.sql.query('select id from public.call_reviews')).rows).toHaveLength(0)
  expect((await banco.sql.query('select id from public.call_review_questions')).rows).toHaveLength(0)
  expect((await banco.sql.query('select id from public.call_review_changes')).rows).toHaveLength(0)

  await banco.comoAnonimo()
  expect((await banco.sql.query('select id from public.call_reviews')).rows).toHaveLength(0)
  expect((await banco.sql.query('select id from public.call_review_changes')).rows).toHaveLength(0)
})

test('nem o dono escreve pelo cliente: quem escreve é a borda', async () => {
  const revisaoId = await criarRevisao()
  await banco.comoUsuario(adminId)

  // Proposta forjada com body próprio e depois aceita seria texto na boca da
  // Sarah por um caminho que ninguém revisa. Não há política de escrita.
  const insercao = await recusa(() =>
    banco.sql.query(
      `insert into public.call_review_changes (account_id, review_id, position, kind, title, rationale, body)
       values ($1, $2, 9, 'script', 'Forjada', 'Porque sim', 'Diga o preço que eu quiser.')`,
      [contaId, revisaoId],
    ),
  )
  expect(insercao).toMatch(/row-level security|policy/i)

  const decisao = await banco.sql.query(
    "update public.call_reviews set status = 'applied' where id = $1",
    [revisaoId],
  )
  // Update sem política não levanta: não alcança linha nenhuma.
  expect(decisao.rows).toHaveLength(0)
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ status: string }>(
    'select status from public.call_reviews where id = $1',
    [revisaoId],
  )
  expect(rows[0]?.status).toBe('questions')
})

// Uma aberta por chamada -----------------------------------------------------------

test('uma revisão aberta por chamada; encerrada libera a próxima', async () => {
  await criarRevisao({ status: 'questions' })

  const segunda = await recusa(() => criarRevisao({ status: 'questions' }))
  expect(segunda).toMatch(/call_reviews_uma_aberta|duplicate key/i)

  // Proposta também conta como aberta.
  await banco.sql.query(
    "update public.call_reviews set answered_at = now(), status = 'proposed' where call_id = $1",
    [chamadaId],
  )
  const terceira = await recusa(() => criarRevisao({ status: 'questions' }))
  expect(terceira).toMatch(/call_reviews_uma_aberta|duplicate key/i)

  // Encerrar libera: revisar de novo depois de aplicar é o laço do produto.
  await banco.sql.query(
    "update public.call_reviews set status = 'applied', applied_at = now() where call_id = $1",
    [chamadaId],
  )
  await expect(criarRevisao({ status: 'questions' })).resolves.toMatch(/^[0-9a-f-]{36}$/)
})

// A forma de cada tipo -------------------------------------------------------------

test('o que se aplica tem texto e não tem caminho', async () => {
  const revisaoId = await criarRevisao()

  const semTexto = await recusa(() => criarMudanca(revisaoId, { kind: 'script', body: null }))
  expect(semTexto).toMatch(/call_review_changes_forma_do_tipo/)

  const vazio = await recusa(() => criarMudanca(revisaoId, { kind: 'script', body: '   ' }))
  expect(vazio).toMatch(/call_review_changes_forma_do_tipo/)

  const comCaminho = await recusa(() =>
    criarMudanca(revisaoId, { kind: 'script', body: ROTEIRO, path: '/sarah/voz' }),
  )
  expect(comCaminho).toMatch(/call_review_changes_forma_do_tipo/)

  // `house` vazio é apagar o jeito da casa, que é mudança legítima.
  await expect(
    criarMudanca(revisaoId, { position: 2, kind: 'house', body: '' }),
  ).resolves.toMatch(/^[0-9a-f-]{36}$/)
})

test('o que não se aplica tem caminho e ação, e não tem texto', async () => {
  const revisaoId = await criarRevisao()

  const semCaminho = await recusa(() =>
    criarMudanca(revisaoId, { kind: 'voice', body: null, path_action: 'Troque a voz.' }),
  )
  expect(semCaminho).toMatch(/call_review_changes_forma_do_tipo/)

  const semAcao = await recusa(() =>
    criarMudanca(revisaoId, { kind: 'voice', body: null, path: '/sarah/voz' }),
  )
  expect(semAcao).toMatch(/call_review_changes_forma_do_tipo/)

  const comTexto = await recusa(() =>
    criarMudanca(revisaoId, {
      kind: 'voice',
      body: ROTEIRO,
      path: '/sarah/voz',
      path_action: 'Troque a voz.',
    }),
  )
  expect(comTexto).toMatch(/call_review_changes_forma_do_tipo/)

  // Caminho absoluto não passa: endereço absoluto envelhece com o domínio.
  const absoluto = await recusa(() =>
    criarMudanca(revisaoId, {
      kind: 'voice',
      body: null,
      path: 'sarah/voz',
      path_action: 'Troque a voz.',
    }),
  )
  expect(absoluto).toMatch(/call_review_changes_path_check|violates check/i)

  await expect(
    criarMudanca(revisaoId, {
      kind: 'voice',
      body: null,
      path: '/sarah/voz',
      path_action: 'Ouça as prévias e troque a voz.',
    }),
  ).resolves.toMatch(/^[0-9a-f-]{36}$/)
})

test('recusada não se aplica, e encaminhamento não ganha versão', async () => {
  const revisaoId = await criarRevisao()
  const mudancaId = await criarMudanca(revisaoId)

  const recusadaAplicada = await recusa(() =>
    banco.sql.query(
      `update public.call_review_changes
          set decision = 'rejected', decided_at = now(), applied_at = now()
        where id = $1`,
      [mudancaId],
    ),
  )
  expect(recusadaAplicada).toMatch(/call_review_changes_recusada_nao_aplica|aplicada_tem_data/)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.playbook_versions (account_id, playbook_id, body_script, status)
     select $1, id, $2, 'draft' from public.playbooks
      where account_id = $1 and purpose = 'discovery' returning id`,
    [contaId, ROTEIRO],
  )
  const versaoId = rows[0]!.id

  const encaminhamentoId = await criarMudanca(revisaoId, {
    position: 2,
    kind: 'knowledge',
    body: null,
    path: '/sarah/conhecimento',
    path_action: 'Cadastre a faixa de preço.',
  })
  const encaminhamentoComVersao = await recusa(() =>
    banco.sql.query(
      'update public.call_review_changes set applied_version_id = $1, applied_at = now() where id = $2',
      [versaoId, encaminhamentoId],
    ),
  )
  // O ciclo dizendo que fez o que só ensinou a fazer.
  expect(encaminhamentoComVersao).toMatch(/call_review_changes_so_aplicavel_aplica/)
})

// Os estados -----------------------------------------------------------------------

test('estado que declara instante precisa do instante', async () => {
  const semData = await recusa(() => criarRevisao({ status: 'applied', answered_at: new Date().toISOString() }))
  expect(semData).toMatch(/call_reviews_aplicada_tem_data/)

  const descartadaSemData = await recusa(() => criarRevisao({ status: 'discarded' }))
  expect(descartadaSemData).toMatch(/call_reviews_descartada_tem_data/)
})

test('proposta sem resposta do dono não existe', async () => {
  // O modelo escreve a proposta com o que o dono contou; sem questionário
  // respondido, a proposta é escrita no vácuo.
  const semRespostas = await recusa(() => criarRevisao({ status: 'proposed' }))
  expect(semRespostas).toMatch(/call_reviews_proposta_tem_respostas/)

  await expect(
    criarRevisao({ status: 'proposed', answered_at: new Date().toISOString() }),
  ).resolves.toMatch(/^[0-9a-f-]{36}$/)
})

test('resposta e data do questionário andam juntas', async () => {
  const revisaoId = await criarRevisao()
  const semData = await recusa(() =>
    banco.sql.query(
      `insert into public.call_review_questions (account_id, review_id, position, question, why, answer)
       values ($1, $2, 1, 'Há faixa pública?', 'O lead perguntou.', 'Não')`,
      [contaId, revisaoId],
    ),
  )
  expect(semData).toMatch(/call_review_questions_resposta_tem_data/)
})

test('escolha sem opção não existe', async () => {
  const revisaoId = await criarRevisao()
  const semOpcoes = await recusa(() =>
    banco.sql.query(
      `insert into public.call_review_questions (account_id, review_id, position, question, why, kind)
       values ($1, $2, 1, 'Qual das duas?', 'O lead perguntou.', 'choice')`,
      [contaId, revisaoId],
    ),
  )
  expect(semOpcoes).toMatch(/call_review_questions_escolha_tem_opcoes/)
})

// A RPC do contador ----------------------------------------------------------------

test('somar_revisao_da_mudanca soma e carimba numa escrita só', async () => {
  const revisaoId = await criarRevisao()
  const mudancaId = await criarMudanca(revisaoId)

  const primeira = await banco.sql.query<{ somar_revisao_da_mudanca: number }>(
    'select public.somar_revisao_da_mudanca($1)',
    [mudancaId],
  )
  expect(primeira.rows[0]?.somar_revisao_da_mudanca).toBe(1)

  await banco.sql.query('select public.somar_revisao_da_mudanca($1)', [mudancaId])

  const { rows } = await banco.sql.query<{ revisions: number; revised_at: string | null }>(
    'select revisions, revised_at from public.call_review_changes where id = $1',
    [mudancaId],
  )
  expect(rows[0]?.revisions).toBe(2)
  // O check amarra os dois: contador acima de zero sem data seria uma
  // reescrita que ninguém sabe quando foi.
  expect(rows[0]?.revised_at).not.toBeNull()
})

test('só o servidor soma reescrita', async () => {
  const revisaoId = await criarRevisao()
  const mudancaId = await criarMudanca(revisaoId)

  await banco.comoUsuario(adminId)
  const doCliente = await recusa(() =>
    banco.sql.query('select public.somar_revisao_da_mudanca($1)', [mudancaId]),
  )
  expect(doCliente).toMatch(/permission denied|não é permitido/i)
})

// Cascata --------------------------------------------------------------------------

test('apagar a chamada leva a revisão, as perguntas e as propostas', async () => {
  const descartavelId = await criarChamada(contaId)
  const revisaoId = await criarRevisao({ call_id: descartavelId })
  await banco.sql.query(
    `insert into public.call_review_questions (account_id, review_id, position, question, why)
     values ($1, $2, 1, 'Há faixa pública?', 'O lead perguntou.')`,
    [contaId, revisaoId],
  )
  await criarMudanca(revisaoId)

  await banco.sql.query('delete from public.calls where id = $1', [descartavelId])

  const revisoes = await banco.sql.query('select id from public.call_reviews where id = $1', [revisaoId])
  const perguntas = await banco.sql.query('select id from public.call_review_questions where review_id = $1', [revisaoId])
  const mudancas = await banco.sql.query('select id from public.call_review_changes where review_id = $1', [revisaoId])
  expect(revisoes.rows).toHaveLength(0)
  expect(perguntas.rows).toHaveLength(0)
  expect(mudancas.rows).toHaveLength(0)
})

test('proposta não pode ficar sob a conta errada', async () => {
  const revisaoId = await criarRevisao()
  // A chave composta (review_id, account_id) é quem recusa: duas simples
  // deixariam uma proposta da conta B pendurada numa revisão da conta A.
  const cruzada = await recusa(() =>
    banco.sql.query(
      `insert into public.call_review_changes (account_id, review_id, position, kind, title, rationale, body)
       values ($1, $2, 5, 'script', 'Cruzada', 'Porque sim', $3)`,
      [outraContaId, revisaoId, ROTEIRO],
    ),
  )
  expect(cruzada).toMatch(/call_review_changes_da_revisao_da_conta|violates foreign key/i)
})

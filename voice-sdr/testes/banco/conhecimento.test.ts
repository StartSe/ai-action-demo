// A base de conhecimento da conta (seção 3.4, L-09, RF-310, US-064).
//
// O que este arquivo prova:
//
// 1. Classe Configuração: membro lê, administrador escreve, operador não; a
//    conta vizinha e a sessão anônima recebem zero linha.
// 2. As colunas de sincronização são do servidor: o administrador as escreve e
//    o gatilho descarta, e só os RPCs de knowledge-sync as gravam — que só
//    `service_role` executa.
// 3. `indexed_at` só existe com documento: o check amarra as três colunas.
// 4. Um documento no provedor por entrada, e várias entradas pendentes
//    convivem.
// 5. Entrada indexada não se apaga direto: o cliente marca `removed_at`, e
//    quem apaga é o servidor.
// 6. A trilha registra a edição de verdade e não a sincronização.
//
// Referência: migração 20260923210000_base_de_conhecimento.sql,
// supabase/functions/knowledge-sync/sincronizacao.ts, docs/PRD-implementacao.md
// seções 3.4 e 3.9.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const HASH = 'a'.repeat(64)
const OUTRO_HASH = 'b'.repeat(64)

interface Conta {
  readonly id: string
  readonly adminId: string
  readonly operadorId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id

  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')

  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'admin'), ($1, $3, 'operator')`,
    [id, adminId, operadorId],
  )

  return { id, adminId, operadorId }
}

async function semearEntrada(conta: Conta, pergunta = 'Vocês entregam em Manaus?'): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.knowledge_entries (account_id, question, answer, tags)
     values ($1, $2, 'Sim, em até cinco dias úteis.', '{entrega}')
     returning id`,
    [conta.id, pergunta],
  )
  return rows[0]!.id
}

/** O que knowledge-sync faz depois do 2xx, pela chave de serviço. */
async function indexar(id: string, documento: string, hash = HASH): Promise<boolean> {
  await banco.comoServico()
  await banco.sql.query('set role service_role')
  try {
    const { rows } = await banco.sql.query<{ achou: boolean }>(
      'select public.marcar_conhecimento_indexado($1, $2, $3) as achou',
      [id, documento, hash],
    )
    return rows[0]!.achou
  } finally {
    await banco.comoServico()
  }
}

interface Sincronizacao {
  provider_doc_id: string | null
  indexed_at: string | null
  indexed_hash: string | null
  sync_error: string | null
}

async function lerSincronizacao(id: string): Promise<Sincronizacao | undefined> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<Sincronizacao>(
    `select provider_doc_id, indexed_at, indexed_hash, sync_error
       from public.knowledge_entries where id = $1`,
    [id],
  )
  return rows[0]
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// O único faz o resíduo do teste anterior derrubar o insert seguinte pela
// restrição errada.
beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.knowledge_entries')
  await banco.sql.query('delete from public.audit_log')
})

// A forma ------------------------------------------------------------------------

test('a entrada nasce pendente, com etiquetas vazias e origem manual', async () => {
  const { rows } = await banco.sql.query<{
    tags: string[]
    source: string
    provider_doc_id: string | null
    indexed_at: string | null
    removed_at: string | null
  }>(
    `insert into public.knowledge_entries (account_id, question, answer)
     values ($1, 'Qual o prazo?', 'Cinco dias.')
     returning tags, source, provider_doc_id, indexed_at, removed_at`,
    [contaA.id],
  )
  expect(rows[0]).toEqual({ tags: [], source: 'manual', provider_doc_id: null, indexed_at: null, removed_at: null })
})

test.each([
  ['pergunta em branco', "'  '", "'Resposta.'"],
  ['resposta em branco', "'Pergunta?'", "''"],
])('%s é recusada', async (_caso, pergunta, resposta) => {
  await expect(
    banco.sql.query(
      `insert into public.knowledge_entries (account_id, question, answer)
       values ($1, ${pergunta}, ${resposta})`,
      [contaA.id],
    ),
  ).rejects.toThrow(/violates check constraint/i)
})

test('indexed_at sem documento é recusado, mesmo por quem tem o portão', async () => {
  const id = await semearEntrada(contaA)

  // O portão é o do RPC; aqui ele é levantado à mão para medir o check, que é
  // a rede embaixo de um RPC que um dia errasse a ordem.
  await banco.sql.query(`select set_config('app.conhecimento_sincronizacao', 'on', false)`)
  try {
    await expect(
      banco.sql.query('update public.knowledge_entries set indexed_at = now() where id = $1', [id]),
    ).rejects.toThrow(/knowledge_entries_indexada_com_documento/)
    await expect(
      banco.sql.query(
        `update public.knowledge_entries set provider_doc_id = 'doc-1', indexed_at = now() where id = $1`,
        [id],
      ),
    ).rejects.toThrow(/knowledge_entries_indexada_com_documento/)
  } finally {
    await banco.sql.query(`select set_config('app.conhecimento_sincronizacao', '', false)`)
  }
})

test('o código de erro fica em vocabulário de máquina', async () => {
  const id = await semearEntrada(contaA)

  await banco.sql.query(`select set_config('app.conhecimento_sincronizacao', 'on', false)`)
  try {
    await expect(
      banco.sql.query(`update public.knowledge_entries set sync_error = 'O provedor recusou' where id = $1`, [id]),
    ).rejects.toThrow(/knowledge_entries_sync_error_check/)
  } finally {
    await banco.sql.query(`select set_config('app.conhecimento_sincronizacao', '', false)`)
  }
})

// O único ----------------------------------------------------------------------------

test('um documento por entrada: o mesmo documento em duas entradas da conta é recusado', async () => {
  const primeira = await semearEntrada(contaA, 'Primeira?')
  const segunda = await semearEntrada(contaA, 'Segunda?')

  expect(await indexar(primeira, 'doc-repetido')).toBe(true)
  await expect(indexar(segunda, 'doc-repetido')).rejects.toThrow(/knowledge_entries_um_documento/)
})

test('várias entradas pendentes convivem, e o índice é parcial', async () => {
  await semearEntrada(contaA, 'Primeira?')
  await semearEntrada(contaA, 'Segunda?')

  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select indexdef as definicao from pg_indexes
      where schemaname = 'public' and indexname = 'knowledge_entries_um_documento'`,
  )
  expect(rows[0]?.definicao).toMatch(/UNIQUE/)
  expect(rows[0]?.definicao).toMatch(/\(account_id, provider_doc_id\)/)
  expect(rows[0]?.definicao).toMatch(/WHERE \(provider_doc_id IS NOT NULL\)/i)
})

test('o mesmo identificador de documento na vizinha não colide', async () => {
  const naA = await semearEntrada(contaA)
  const naB = await semearEntrada(contaB)

  expect(await indexar(naA, 'doc-7')).toBe(true)
  expect(await indexar(naB, 'doc-7')).toBe(true)
})

// A sincronização é do servidor ----------------------------------------------------------

test('o administrador não escreve as colunas de sincronização, e a edição dele vale', async () => {
  const id = await semearEntrada(contaA)
  await indexar(id, 'doc-original')

  await banco.comoUsuario(contaA.adminId)
  await banco.sql.query(
    `update public.knowledge_entries
        set answer = 'Sim, em até três dias úteis.',
            provider_doc_id = 'doc-de-outra-conta',
            indexed_at = null,
            indexed_hash = $2,
            sync_error = 'envio_recusado'
      where id = $1`,
    [id, OUTRO_HASH],
  )

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ answer: string }>(
    'select answer from public.knowledge_entries where id = $1',
    [id],
  )
  // Apontar para o documento de outra conta faria a remoção seguinte apagá-lo
  // lá fora, com a credencial da plataforma que as contas dividem.
  expect(rows[0]?.answer).toBe('Sim, em até três dias úteis.')
  expect(await lerSincronizacao(id)).toMatchObject({
    provider_doc_id: 'doc-original',
    indexed_hash: HASH,
    sync_error: null,
  })
  expect((await lerSincronizacao(id))?.indexed_at).not.toBeNull()
})

test('o insert do cliente nasce pendente, mesmo mandando um documento', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.knowledge_entries (account_id, question, answer, provider_doc_id, indexed_at, indexed_hash)
     values ($1, 'Pergunta?', 'Resposta.', 'doc-inventado', now(), $2)
     returning id`,
    [contaA.id, HASH],
  )

  expect(await lerSincronizacao(rows[0]!.id)).toEqual({
    provider_doc_id: null,
    indexed_at: null,
    indexed_hash: null,
    sync_error: null,
  })
})

test('o RPC grava documento, hash e indexed_at, e derruba o portão antes de devolver', async () => {
  const id = await semearEntrada(contaA)

  await banco.comoServico()
  await banco.sql.query('set role service_role')
  try {
    await banco.sql.query('begin')
    await banco.sql.query('select public.marcar_conhecimento_indexado($1, $2, $3)', [id, 'doc-1', HASH])
    // Um update comum na mesma transação não pode aproveitar a trava aberta.
    await banco.sql.query(`update public.knowledge_entries set provider_doc_id = 'doc-forjado' where id = $1`, [id])
    await banco.sql.query('commit')
  } finally {
    await banco.comoServico()
  }

  const lido = await lerSincronizacao(id)
  expect(lido).toMatchObject({ provider_doc_id: 'doc-1', indexed_hash: HASH, sync_error: null })
  expect(lido?.indexed_at).not.toBeNull()
})

test('marcar erro não mexe no documento que já está lá', async () => {
  const id = await semearEntrada(contaA)
  await indexar(id, 'doc-1')

  await banco.sql.query('set role service_role')
  try {
    await banco.sql.query(`select public.marcar_erro_do_conhecimento($1, 'remocao_recusada')`, [id])
  } finally {
    await banco.comoServico()
  }

  expect(await lerSincronizacao(id)).toMatchObject({ provider_doc_id: 'doc-1', sync_error: 'remocao_recusada' })
})

test('desindexar volta a entrada a pendente', async () => {
  const id = await semearEntrada(contaA)
  await indexar(id, 'doc-1')

  await banco.sql.query('set role service_role')
  try {
    await banco.sql.query('select public.marcar_conhecimento_desindexado($1)', [id])
  } finally {
    await banco.comoServico()
  }

  expect(await lerSincronizacao(id)).toEqual({
    provider_doc_id: null,
    indexed_at: null,
    indexed_hash: null,
    sync_error: null,
  })
})

test('marcar entrada que já não existe devolve falso, sem erro', async () => {
  expect(await indexar('00000000-0000-4000-8000-000000000000', 'doc-1')).toBe(false)
})

test('os RPCs de sincronização são só de service_role', async () => {
  const { rows } = await banco.sql.query<{ rotina: string; papel: string }>(
    `select routine_name as rotina, grantee as papel
       from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name in ('marcar_conhecimento_indexado', 'marcar_conhecimento_desindexado', 'marcar_erro_do_conhecimento')
        and privilege_type = 'EXECUTE'
        and grantee <> 'postgres'
      order by routine_name, grantee`,
  )
  expect(rows).toEqual([
    { rotina: 'marcar_conhecimento_desindexado', papel: 'service_role' },
    { rotina: 'marcar_conhecimento_indexado', papel: 'service_role' },
    { rotina: 'marcar_erro_do_conhecimento', papel: 'service_role' },
  ])

  const id = await semearEntrada(contaA)
  await banco.comoUsuario(contaA.adminId)
  await expect(
    banco.sql.query('select public.marcar_conhecimento_indexado($1, $2, $3)', [id, 'doc-1', HASH]),
  ).rejects.toThrow(/permission denied/i)
})

// Remoção ---------------------------------------------------------------------------------

test('a entrada indexada não se apaga direto: o administrador a marca', async () => {
  const id = await semearEntrada(contaA)
  await indexar(id, 'doc-1')

  await banco.comoUsuario(contaA.adminId)
  const { rows: apagadas } = await banco.sql.query(
    'delete from public.knowledge_entries where id = $1 returning id',
    [id],
  )
  // Apagada, ela levaria o único ponteiro para o documento que continuaria lá.
  expect(apagadas).toEqual([])

  const { rows: marcadas } = await banco.sql.query(
    'update public.knowledge_entries set removed_at = now() where id = $1 returning id',
    [id],
  )
  expect(marcadas).toHaveLength(1)
})

test('a entrada que nunca chegou ao provedor se apaga direto', async () => {
  const id = await semearEntrada(contaA)

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query(
    'delete from public.knowledge_entries where id = $1 returning id',
    [id],
  )
  expect(rows).toHaveLength(1)
})

test('o servidor apaga a entrada marcada', async () => {
  const id = await semearEntrada(contaA)
  await indexar(id, 'doc-1')

  await banco.sql.query('set role service_role')
  try {
    const { rows } = await banco.sql.query(
      'delete from public.knowledge_entries where id = $1 and removed_at is not null returning id',
      [id],
    )
    // Desmarcada, ela fica: é o filtro que o adaptador usa.
    expect(rows).toEqual([])
    await banco.sql.query('update public.knowledge_entries set removed_at = now() where id = $1', [id])
    const { rows: apagadas } = await banco.sql.query(
      'delete from public.knowledge_entries where id = $1 and removed_at is not null returning id',
      [id],
    )
    expect(apagadas).toHaveLength(1)
  } finally {
    await banco.comoServico()
  }
})

// Isolamento -------------------------------------------------------------------------------

test('o administrador escreve e o operador não', async () => {
  await banco.comoUsuario(contaA.operadorId)
  await expect(
    banco.sql.query(
      `insert into public.knowledge_entries (account_id, question, answer) values ($1, 'P?', 'R.')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query(
    `insert into public.knowledge_entries (account_id, question, answer) values ($1, 'P?', 'R.') returning id`,
    [contaA.id],
  )
  expect(rows).toHaveLength(1)
})

test('o operador lê a base e não muda, não marca nem apaga', async () => {
  const id = await semearEntrada(contaA)

  await banco.comoUsuario(contaA.operadorId)
  const { rows: lidas } = await banco.sql.query('select id from public.knowledge_entries where id = $1', [id])
  expect(lidas).toHaveLength(1)

  const { rows: alteradas } = await banco.sql.query(
    `update public.knowledge_entries set answer = 'outra', removed_at = now() where id = $1 returning id`,
    [id],
  )
  expect(alteradas).toEqual([])

  const { rows: apagadas } = await banco.sql.query(
    'delete from public.knowledge_entries where id = $1 returning id',
    [id],
  )
  expect(apagadas).toEqual([])
})

test('a conta vizinha recebe zero linha, e o anônimo também', async () => {
  await semearEntrada(contaA)
  await semearEntrada(contaB)

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.knowledge_entries',
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.account_id).toBe(contaA.id)

  await banco.comoUsuario(contaB.operadorId)
  const { rows: daVizinha } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.knowledge_entries',
  )
  expect(daVizinha.map((linha) => linha.account_id)).toEqual([contaB.id])

  await banco.comoAnonimo()
  const { rows: semNada } = await banco.sql.query('select id from public.knowledge_entries')
  expect(semNada).toEqual([])
})

test('as quatro políticas levam comentário e são to authenticated', async () => {
  const { rows } = await banco.sql.query<{ comando: string; papeis: string[]; comentario: string | null }>(
    `select p.cmd as comando, p.roles as papeis,
            obj_description(pol.oid, 'pg_policy') as comentario
       from pg_policies as p
       join pg_policy as pol on pol.polname = p.policyname
      where p.schemaname = 'public' and p.tablename = 'knowledge_entries'
      order by p.cmd`,
  )
  expect(rows.map((linha) => linha.comando)).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
  for (const linha of rows) {
    expect(linha.papeis).toEqual(['authenticated'])
    expect(linha.comentario).toMatch(/Classe Configuração/)
  }
})

// Auditoria -------------------------------------------------------------------------------

test('a edição de verdade entra na trilha, e a sincronização não', async () => {
  const id = await semearEntrada(contaA)

  await indexar(id, 'doc-1')
  await banco.sql.query('set role service_role')
  try {
    await banco.sql.query(`select public.marcar_erro_do_conhecimento($1, 'envio_recusado')`, [id])
    await banco.sql.query('select public.marcar_conhecimento_desindexado($1)', [id])
  } finally {
    await banco.comoServico()
  }
  await indexar(id, 'doc-2', OUTRO_HASH)

  const { rows: semRuido } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.audit_log where target_id = $1',
    [id],
  )
  // Quatro escritas do servidor e nenhuma linha: sem tirar as colunas da
  // comparação, cada passagem afogaria a edição de verdade.
  expect(semRuido[0]?.total).toBe(0)

  await banco.comoUsuario(contaA.adminId)
  await banco.sql.query(`update public.knowledge_entries set answer = 'Três dias.' where id = $1`, [id])
  await banco.sql.query('update public.knowledge_entries set removed_at = now() where id = $1', [id])

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ payload: { campos?: string[] } }>(
    `select payload from public.audit_log where target_id = $1 and action = 'update'`,
    [id],
  )
  const campos = rows.map((linha) => linha.payload.campos).sort()
  expect(campos).toEqual([['answer'], ['removed_at']])
})

test('apagar a entrada entra na trilha', async () => {
  const id = await semearEntrada(contaA)

  await banco.comoUsuario(contaA.adminId)
  await banco.sql.query('delete from public.knowledge_entries where id = $1', [id])

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ action: string; target_type: string }>(
    'select action, target_type from public.audit_log where target_id = $1',
    [id],
  )
  expect(rows).toEqual([{ action: 'delete', target_type: 'knowledge_entries' }])
})

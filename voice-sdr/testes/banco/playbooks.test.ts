// Os playbooks e o histórico de versões deles. O que esta migração precisa
// provar é que "por que a Sarah disse aquilo?" continua respondível meses
// depois, e que responder isso não depende de ninguém ter tomado cuidado:
//
// 1. Os quatro playbooks nascem com a conta, cada um com uma versão draft vazia.
//    Conta nova não chega à tela de playbooks sem lugar onde escrever.
// 2. Um playbook por propósito por conta. O quinto é recusado pelo banco.
// 3. O número da versão é do banco. Inserções que se atravessam na mesma sessão
//    não criam duas versões 3, e o número que o cliente manda é descartado.
// 4. Uma versão publicada por playbook. Publicar arquiva a anterior, carimba a
//    data e aponta `current_version_id` — os três na mesma transação.
// 5. `current_version_id` não aponta para versão de outro playbook, e versão não
//    se pendura em playbook de outra conta.
// 6. Classe Configuração: membro lê, administrador escreve, operador não. Conta
//    vizinha e sessão anônima recebem zero linha.
// 7. Publicar entra na trilha com a change_note no payload (RF-008).
//
// Referência: migração 20260921220000_playbooks.sql,
// docs/PRD-implementacao.md seções 3.4 e 3.9, docs/PRD.md RF-008, RF-303 e
// RF-304.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** Os quatro propósitos, os mesmos das publicações do agente (T-01). */
const PROPOSITOS = ['discovery', 'reminder', 'rescue', 'followup'] as const

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

async function playbookDe(conta: Conta, purpose: string): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.playbooks where account_id = $1 and purpose = $2',
    [conta.id, purpose],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`conta sem playbook de ${purpose}`)
  return id
}

/** Insert mínimo: só o que não tem padrão nem gatilho. */
async function semearVersao(
  conta: Conta,
  playbookId: string,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    playbook_id: playbookId,
    ...extras,
  }

  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.playbook_versions (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

/** Cria a versão e a publica, que é o caminho que a tela vai ter. */
async function publicar(
  conta: Conta,
  playbookId: string,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  return semearVersao(conta, playbookId, {
    status: 'published',
    body_script: 'Bom dia, aqui é a Sarah.',
    ...extras,
  })
}

/** Roda a manobra e desfaz tudo o que ela fizer. */
async function descartando(manobra: () => Promise<void>): Promise<void> {
  await banco.sql.query('begin')
  try {
    await manobra()
  } finally {
    // `rollback` antes de trocar de papel, e não depois: a manobra pode ter
    // deixado a transação abortada, e numa transação abortada o `reset role`
    // de `comoServico()` também falha — a conexão sairia daqui envenenada para
    // todos os testes seguintes.
    await banco.sql.query('rollback')
    await banco.comoServico()
  }
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// Os playbooks não se apagam: eles nascem com a conta e morrem com ela. O que
// cada teste precisa é do histórico no estado em que a conta nasceu — versão
// deixada para trás faz o número seguinte não bater, e a mensagem enganaria
// quem fosse ler. Apagar tudo e recriar a versão 1 é mais simples do que
// remendar, e reproduz exatamente o que o gatilho da conta faz.
beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('update public.playbooks set current_version_id = null')
  await banco.sql.query('delete from public.playbook_versions')
  await banco.sql.query(
    `insert into public.playbook_versions (account_id, playbook_id)
     select account_id, id from public.playbooks`,
  )
  await banco.sql.query('delete from public.audit_log')
})

// O nascimento -------------------------------------------------------------------

test('os quatro playbooks nascem com a conta, cada um com uma versão draft vazia', async () => {
  const conta = await criarConta('Metalúrgica Norte', 'norte.test')

  const { rows: playbooks } = await banco.sql.query<{
    purpose: string
    current_version_id: string | null
  }>(
    `select purpose, current_version_id from public.playbooks
      where account_id = $1 order by purpose`,
    [conta.id],
  )

  expect(playbooks.map((linha) => linha.purpose)).toEqual(
    [...PROPOSITOS].sort(),
  )
  // Nenhuma no ar: publicar é ato de gente, e a conta acabou de existir.
  expect(playbooks.every((linha) => linha.current_version_id === null)).toBe(true)

  const { rows: versoes } = await banco.sql.query<{
    version: number
    status: string
    body_script: string
    body_house: string
    change_note: string | null
    author_id: string | null
    published_at: string | null
  }>(
    `select version, status, body_script, body_house, change_note, author_id,
            published_at
       from public.playbook_versions where account_id = $1`,
    [conta.id],
  )

  expect(versoes).toHaveLength(4)
  for (const versao of versoes) {
    expect(versao).toMatchObject({
      version: 1,
      status: 'draft',
      body_script: '',
      body_house: '',
    })
    expect(versao.change_note).toBeNull()
    // Ninguém escreveu esta versão: ela é o lugar onde escrever.
    expect(versao.author_id).toBeNull()
    expect(versao.published_at).toBeNull()
  }
})

test('o quinto playbook da conta é recusado, pelo único e pelo check', async () => {
  await expect(
    banco.sql.query(
      `insert into public.playbooks (account_id, purpose) values ($1, 'discovery')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/playbooks_um_por_proposito/i)

  await expect(
    banco.sql.query(
      `insert into public.playbooks (account_id, purpose) values ($1, 'retomada')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/playbooks_purpose_check/i)
})

// A numeração --------------------------------------------------------------------

test('o número da versão vem do banco, e o que o cliente manda é descartado', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')

  const id = await semearVersao(contaA, playbookId, { version: 99 })

  const { rows } = await banco.sql.query<{ version: number }>(
    'select version from public.playbook_versions where id = $1',
    [id],
  )
  // A versão 1 é a que nasceu com a conta; esta é a 2, e não a 99.
  expect(rows[0]?.version).toBe(2)
})

test('inserções que se atravessam na mesma sessão não repetem o número', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')

  // Três escritas disparadas sem esperar uma pela outra. O banco as serializa, e
  // é justamente isso que o gatilho precisa garantir: cada uma lê o máximo já
  // com a anterior gravada.
  await Promise.all([
    semearVersao(contaA, playbookId, { body_script: 'a' }),
    semearVersao(contaA, playbookId, { body_script: 'b' }),
    semearVersao(contaA, playbookId, { body_script: 'c' }),
  ])

  const { rows } = await banco.sql.query<{ version: number }>(
    `select version from public.playbook_versions
      where playbook_id = $1 order by version`,
    [playbookId],
  )
  expect(rows.map((linha) => linha.version)).toEqual([1, 2, 3, 4])
})

test('o número é por playbook, e não por conta', async () => {
  const descoberta = await playbookDe(contaA, 'discovery')
  const lembrete = await playbookDe(contaA, 'reminder')

  const umaDeCada = await Promise.all([
    semearVersao(contaA, descoberta),
    semearVersao(contaA, lembrete),
  ])

  const { rows } = await banco.sql.query<{ version: number }>(
    'select version from public.playbook_versions where id = any($1)',
    [umaDeCada],
  )
  expect(rows.map((linha) => linha.version)).toEqual([2, 2])
})

// A publicação -------------------------------------------------------------------

test('publicar carimba a data, aponta o playbook e arquiva a anterior', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')

  const primeira = await publicar(contaA, playbookId, {
    change_note: 'primeiro roteiro de descoberta',
  })

  const { rows: apos } = await banco.sql.query<{
    current_version_id: string | null
  }>('select current_version_id from public.playbooks where id = $1', [playbookId])
  expect(apos[0]?.current_version_id).toBe(primeira)

  const { rows: carimbo } = await banco.sql.query<{
    published_at: string | null
  }>('select published_at from public.playbook_versions where id = $1', [primeira])
  expect(carimbo[0]?.published_at).not.toBeNull()

  const segunda = await publicar(contaA, playbookId, {
    change_note: 'tirei a promessa de desconto',
  })

  const { rows: estados } = await banco.sql.query<{
    id: string
    status: string
  }>(
    `select id, status from public.playbook_versions
      where playbook_id = $1 and id = any($2) order by version`,
    [playbookId, [primeira, segunda]],
  )
  expect(estados).toEqual([
    { id: primeira, status: 'archived' },
    { id: segunda, status: 'published' },
  ])

  const { rows: ponteiro } = await banco.sql.query<{
    current_version_id: string | null
  }>('select current_version_id from public.playbooks where id = $1', [playbookId])
  expect(ponteiro[0]?.current_version_id).toBe(segunda)
})

test('publicar o rascunho que nasceu com a conta é update, e vale o mesmo', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')

  const { rows } = await banco.sql.query<{ id: string }>(
    `update public.playbook_versions
        set status = 'published', body_script = 'Bom dia, aqui é a Sarah.'
      where playbook_id = $1 and version = 1
      returning id`,
    [playbookId],
  )
  const id = rows[0]!.id

  const { rows: playbook } = await banco.sql.query<{
    current_version_id: string | null
  }>('select current_version_id from public.playbooks where id = $1', [playbookId])
  expect(playbook[0]?.current_version_id).toBe(id)
})

test('publicar com o roteiro vazio é recusado', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')

  await expect(
    semearVersao(contaA, playbookId, { status: 'published' }),
  ).rejects.toThrow(/playbook_versions_publicada_completa/i)
})

test('apagar a data de uma versão publicada é recusado', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')
  const id = await publicar(contaA, playbookId)

  await expect(
    banco.sql.query(
      'update public.playbook_versions set published_at = null where id = $1',
      [id],
    ),
  ).rejects.toThrow(/playbook_versions_publicada_completa/i)
})

test('corrigir a versão no ar não reescreve a data em que ela subiu', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')
  const id = await publicar(contaA, playbookId)

  const { rows: antes } = await banco.sql.query<{ published_at: string }>(
    'select published_at from public.playbook_versions where id = $1',
    [id],
  )

  await banco.sql.query(
    `update public.playbook_versions set body_house = 'sem gíria' where id = $1`,
    [id],
  )

  const { rows: depois } = await banco.sql.query<{ published_at: string }>(
    'select published_at from public.playbook_versions where id = $1',
    [id],
  )
  expect(depois[0]?.published_at).toEqual(antes[0]?.published_at)
})

test('duas versões publicadas no mesmo playbook são recusadas pelo índice', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')
  await publicar(contaA, playbookId)

  // Sem desligar o gatilho não dá para ver o índice trabalhar: publicar arquiva
  // a anterior, e as duas nunca chegam juntas ao índice. O que se mede aqui é a
  // rede embaixo do gatilho — se alguém o remover, o banco ainda recusa.
  await descartando(async () => {
    await banco.sql.query(
      'alter table public.playbook_versions disable trigger playbook_versions_publicar',
    )
    await expect(
      banco.sql.query(
        `insert into public.playbook_versions
           (account_id, playbook_id, status, body_script, published_at)
         values ($1, $2, 'published', 'segunda no ar', now())`,
        [contaA.id, playbookId],
      ),
    ).rejects.toThrow(/playbook_versions_uma_publicada/i)
  })
})

test('estado fora dos três é recusado', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')

  await expect(
    semearVersao(contaA, playbookId, { status: 'no ar' }),
  ).rejects.toThrow(/playbook_versions_status_check/i)
})

// Os dois lados do ponteiro ------------------------------------------------------

test('current_version_id não aceita versão de outro playbook', async () => {
  const descoberta = await playbookDe(contaA, 'discovery')
  const lembrete = await playbookDe(contaA, 'reminder')
  const versaoDoLembrete = await publicar(contaA, lembrete)

  await expect(
    banco.sql.query(
      'update public.playbooks set current_version_id = $2 where id = $1',
      [descoberta, versaoDoLembrete],
    ),
  ).rejects.toThrow(/playbooks_versao_atual_do_proprio/i)
})

test('apagar a versão publicada zera o ponteiro em vez de derrubar o playbook', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')
  const id = await publicar(contaA, playbookId)

  await banco.sql.query('delete from public.playbook_versions where id = $1', [id])

  const { rows } = await banco.sql.query<{ current_version_id: string | null }>(
    'select current_version_id from public.playbooks where id = $1',
    [playbookId],
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.current_version_id).toBeNull()
})

test('versão não se pendura em playbook de outra conta', async () => {
  const playbookDeA = await playbookDe(contaA, 'discovery')

  await expect(
    semearVersao(contaB, playbookDeA),
  ).rejects.toThrow(/playbook_versions_do_playbook_da_conta/i)
})

test('apagar a conta leva playbooks e versões por cascata', async () => {
  const conta = await criarConta('Padaria Central', 'central.test')
  const playbookId = await playbookDe(conta, 'discovery')
  await publicar(conta, playbookId)

  await banco.sql.query('delete from public.accounts where id = $1', [conta.id])

  const { rows } = await banco.sql.query<{ playbooks: number; versoes: number }>(
    `select (select count(*)::int from public.playbooks where account_id = $1) as playbooks,
            (select count(*)::int from public.playbook_versions where account_id = $1) as versoes`,
    [conta.id],
  )
  expect(rows[0]).toEqual({ playbooks: 0, versoes: 0 })
})

// Isolamento ---------------------------------------------------------------------

test('o administrador escreve nas duas e o operador em nenhuma', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')

  await banco.comoUsuario(contaA.operadorId)
  await expect(
    banco.sql.query(
      `insert into public.playbook_versions (account_id, playbook_id, body_script)
       values ($1, $2, 'roteiro do operador')`,
      [contaA.id, playbookId],
    ),
  ).rejects.toThrow(/row-level security/i)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: playbookEscrito } = await banco.sql.query(
    `update public.playbooks set current_version_id = null where id = $1 returning id`,
    [playbookId],
  )
  expect(playbookEscrito).toEqual([])

  await banco.comoUsuario(contaA.adminId)
  const { rows: criadas } = await banco.sql.query<{ id: string }>(
    `insert into public.playbook_versions (account_id, playbook_id, body_script)
     values ($1, $2, 'roteiro do administrador')
     returning id`,
    [contaA.id, playbookId],
  )
  expect(criadas).toHaveLength(1)

  const { rows: publicadas } = await banco.sql.query<{ id: string }>(
    `update public.playbook_versions set status = 'published'
      where id = $1 returning id`,
    [criadas[0]!.id],
  )
  expect(publicadas).toHaveLength(1)
})

test('o operador lê as duas e não muda nenhuma', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')
  const id = await publicar(contaA, playbookId)

  await banco.comoUsuario(contaA.operadorId)

  const { rows: playbooks } = await banco.sql.query(
    'select id from public.playbooks where id = $1',
    [playbookId],
  )
  expect(playbooks).toHaveLength(1)

  const { rows: versoes } = await banco.sql.query(
    'select id from public.playbook_versions where id = $1',
    [id],
  )
  expect(versoes).toHaveLength(1)

  const { rows: alterada } = await banco.sql.query(
    `update public.playbook_versions set body_script = 'outro' where id = $1 returning id`,
    [id],
  )
  expect(alterada).toEqual([])
})

test('a conta vizinha recebe zero linha, e o anônimo também', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows: playbooks } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.playbooks',
  )
  expect(playbooks).toHaveLength(PROPOSITOS.length)
  expect(playbooks.every((linha) => linha.account_id === contaA.id)).toBe(true)

  await banco.comoAnonimo()
  const { rows: semPlaybook } = await banco.sql.query(
    'select id from public.playbooks',
  )
  expect(semPlaybook).toEqual([])
  const { rows: semVersao } = await banco.sql.query(
    'select id from public.playbook_versions',
  )
  expect(semVersao).toEqual([])
})

// Auditoria ----------------------------------------------------------------------

test('publicar entra na trilha com a change_note e a versão arquivada', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')

  await banco.comoUsuario(contaA.adminId)
  const { rows: primeiras } = await banco.sql.query<{ id: string }>(
    `insert into public.playbook_versions
       (account_id, playbook_id, status, body_script, change_note)
     values ($1, $2, 'published', 'primeiro roteiro', 'primeira publicação')
     returning id`,
    [contaA.id, playbookId],
  )
  await banco.sql.query(
    `insert into public.playbook_versions
       (account_id, playbook_id, status, body_script, change_note)
     values ($1, $2, 'published', 'roteiro revisto', 'tirei a promessa de desconto')`,
    [contaA.id, playbookId],
  )

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    action: string
    actor: string
    actor_id: string | null
    target_type: string
    payload: {
      version: number
      change_note: string | null
      versao_arquivada: number | null
    }
  }>(
    `select action, actor, actor_id, target_type, payload
       from public.audit_log where action = 'publish' order by created_at`,
  )

  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({
    action: 'publish',
    actor: 'user',
    actor_id: contaA.adminId,
    target_type: 'playbook_versions',
  })
  // A nota é o que alguém lê meses depois, em vez de diferenciar dois textos
  // longos linha a linha.
  expect(rows[0]?.payload).toEqual({
    version: 2,
    change_note: 'primeira publicação',
    versao_arquivada: null,
  })
  expect(rows[1]?.payload).toEqual({
    version: 3,
    change_note: 'tirei a promessa de desconto',
    versao_arquivada: 2,
  })
  expect(primeiras).toHaveLength(1)
})

test('editar o roteiro entra na trilha com o texto anterior', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')
  const id = await semearVersao(contaA, playbookId, { body_script: 'primeiro' })

  await banco.sql.query(
    `update public.playbook_versions set body_script = 'segundo' where id = $1`,
    [id],
  )

  const { rows } = await banco.sql.query<{
    action: string
    payload: { campos: string[]; antes: Record<string, unknown> }
  }>(
    `select action, payload from public.audit_log where target_id = $1`,
    [id],
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.action).toBe('update')
  expect(rows[0]?.payload.campos).toEqual(['body_script'])
  expect(rows[0]?.payload.antes).toEqual({ body_script: 'primeiro' })
})

test('publicar não escreve linha genérica, só a da publicação', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')

  await banco.sql.query(
    `update public.playbook_versions
        set status = 'published', body_script = 'Bom dia, aqui é a Sarah.'
      where playbook_id = $1 and version = 1`,
    [playbookId],
  )

  const { rows } = await banco.sql.query<{ action: string }>(
    `select action from public.audit_log order by action`,
  )
  // `status`, `published_at` e `current_version_id` estão fora da comparação
  // genérica: o ato tem linha própria, e duas linhas para ele seriam ruído.
  // A do texto entra porque body_script mudou no mesmo update.
  expect(rows.map((linha) => linha.action)).toEqual(['publish', 'update'])
})

test('updated_at não aceita data vinda de fora', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')
  const id = await semearVersao(contaA, playbookId)

  const { rows } = await banco.sql.query<{
    updated_at: string
    created_at: string
  }>(
    `update public.playbook_versions
        set body_house = 'sem gíria', updated_at = '2001-01-01T00:00:00Z'
      where id = $1
      returning updated_at, created_at`,
    [id],
  )
  expect(rows[0]!.updated_at >= rows[0]!.created_at).toBe(true)
})

// Regressão ----------------------------------------------------------------------
// As duas provam que o que está acima tem dente: sem o índice parcial duas
// versões publicadas convivem, e sem o gatilho o número passa a vir do cliente.

test('sem o índice parcial, duas versões publicadas convivem', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')
  await publicar(contaA, playbookId)

  await descartando(async () => {
    await banco.sql.query(
      'alter table public.playbook_versions disable trigger playbook_versions_publicar',
    )
    await banco.sql.query('drop index public.playbook_versions_uma_publicada')

    // Duas consultas, e não um `with`: a parte de leitura de um comando enxerga
    // a fotografia anterior à escrita dele, e a contagem voltaria 1 mesmo com
    // as duas linhas gravadas.
    await banco.sql.query(
      `insert into public.playbook_versions
         (account_id, playbook_id, status, body_script, published_at)
       values ($1, $2, 'published', 'segunda no ar', now())`,
      [contaA.id, playbookId],
    )

    const { rows } = await banco.sql.query<{ total: number }>(
      `select count(*)::int as total from public.playbook_versions as v
        where v.playbook_id = $1 and v.status = 'published'`,
      [playbookId],
    )
    expect(
      rows[0]?.total,
      'duas publicadas conviveram sem o índice, então é o índice que as recusa',
    ).toBe(2)
  })
})

test('sem o gatilho de numeração, o número passa a vir do cliente', async () => {
  const playbookId = await playbookDe(contaA, 'discovery')

  await descartando(async () => {
    await banco.sql.query(
      'alter table public.playbook_versions disable trigger playbook_versions_numerar',
    )
    const id = await semearVersao(contaA, playbookId, { version: 99 })

    const { rows } = await banco.sql.query<{ version: number }>(
      'select version from public.playbook_versions where id = $1',
      [id],
    )
    expect(
      rows[0]?.version,
      'o número do cliente entrou sem o gatilho, então é o gatilho que o descarta',
    ).toBe(99)
  })
})

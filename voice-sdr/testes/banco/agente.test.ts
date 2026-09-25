// A identidade da Sarah e as quatro publicações no provedor. Esta migração é a
// primeira da F2, e o que ela precisa provar é que a decisão de T-01
// (docs/decisao-do-agente.md) virou estrutura, e não convenção:
//
// 1. Uma Sarah por conta. A segunda é recusada pelo banco, e não pela tela.
// 2. Uma publicação por propósito. A quinta de um propósito é recusada, e as
//    quatro primeiras convivem.
// 3. Propósito fora dos quatro é recusado: `discovery`, `reminder`, `rescue`,
//    `followup` e mais nada.
// 4. `published_hash` é sha-256 em hexadecimal minúsculo, e a coluna recusa
//    qualquer outra coisa — truncado, com maiúscula, com caractere de fora.
// 5. Classe Configuração: membro lê, administrador escreve, operador não
//    escreve em nenhuma das duas.
// 6. A conta vizinha recebe zero linha, e a sessão anônima também.
// 7. As duas estão na trilha de auditoria (RF-008).
//
// Referência: migração 20260921210000_agente.sql,
// docs/PRD-implementacao.md seções 3.4 e 3.9, docs/PRD.md RF-008, RF-308 e
// RF-309, docs/decisao-do-agente.md e docs/revisao-tecnica.md T-01.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** Os quatro propósitos da decisão de T-01, na ordem em que a F2 os usa. */
const PROPOSITOS = ['discovery', 'reminder', 'rescue', 'followup'] as const

/** Um sha-256 qualquer: 64 hexadecimais minúsculos. Aqui nada resolve hash. */
const HASH = 'a'.repeat(64)

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

/** Insert mínimo: só o que não tem padrão. O resto vem da coluna. */
async function semearAgente(
  conta: Conta,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    name: 'Sarah',
    company_name: 'Transportes Aurora',
    ...extras,
  }

  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.agents (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

async function semearPublicacao(
  conta: Conta,
  agenteId: string,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    agent_id: agenteId,
    purpose: 'discovery',
    ...extras,
  }

  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.agent_publications (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

/** Roda a manobra e desfaz tudo o que ela fizer. */
async function descartando(manobra: () => Promise<void>): Promise<void> {
  await banco.sql.query('begin')
  try {
    await manobra()
  } finally {
    await banco.comoServico()
    await banco.sql.query('rollback')
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

// Papel deixado por um teste anterior não contamina o próximo, e cada teste
// começa sem Sarah nenhuma: o único por conta faria o segundo insert falhar
// por resíduo do teste anterior, e a mensagem enganaria quem fosse ler.
beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.agents')
  await banco.sql.query('delete from public.audit_log')
})

// A identidade -----------------------------------------------------------------

test('os padrões da Sarah nascem da coluna', async () => {
  const id = await semearAgente(contaA)

  const { rows } = await banco.sql.query<{
    status: string
    never_claim: string[]
    voice_settings: Record<string, unknown>
    offer_line: string | null
    transfer_target: string | null
    voice_id: string | null
    first_message: string | null
  }>(
    `select status, never_claim, voice_settings, offer_line, transfer_target,
            voice_id, first_message
       from public.agents where id = $1`,
    [id],
  )

  expect(rows[0]).toMatchObject({
    status: 'rascunho',
    never_claim: [],
    voice_settings: {},
  })
  // Rascunho incompleto é o estado comum de quem está montando a Sarah: nada
  // disso é obrigatório para salvar, e quem cobra para publicar é o compilador.
  expect(rows[0]?.offer_line).toBeNull()
  expect(rows[0]?.transfer_target).toBeNull()
  expect(rows[0]?.voice_id).toBeNull()
  expect(rows[0]?.first_message).toBeNull()
})

test('a segunda Sarah da conta é recusada, e a da conta vizinha entra', async () => {
  await semearAgente(contaA)

  await expect(semearAgente(contaA, { name: 'Sarah II' })).rejects.toThrow(
    /agents_uma_por_conta/i,
  )

  const naVizinha = await semearAgente(contaB)
  expect(naVizinha).toBeTruthy()
})

test('a tabela diz por que a Sarah é uma só', async () => {
  const { rows } = await banco.sql.query<{ descricao: string }>(
    `select obj_description('public.agents'::regclass, 'pg_class') as descricao`,
  )
  // A razão mora no comentário e não só no teste: quem for acrescentar a
  // segunda Sarah lê a tabela antes de ler isto aqui.
  expect(rows[0]?.descricao).toMatch(/uma por conta/i)
  expect(rows[0]?.descricao).toMatch(/provider_agent_id/)
})

const AGENTES_RECUSADOS: {
  caso: string
  coluna: string
  valor: unknown
  restricao: RegExp
}[] = [
  {
    caso: 'nome em branco, que sairia mudo na primeira fala',
    coluna: 'name',
    valor: '   ',
    restricao: /agents_name_check|agents/i,
  },
  {
    caso: 'empresa em branco',
    coluna: 'company_name',
    valor: '',
    restricao: /agents_company_name_check|agents/i,
  },
  {
    caso: 'oferta em branco, que é diferente de oferta ausente',
    coluna: 'offer_line',
    valor: ' ',
    restricao: /agents_offer_line_check|agents/i,
  },
  {
    caso: 'primeira fala em branco',
    coluna: 'first_message',
    valor: '  ',
    restricao: /agents_first_message_check|agents/i,
  },
  {
    caso: 'voz em branco',
    coluna: 'voice_id',
    valor: '',
    restricao: /agents_voice_id_check|agents/i,
  },
  {
    caso: 'estado que ninguém sabe ler',
    coluna: 'status',
    valor: 'pausado',
    restricao: /agents_status_check|agents/i,
  },
]

test.each(AGENTES_RECUSADOS)(
  'o banco recusa agente com $caso',
  async ({ coluna, valor, restricao }) => {
    await expect(semearAgente(contaA, { [coluna]: valor })).rejects.toThrow(
      restricao,
    )
  },
)

test('o nome é obrigatório; a empresa pode esperar o tutorial chegar ao negócio', async () => {
  await expect(
    banco.sql.query(
      'insert into public.agents (account_id, company_name) values ($1, $2)',
      [contaA.id, 'Transportes Aurora'],
    ),
  ).rejects.toThrow(/null value in column "name"/i)

  // O tutorial grava o nome antes de tudo, e a empresa três etapas depois.
  const { rows } = await banco.sql.query<{ company_name: string | null }>(
    'insert into public.agents (account_id, name) values ($1, $2) returning company_name',
    [contaA.id, 'Ana'],
  )
  expect(rows[0]?.company_name).toBeNull()
  await banco.sql.query('delete from public.agents where account_id = $1', [contaA.id])
})

// As publicações ---------------------------------------------------------------

test('os quatro propósitos convivem e o quinto da mesma chave é recusado', async () => {
  const agenteId = await semearAgente(contaA)

  for (const purpose of PROPOSITOS) {
    await semearPublicacao(contaA, agenteId, { purpose })
  }

  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.agent_publications where agent_id = $1',
    [agenteId],
  )
  expect(rows[0]?.total).toBe(4)

  await expect(
    semearPublicacao(contaA, agenteId, { purpose: 'discovery' }),
  ).rejects.toThrow(/agent_publications_uma_por_proposito/i)
})

test('propósito fora dos quatro é recusado', async () => {
  const agenteId = await semearAgente(contaA)

  await expect(
    semearPublicacao(contaA, agenteId, { purpose: 'retomada' }),
  ).rejects.toThrow(/agent_publications_purpose_check/i)

  await expect(
    semearPublicacao(contaA, agenteId, { purpose: 'DISCOVERY' }),
  ).rejects.toThrow(/agent_publications_purpose_check/i)
})

test('a publicação nasce pendente, sem identificador e sem hash', async () => {
  const agenteId = await semearAgente(contaA)
  const id = await semearPublicacao(contaA, agenteId)

  const { rows } = await banco.sql.query<{
    status: string
    provider_agent_id: string | null
    published_hash: string | null
    published_at: string | null
  }>(
    `select status, provider_agent_id, published_hash, published_at
       from public.agent_publications where id = $1`,
    [id],
  )

  // Pendente e falha são estados distintos de propósito: um propósito que o
  // provedor recusou não pode se confundir com um que nunca foi tentado.
  expect(rows[0]?.status).toBe('pendente')
  expect(rows[0]?.provider_agent_id).toBeNull()
  expect(rows[0]?.published_hash).toBeNull()
  expect(rows[0]?.published_at).toBeNull()
})

const HASHES_RECUSADOS: { caso: string; valor: string }[] = [
  { caso: 'curto demais para ser sha-256', valor: 'abc123' },
  { caso: 'com um hexadecimal a mais', valor: `${'a'.repeat(64)}b` },
  { caso: 'em maiúscula', valor: 'A'.repeat(64) },
  { caso: 'com caractere fora do hexadecimal', valor: `${'a'.repeat(63)}z` },
  { caso: 'em branco', valor: '' },
]

test.each(HASHES_RECUSADOS)(
  'published_hash $caso é recusado',
  async ({ valor }) => {
    const agenteId = await semearAgente(contaA)
    await expect(
      semearPublicacao(contaA, agenteId, { published_hash: valor }),
    ).rejects.toThrow(/agent_publications_published_hash_check/i)
  },
)

test('published_hash com os 64 hexadecimais minúsculos é aceito', async () => {
  const agenteId = await semearAgente(contaA)
  const id = await semearPublicacao(contaA, agenteId, { published_hash: HASH })
  expect(id).toBeTruthy()
})

const PUBLICACOES_RECUSADAS: {
  caso: string
  extras: Readonly<Record<string, unknown>>
}[] = [
  {
    caso: 'sem identificador do provedor',
    extras: { status: 'publicado', published_hash: HASH, published_at: 'now()' },
  },
  {
    caso: 'sem hash',
    extras: { status: 'publicado', provider_agent_id: 'ag_1' },
  },
  {
    caso: 'sem a data em que subiu',
    extras: { status: 'publicado', provider_agent_id: 'ag_1', published_hash: HASH },
  },
]

test.each(PUBLICACOES_RECUSADAS)(
  'publicação marcada como publicada $caso é recusada',
  async ({ extras }) => {
    const agenteId = await semearAgente(contaA)
    const campos =
      extras['published_at'] === 'now()'
        ? { ...extras, published_at: new Date().toISOString() }
        : extras
    await expect(semearPublicacao(contaA, agenteId, campos)).rejects.toThrow(
      /agent_publications_publicado_completo/i,
    )
  },
)

test('estado de publicação fora dos três é recusado', async () => {
  const agenteId = await semearAgente(contaA)
  await expect(
    semearPublicacao(contaA, agenteId, { status: 'no ar' }),
  ).rejects.toThrow(/agent_publications_status_check/i)
})

test('apagar a Sarah derruba as publicações dela por cascata', async () => {
  const agenteId = await semearAgente(contaA)
  for (const purpose of PROPOSITOS) {
    await semearPublicacao(contaA, agenteId, { purpose })
  }

  await banco.sql.query('delete from public.agents where id = $1', [agenteId])

  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.agent_publications',
  )
  expect(rows[0]?.total).toBe(0)
})

// Isolamento -------------------------------------------------------------------

test('o administrador escreve nas duas tabelas e o operador em nenhuma', async () => {
  await banco.comoUsuario(contaA.operadorId)
  await expect(
    banco.sql.query(
      `insert into public.agents (account_id, name, company_name)
       values ($1, 'Sarah do operador', 'Aurora')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  await banco.comoUsuario(contaA.adminId)
  const { rows: agentes } = await banco.sql.query<{ id: string }>(
    `insert into public.agents (account_id, name, company_name)
     values ($1, 'Sarah', 'Aurora')
     returning id`,
    [contaA.id],
  )
  const agenteId = agentes[0]!.id

  await banco.comoUsuario(contaA.operadorId)
  await expect(
    banco.sql.query(
      `insert into public.agent_publications (account_id, agent_id, purpose)
       values ($1, $2, 'discovery')`,
      [contaA.id, agenteId],
    ),
  ).rejects.toThrow(/row-level security/i)

  await banco.comoUsuario(contaA.adminId)
  const { rows: publicacoes } = await banco.sql.query<{ id: string }>(
    `insert into public.agent_publications (account_id, agent_id, purpose)
     values ($1, $2, 'discovery')
     returning id`,
    [contaA.id, agenteId],
  )
  expect(publicacoes).toHaveLength(1)
})

test('o operador lê as duas e não muda nenhuma', async () => {
  const agenteId = await semearAgente(contaA)
  const publicacaoId = await semearPublicacao(contaA, agenteId)

  await banco.comoUsuario(contaA.operadorId)

  const { rows: lidos } = await banco.sql.query(
    'select id from public.agents where id = $1',
    [agenteId],
  )
  expect(lidos).toHaveLength(1)

  const { rows: lidas } = await banco.sql.query(
    'select id from public.agent_publications where id = $1',
    [publicacaoId],
  )
  expect(lidas).toHaveLength(1)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: agenteEscrito } = await banco.sql.query(
    `update public.agents set company_name = 'Outra' where id = $1 returning id`,
    [agenteId],
  )
  expect(agenteEscrito).toEqual([])

  const { rows: publicacaoEscrita } = await banco.sql.query(
    `update public.agent_publications set status = 'falha' where id = $1 returning id`,
    [publicacaoId],
  )
  expect(publicacaoEscrita).toEqual([])
})

test('a conta vizinha recebe zero linha, e o anônimo também', async () => {
  const agenteA = await semearAgente(contaA)
  await semearPublicacao(contaA, agenteA)
  const agenteB = await semearAgente(contaB)
  await semearPublicacao(contaB, agenteB)

  await banco.comoUsuario(contaA.adminId)
  const { rows: agentes } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.agents',
  )
  expect(agentes).toHaveLength(1)
  expect(agentes[0]?.account_id).toBe(contaA.id)

  const { rows: publicacoes } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.agent_publications',
  )
  expect(publicacoes).toHaveLength(1)
  expect(publicacoes[0]?.account_id).toBe(contaA.id)

  await banco.comoAnonimo()
  const { rows: semAgente } = await banco.sql.query('select id from public.agents')
  expect(semAgente).toEqual([])
  const { rows: semPublicacao } = await banco.sql.query(
    'select id from public.agent_publications',
  )
  expect(semPublicacao).toEqual([])
})

// Auditoria --------------------------------------------------------------------

test('mudar a Sarah e republicar entram na trilha', async () => {
  const agenteId = await semearAgente(contaA)
  const publicacaoId = await semearPublicacao(contaA, agenteId)

  await banco.sql.query(
    `update public.agents set offer_line = 'frete dedicado em 24h' where id = $1`,
    [agenteId],
  )
  await banco.sql.query(
    `update public.agent_publications set status = 'falha' where id = $1`,
    [publicacaoId],
  )

  const { rows } = await banco.sql.query<{
    target_type: string
    payload: { campos: string[] }
  }>(
    `select target_type, payload from public.audit_log
      where target_id in ($1, $2)
      order by target_type`,
    [agenteId, publicacaoId],
  )

  expect(rows.map((linha) => linha.target_type)).toEqual([
    'agent_publications',
    'agents',
  ])
  expect(rows[0]?.payload.campos).toEqual(['status'])
  expect(rows[1]?.payload.campos).toEqual(['offer_line'])
})

test('updated_at não aceita data vinda de fora', async () => {
  const agenteId = await semearAgente(contaA)

  const { rows } = await banco.sql.query<{
    updated_at: string
    created_at: string
  }>(
    `update public.agents
        set status = 'ativo', updated_at = '2001-01-01T00:00:00Z'
      where id = $1
      returning updated_at, created_at`,
    [agenteId],
  )
  expect(rows[0]!.updated_at >= rows[0]!.created_at).toBe(true)
})

// Regressão ----------------------------------------------------------------------
// Estas duas provam que os testes acima têm dente: afrouxar a escrita para
// operador e tirar o check de propósito derrubam o que deveriam derrubar.

test('com a escrita afrouxada para operator, o operador publica', async () => {
  const agenteId = await semearAgente(contaA)

  await descartando(async () => {
    await banco.sql.query(
      `alter policy agent_publications_insercao_de_admin
         on public.agent_publications
         with check ((select public.has_role(account_id, 'operator')))`,
    )
    await banco.comoUsuario(contaA.operadorId)
    const { rows } = await banco.sql.query<{ id: string }>(
      `insert into public.agent_publications (account_id, agent_id, purpose)
       values ($1, $2, 'discovery')
       returning id`,
      [contaA.id, agenteId],
    )
    expect(
      rows,
      'o operador publicou com a política afrouxada, então o teste de papéis ' +
        'está medindo a política e não outra coisa',
    ).toHaveLength(1)
  })
})

test('sem o check de propósito, um propósito inventado entra', async () => {
  const agenteId = await semearAgente(contaA)

  await descartando(async () => {
    await banco.sql.query(
      `alter table public.agent_publications
         drop constraint agent_publications_purpose_check`,
    )
    const id = await semearPublicacao(contaA, agenteId, { purpose: 'retomada' })
    expect(
      id,
      'o propósito inventado entrou sem o check, então é o check que o recusa',
    ).toBeTruthy()
  })
})

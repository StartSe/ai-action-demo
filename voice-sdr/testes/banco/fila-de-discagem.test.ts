// A fila única de discagem: uma tabela, cinco rotinas produtoras, um consumidor
// (seção 3.7, L-14, R-09).
//
// O que este arquivo prova:
//
// 1. **O único por fonte barra o segundo enfileiramento**, que é o freio de
//    R-09: intake duplicado, cadência que reinscreve e lead com dois telefones
//    deixam de virar duas ligações. E deixa passar com `attempt` maior, porque
//    retentativa de RF-417 é discagem nova.
// 2. As duas listas fechadas: `source` nas seis fontes que T-07 nomeia, e
//    `status` nos cinco estados. Fonte inventada pela borda é discagem que o
//    freio não enxerga.
// 3. **O índice parcial existe no catálogo, com as colunas na ordem declarada
//    e com o predicado.** É a consulta que `cron-dial` faz a cada minuto; sem
//    o índice, ela varre o histórico inteiro da conta, e a falta não quebraria
//    consulta nenhuma — só faria a passagem do minuto ficar mais cara a cada
//    ligação já feita.
// 4. Classe Servidor da seção 3.9: o membro lê, e ninguém do cliente insere,
//    altera nem apaga — nem o dono da conta.
// 5. A conta vizinha recebe zero linha, e a sessão anônima também.
// 6. Apagar a chamada não apaga o item: `call_id` vira nulo e a memória de que
//    a discagem já foi pedida continua lá.
//
// A prova que falta aqui é a do `for update skip locked` com duas execuções
// sobrepostas, que o PGlite não tem como dar: ele atende uma conexão só. Ela
// está escrita em `fila-concorrencia.test.ts` e roda no degrau 3.
//
// Referência: migração 20260922080000_fila_de_discagem.sql,
// docs/PRD-implementacao.md seções 3.7, 3.9 e 4.6, docs/revisao-tecnica.md
// L-14, T-07 e R-09, docs/PRD.md RF-417, RF-610 e RF-707.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly operadorId: string
  readonly leadId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(
  nome: string,
  dominio: string,
  sufixo: string,
): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id

  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')

  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'operator')`,
    [id, donoId, operadorId],
  )

  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, $2, $3, 'cenario')
     returning id`,
    [id, `Lead de ${nome}`, `+55119900000${sufixo}`],
  )

  return { id, donoId, operadorId, leadId: leads[0]!.id }
}

/**
 * Insert pela sessão de serviço, que é o único caminho que a tabela tem:
 * `dial_queue` é da classe Servidor e não tem política de escrita de cliente.
 * Quem enfileira de verdade são as cinco rotinas produtoras.
 */
async function enfileirar(
  conta: Conta,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    lead_id: conta.leadId,
    purpose: 'discovery',
    source: 'stl',
    source_ref: conta.leadId,
    ...extras,
  }

  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.dial_queue (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test', '1')
  contaB = await criarConta('Cooperativa Sul', 'sul.test', '2')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  // A tabela tem restrição entre linhas: o que um teste enfileirou colide com
  // o que o próximo quer enfileirar, e a falha apareceria longe da causa.
  await banco.sql.query('delete from public.dial_queue')
  await banco.sql.query('delete from public.calls')
})

// O freio de R-09 --------------------------------------------------------------------

test('o único barra o segundo enfileiramento da mesma fonte', async () => {
  const primeiro = await enfileirar(contaA, { source_ref: contaA.leadId })
  expect(primeiro).toBeTruthy()

  // O intake que recebe o mesmo lead duas vezes, a cadência que reinscreve e o
  // lead com dois telefones caem todos aqui.
  await expect(
    enfileirar(contaA, { source_ref: contaA.leadId }),
  ).rejects.toThrow(/dial_queue_unica_por_fonte/i)
})

test('a chave de idempotência da fila é (conta, fonte, referência, tentativa)', async () => {
  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select pg_get_constraintdef(c.oid) as definicao
       from pg_constraint as c
      where c.conname = 'dial_queue_unica_por_fonte'`,
  )
  // Coluna a menos aqui é uma discagem que o freio deixa passar duas vezes;
  // coluna a mais é uma que ele deixa passar sempre.
  expect(rows[0]?.definicao?.replace(/\s+/g, ' ')).toBe(
    'UNIQUE (account_id, source, source_ref, attempt)',
  )
})

test('a retentativa entra: attempt maior é discagem nova', async () => {
  await enfileirar(contaA, { source: 'camp', source_ref: 'alvo-7' })

  // Sem `attempt` na chave, a reprogramação de RF-417 seria descartada em
  // silêncio, e o alvo que não atendeu nunca receberia a segunda ligação.
  const segunda = await enfileirar(contaA, {
    source: 'camp',
    source_ref: 'alvo-7',
    attempt: 2,
  })
  expect(segunda).toBeTruthy()

  const { rows } = await banco.sql.query<{ attempt: number }>(
    `select attempt from public.dial_queue
      where account_id = $1 and source = 'camp' and source_ref = 'alvo-7'
      order by attempt`,
    [contaA.id],
  )
  expect(rows.map((linha) => linha.attempt)).toEqual([1, 2])
})

test('a mesma referência na conta vizinha entra: o único é por conta', async () => {
  await enfileirar(contaA, { source: 'rem', source_ref: 'reuniao-1' })
  const daVizinha = await enfileirar(contaB, {
    source: 'rem',
    source_ref: 'reuniao-1',
  })
  expect(daVizinha).toBeTruthy()
})

// As duas listas fechadas --------------------------------------------------------------

/** Os seis prefixos que T-07 nomeia, com quem os escreve. */
const FONTES = [
  { source: 'manual', quem: 'discador de gente' },
  { source: 'stl', quem: 'fala-rápido (RF-610)' },
  { source: 'rem', quem: 'lembrete de reunião (RF-601)' },
  { source: 'rescue', quem: 'resgate de falta atestada (RF-604)' },
  { source: 'cad', quem: 'cadência (RF-606)' },
  { source: 'camp', quem: 'campanha (RF-707)' },
]

test.each(FONTES)('a fonte $source entra — $quem', async ({ source }) => {
  // As quatro de fatia futura entram desde já de propósito: a unicidade por
  // fonte só vale se o formato for o mesmo desde o começo.
  const id = await enfileirar(contaA, { source, source_ref: `ref-${source}` })
  expect(id).toBeTruthy()
})

test('a lista de fontes do banco é exatamente a dos seis prefixos de T-07', async () => {
  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select pg_get_constraintdef(c.oid) as definicao
       from pg_constraint as c
      where c.conname = 'dial_queue_source_check'`,
  )
  const citados = [
    ...(rows[0]?.definicao ?? '').matchAll(/'([a-z_]+)'/g),
  ].map((achado) => achado[1]!)
  expect(new Set(citados)).toEqual(new Set(FONTES.map((fonte) => fonte.source)))
})

test('fonte desconhecida é recusada', async () => {
  // Fonte inventada pela borda é uma discagem que o freio de R-09 não enxerga:
  // ela não colide com nada, porque nada mais usa aquele prefixo.
  await expect(
    enfileirar(contaA, { source: 'intake', source_ref: 'x' }),
  ).rejects.toThrow(/dial_queue_source_check/i)

  await expect(
    enfileirar(contaA, { source: 'STL', source_ref: 'x' }),
  ).rejects.toThrow(/dial_queue_source_check/i)
})

const ESTADOS = ['queued', 'claimed', 'done', 'failed', 'canceled']

test('os cinco estados entram e a lista do banco é exatamente essa', async () => {
  for (const status of ESTADOS) {
    const id = await enfileirar(contaA, {
      status,
      source_ref: `estado-${status}`,
    })
    expect(id).toBeTruthy()
  }

  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select pg_get_constraintdef(c.oid) as definicao
       from pg_constraint as c
      where c.conname = 'dial_queue_status_check'`,
  )
  const citados = [
    ...(rows[0]?.definicao ?? '').matchAll(/'([a-z_]+)'/g),
  ].map((achado) => achado[1]!)
  expect(new Set(citados)).toEqual(new Set(ESTADOS))
})

test('estado fora da lista é recusado', async () => {
  await expect(
    enfileirar(contaA, { status: 'dialing' }),
  ).rejects.toThrow(/dial_queue_status_check/i)
})

test('propósito fora dos quatro é recusado', async () => {
  // Propósito novo entra em `calls` e aqui juntos, senão a fila aceita um
  // pedido que a chamada não sabe registrar.
  await expect(
    enfileirar(contaA, { purpose: 'qualify' }),
  ).rejects.toThrow(/dial_queue_purpose_check/i)
})

// A forma da linha ---------------------------------------------------------------------

test('o item nasce queued, na primeira tentativa e sem quem o tomou', async () => {
  const id = await enfileirar(contaA)
  const { rows } = await banco.sql.query<{
    status: string
    attempt: number
    claimed_at: string | null
    call_id: string | null
    run_at: string
  }>(
    'select status, attempt, claimed_at, call_id, run_at from public.dial_queue where id = $1',
    [id],
  )
  const item = rows[0]
  expect(item?.status).toBe('queued')
  expect(item?.attempt).toBe(1)
  expect(item?.claimed_at).toBeNull()
  expect(item?.call_id).toBeNull()
  // `now()` é o padrão do fala-rápido, que quer a ligação já.
  expect(item?.run_at).toBeTruthy()
})

test('referência vazia é recusada e tentativa abaixo de 1 também', async () => {
  // Referência vazia seria chave que não identifica nada, e todas as discagens
  // da mesma fonte colidiriam entre si.
  await expect(
    enfileirar(contaA, { source_ref: '   ' }),
  ).rejects.toThrow(/dial_queue_source_ref_check/i)

  await expect(
    enfileirar(contaA, { attempt: 0 }),
  ).rejects.toThrow(/dial_queue_attempt_check/i)
})

test('o item para número de teste não precisa de lead', async () => {
  // Enquanto o portão da fatia está fechado (L-03), o discador manual liga
  // para a lista de números de teste, que não é lead de ninguém.
  const id = await enfileirar(contaA, {
    lead_id: null,
    source: 'manual',
    source_ref: '3f2b5c8e-0a11-4a2b-9c3d-5e6f70819203',
  })
  expect(id).toBeTruthy()
})

// O índice da consulta do minuto --------------------------------------------------------

test('o índice da fila existe com as colunas na ordem declarada', async () => {
  // Direto do catálogo, e não do texto do `indexdef`: regex sobre o DDL passa a
  // aceitar qualquer ordem no dia em que alguém reformatar a migração.
  const { rows } = await banco.sql.query<{ coluna: string }>(
    `select a.attname as coluna
       from pg_index as i
       join pg_class as idx on idx.oid = i.indexrelid
      cross join lateral unnest(string_to_array(i.indkey::text, ' ')::smallint[])
            with ordinality as posicao(atributo, ordem)
       join pg_attribute as a
         on a.attrelid = i.indrelid and a.attnum = posicao.atributo
      where idx.relname = 'dial_queue_pronta_para_discar'
      order by posicao.ordem`,
  )
  expect(rows.map((linha) => linha.coluna)).toEqual([
    'account_id',
    'status',
    'run_at',
  ])
})

test('o índice da fila é parcial em queued', async () => {
  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select indexdef as definicao
       from pg_indexes
      where schemaname = 'public' and indexname = 'dial_queue_pronta_para_discar'`,
  )
  // Sem o predicado, o índice cresceria para sempre por causa de `done` e
  // `canceled`, que ficam na tabela pela idempotência e que a consulta do
  // minuto nunca olha.
  expect(rows[0]?.definicao).toMatch(/where \(status = 'queued'::text\)/i)
})

test('os índices da tabela são a chave primária, o único e o da fila', async () => {
  const { rows } = await banco.sql.query<{ nome: string }>(
    `select indexname as nome
       from pg_indexes
      where schemaname = 'public' and tablename = 'dial_queue'
      order by indexname`,
  )
  // A asserção do outro lado: índice a mais é índice que ninguém declarou qual
  // consulta serve, e índice a menos derruba os dois testes acima.
  expect(rows.map((linha) => linha.nome)).toEqual([
    'dial_queue_pkey',
    'dial_queue_pronta_para_discar',
    'dial_queue_unica_por_fonte',
  ])
})

// A memória do que já foi pedido ---------------------------------------------------------

test('apagar a chamada não apaga o item: o call_id vira nulo', async () => {
  const { rows: chamadas } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, idempotency_key)
     values ($1, $2, 'discovery', 'outbound', 'fila-1')
     returning id`,
    [contaA.id, contaA.leadId],
  )
  const chamadaId = chamadas[0]!.id
  const itemId = await enfileirar(contaA, {
    status: 'done',
    call_id: chamadaId,
  })

  await banco.sql.query('delete from public.calls where id = $1', [chamadaId])

  const { rows } = await banco.sql.query<{ call_id: string | null }>(
    'select call_id from public.dial_queue where id = $1',
    [itemId],
  )
  // Cascata aqui apagaria a memória de que a discagem já foi pedida, e a
  // rotina produtora enfileiraria o mesmo alvo na passagem seguinte.
  expect(rows).toHaveLength(1)
  expect(rows[0]?.call_id).toBeNull()
})

test('apagar o lead leva os itens da fila junto (RF-808)', async () => {
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead efêmero', '+5511970000009', 'cenario')
     returning id`,
    [contaA.id],
  )
  const leadId = leads[0]!.id
  await enfileirar(contaA, { lead_id: leadId, source_ref: leadId })

  await banco.sql.query('delete from public.leads where id = $1', [leadId])

  const { rows } = await banco.sql.query(
    'select id from public.dial_queue where lead_id = $1',
    [leadId],
  )
  // Discagem pendente para um lead apagado é dado dele tanto quanto a
  // transcrição é.
  expect(rows).toEqual([])
})

// Isolamento (classe Servidor) -----------------------------------------------------------

test('o membro lê e o dono não insere, não altera e não apaga', async () => {
  const id = await enfileirar(contaA)

  await banco.comoUsuario(contaA.donoId)

  const { rows: lidos } = await banco.sql.query(
    'select id from public.dial_queue where id = $1',
    [id],
  )
  // Ler é de todo membro: é a fila que responde por que a Sarah ainda não
  // ligou para um lead.
  expect(lidos).toHaveLength(1)

  // Enfileirar por fora da rotina é discar por fora da guarda.
  await expect(
    banco.sql.query(
      `insert into public.dial_queue
         (account_id, purpose, source, source_ref)
       values ($1, 'discovery', 'manual', 'inventada')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: alterados } = await banco.sql.query(
    `update public.dial_queue set status = 'canceled' where id = $1 returning id`,
    [id],
  )
  expect(alterados).toEqual([])

  const { rows: apagados } = await banco.sql.query(
    'delete from public.dial_queue where id = $1 returning id',
    [id],
  )
  expect(apagados).toEqual([])
})

test('o operador lê e também não escreve', async () => {
  const id = await enfileirar(contaA)

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query(
    'select id from public.dial_queue where id = $1',
    [id],
  )
  expect(rows).toHaveLength(1)

  const { rows: alterados } = await banco.sql.query(
    `update public.dial_queue set run_at = now() where id = $1 returning id`,
    [id],
  )
  expect(alterados).toEqual([])
})

test('a conta vizinha e a sessão anônima recebem zero linha', async () => {
  const id = await enfileirar(contaA)

  await banco.comoUsuario(contaB.donoId)
  const { rows: daVizinha } = await banco.sql.query(
    'select id from public.dial_queue where id = $1',
    [id],
  )
  expect(daVizinha).toEqual([])

  await banco.comoAnonimo()
  const { rows: deNinguem } = await banco.sql.query(
    'select id from public.dial_queue',
  )
  expect(deNinguem).toEqual([])
})

test('a tabela não tem política de escrita nenhuma no catálogo', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ cmd: string }>(
    `select cmd from pg_policies
      where schemaname = 'public' and tablename = 'dial_queue'`,
  )
  // A ausência é o contrato da classe Servidor: política nova de escrita
  // reprova aqui antes de alguém descobrir pela fatura.
  expect(rows.map((linha) => linha.cmd)).toEqual(['SELECT'])
})

// A tentativa de discagem: o registro de toda decisão da guarda, inclusive a
// recusada (seção 3.5, T-05, T-04, RF-406).
//
// O que este arquivo prova:
//
// 1. **Os três índices de T-05 existem no catálogo, com as colunas na ordem
//    declarada.** É o teste que importa aqui, e a razão é que a falta não
//    apareceria de outro jeito: índice removido numa migração futura não
//    quebra consulta nenhuma — a guarda apenas passa a contar varrendo a
//    tabela, segurando o advisory lock, e ninguém percebe até a conta discar
//    em lote.
// 2. Toda tentativa entra, inclusive a recusada (RF-406): os dez desfechos da
//    coluna `outcome` são gravados um a um, e a lista do banco é exatamente
//    essa.
// 3. A correção de T-04: discagem de pessoa exige autor, discagem de rotina
//    exige autor nulo, e `actor` fora de `user` e `system` é recusado.
// 4. Classe Servidor da seção 3.9: o membro lê, e ninguém do cliente insere,
//    altera nem apaga — nem o dono da conta.
// 5. A conta vizinha recebe zero linha, e a sessão anônima também.
// 6. Apagar a chamada não devolve cota: `call_id` vira nulo e a tentativa fica.
//
// Referência: migração 20260922050000_tentativas_de_discagem.sql,
// docs/PRD-implementacao.md seções 3.5, 3.9 e 6, docs/revisao-tecnica.md T-04,
// T-05 e T-06, docs/PRD.md RF-406, RF-802, RF-803, RF-010 e RNF-12.

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
  readonly linhaId: string
  readonly telefone: string
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

  const telefone = `+55119900000${sufixo}`
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, $2, $3, 'cenario')
     returning id`,
    [id, `Lead de ${nome}`, telefone],
  )

  const { rows: linhas } = await banco.sql.query<{ id: string }>(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, $2, $3)
     returning id`,
    [id, `+55114000000${sufixo}`, `Linha de ${nome}`],
  )

  return {
    id,
    donoId,
    operadorId,
    leadId: leads[0]!.id,
    linhaId: linhas[0]!.id,
    telefone,
  }
}

/**
 * Insert mínimo pela sessão de serviço, que é o único caminho que a tabela tem:
 * `call_attempts` é da classe Servidor e não tem política de escrita de
 * cliente. Quem grava de verdade é `guard_dial` (US-058).
 */
async function semearTentativa(
  conta: Conta,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    lead_id: conta.leadId,
    phone_e164: conta.telefone,
    outcome: 'placed',
    actor: 'system',
    source: 'cron-speed-to-lead',
    ...extras,
  }

  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.call_attempts (${colunas.join(', ')})
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
  await banco.sql.query('delete from public.call_attempts')
  await banco.sql.query('delete from public.calls')
})

// Os três índices de T-05 -----------------------------------------------------------

/**
 * Nome do índice e as colunas na ordem em que a contagem da guarda as recorta.
 * A ordem é o contrato: `(account_id, phone_e164, attempted_at)` serve aos
 * passos 5 e 6, e qualquer outra ordem obrigaria a varrer a conta inteira.
 */
const INDICES_DA_GUARDA: { nome: string; colunas: string[]; passo: string }[] = [
  {
    nome: 'call_attempts_teto_da_conta',
    colunas: ['account_id', 'attempted_at'],
    passo: 'teto diário da conta (passo 7)',
  },
  {
    nome: 'call_attempts_teto_por_numero',
    colunas: ['account_id', 'phone_e164', 'attempted_at'],
    passo: 'intervalo mínimo e teto por número (passos 5 e 6)',
  },
  {
    nome: 'call_attempts_teto_da_linha',
    colunas: ['phone_line_id', 'attempted_at'],
    passo: 'teto da linha de origem (passo 8)',
  },
]

test.each(INDICES_DA_GUARDA)(
  '$nome existe com as colunas na ordem declarada — $passo',
  async ({ nome, colunas }) => {
    // Direto do catálogo, e não do texto do `indexdef`: é a ordem das colunas
    // no índice que faz a contagem do dia ser uma faixa lida de ponta a ponta.
    const { rows } = await banco.sql.query<{ coluna: string }>(
      `select a.attname as coluna
         from pg_index as i
         join pg_class as idx on idx.oid = i.indexrelid
        cross join lateral unnest(string_to_array(i.indkey::text, ' ')::smallint[])
              with ordinality as posicao(atributo, ordem)
         join pg_attribute as a
           on a.attrelid = i.indrelid and a.attnum = posicao.atributo
        where idx.relname = $1
        order by posicao.ordem`,
      [nome],
    )
    expect(rows.map((linha) => linha.coluna)).toEqual(colunas)
  },
)

test('os três índices da guarda são os que a tabela tem, além da chave primária', async () => {
  const { rows } = await banco.sql.query<{ nome: string }>(
    `select indexname as nome
       from pg_indexes
      where schemaname = 'public' and tablename = 'call_attempts'
      order by indexname`,
  )
  // A asserção do outro lado: índice a mais aqui é índice que ninguém declarou
  // qual contagem serve, e índice a menos derruba a lista acima.
  expect(rows.map((linha) => linha.nome)).toEqual([
    'call_attempts_pkey',
    ...INDICES_DA_GUARDA.map((indice) => indice.nome).sort(),
  ])
})

// Toda tentativa é gravada (RF-406) ---------------------------------------------------

const DESFECHOS = [
  'placed',
  'dialing_paused',
  'real_dialing_gate',
  'dnc_active',
  'outside_window',
  'min_interval',
  'daily_per_number',
  'daily_per_account',
  'daily_spend_cap',
  'no_phone_line',
]

test('os nove motivos de recusa e o placed entram, e a lista do banco é exatamente essa', async () => {
  // Varredura, e não casos escolhidos: motivo novo na migração entra nas
  // asserções sozinho, e motivo retirado derruba a segunda metade do teste.
  for (const desfecho of DESFECHOS) {
    const id = await semearTentativa(contaA, { outcome: desfecho })
    expect(id).toBeTruthy()
  }

  const { rows } = await banco.sql.query<{ total: number | string }>(
    'select count(*) as total from public.call_attempts',
  )
  // É isso que faz o teto diário significar alguma coisa: a recusada conta
  // tanto quanto a que saiu.
  expect(Number(rows[0]?.total)).toBe(DESFECHOS.length)

  const { rows: definicao } = await banco.sql.query<{ definicao: string }>(
    `select pg_get_constraintdef(c.oid) as definicao
       from pg_constraint as c
      where c.conname = 'call_attempts_outcome_check'`,
  )
  const citados = [
    ...(definicao[0]?.definicao ?? '').matchAll(/'([a-z_]+)'/g),
  ].map((achado) => achado[1]!)
  expect(new Set(citados)).toEqual(new Set(DESFECHOS))
})

test('desfecho fora da lista é recusado', async () => {
  await expect(
    semearTentativa(contaA, { outcome: 'recusada' }),
  ).rejects.toThrow(/call_attempts_outcome_check/i)
})

// A correção de T-04 --------------------------------------------------------------------

test('actor fora de user e system é recusado', async () => {
  // Não há `agent` aqui, ao contrário de audit_log: a Sarah conversa, não
  // disca.
  await expect(
    semearTentativa(contaA, { actor: 'agent', actor_id: null }),
  ).rejects.toThrow(/call_attempts_actor_check/i)

  await expect(
    semearTentativa(contaA, { actor: 'sarah', actor_id: null }),
  ).rejects.toThrow(/call_attempts_actor_check/i)
})

test('discagem de pessoa exige autor e discagem de rotina exige autor nulo', async () => {
  const dePessoa = await semearTentativa(contaA, {
    actor: 'user',
    actor_id: contaA.operadorId,
    source: 'manual',
  })
  expect(dePessoa).toBeTruthy()

  await expect(
    semearTentativa(contaA, { actor: 'user', actor_id: null, source: 'manual' }),
  ).rejects.toThrow(/call_attempts_autor_de_pessoa/i)

  // Autor numa discagem que ninguém pediu seria autoria inventada.
  await expect(
    semearTentativa(contaA, { actor: 'system', actor_id: contaA.donoId }),
  ).rejects.toThrow(/call_attempts_rotina_sem_autor/i)
})

test('a fonte da discagem não pode ser vazia', async () => {
  // `source` é o nome da rotina, e é ele que responde "quem mandou discar"
  // quando não há gente do outro lado (T-04).
  await expect(
    semearTentativa(contaA, { source: '   ' }),
  ).rejects.toThrow(/call_attempts_source_check/i)
})

// As réguas do número ---------------------------------------------------------------------

test('o número torto é recusado e o número é obrigatório', async () => {
  await expect(
    semearTentativa(contaA, { phone_e164: '5511990000001' }),
  ).rejects.toThrow(/call_attempts_phone_e164_check/i)

  await expect(
    semearTentativa(contaA, { phone_e164: null }),
  ).rejects.toThrow(/phone_e164/i)
})

test('o check do número é o mesmo de leads, letra por letra', async () => {
  const { rows } = await banco.sql.query<{ tabela: string; expressao: string }>(
    `select rel.relname as tabela, pg_get_constraintdef(c.oid) as expressao
       from pg_constraint as c
       join pg_class as rel on rel.oid = c.conrelid
      where c.conname in ('leads_phone_e164_check', 'call_attempts_phone_e164_check')
      order by rel.relname`,
  )
  expect(rows).toHaveLength(2)

  // Régua diferente faria o teto por número procurar uma forma do telefone que
  // a tabela de leads nunca escreve — e o teto deixaria de encontrar as
  // tentativas que ele mesmo gravou.
  const expressoes = rows.map((linha) => linha.expressao.replace(/\s+/g, ''))
  expect(expressoes[0]).toBe(expressoes[1])
})

// O livro-caixa do teto -------------------------------------------------------------------

test('apagar a chamada não apaga a tentativa: o call_id vira nulo', async () => {
  const { rows: chamadas } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, idempotency_key)
     values ($1, $2, 'discovery', 'outbound', 'tentativa-1')
     returning id`,
    [contaA.id, contaA.leadId],
  )
  const chamadaId = chamadas[0]!.id
  const tentativaId = await semearTentativa(contaA, { call_id: chamadaId })

  await banco.sql.query('delete from public.calls where id = $1', [chamadaId])

  const { rows } = await banco.sql.query<{ call_id: string | null }>(
    'select call_id from public.call_attempts where id = $1',
    [tentativaId],
  )
  // Cascata aqui devolveria cota para a conta: bastaria apagar chamadas para
  // voltar a discar no dia em que o teto já foi atingido.
  expect(rows).toHaveLength(1)
  expect(rows[0]?.call_id).toBeNull()
})

test('apagar a linha telefônica não apaga a tentativa', async () => {
  const { rows: linhas } = await banco.sql.query<{ id: string }>(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, '+5511400009999', 'Linha efêmera')
     returning id`,
    [contaA.id],
  )
  const linhaId = linhas[0]!.id
  const tentativaId = await semearTentativa(contaA, { phone_line_id: linhaId })

  await banco.sql.query('delete from public.phone_lines where id = $1', [linhaId])

  const { rows } = await banco.sql.query<{ phone_line_id: string | null }>(
    'select phone_line_id from public.call_attempts where id = $1',
    [tentativaId],
  )
  expect(rows[0]?.phone_line_id).toBeNull()
})

test('apagar o lead leva as tentativas junto (RF-808)', async () => {
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead efêmero', '+5511970000009', 'cenario')
     returning id`,
    [contaA.id],
  )
  const leadId = leads[0]!.id
  await semearTentativa(contaA, {
    lead_id: leadId,
    phone_e164: '+5511970000009',
  })

  await banco.sql.query('delete from public.leads where id = $1', [leadId])

  const { rows } = await banco.sql.query(
    'select id from public.call_attempts where lead_id = $1',
    [leadId],
  )
  // `phone_e164` aqui é dado pessoal do lead tanto quanto a transcrição é.
  expect(rows).toEqual([])
})

test('a tentativa para número de teste não precisa de lead', async () => {
  // Enquanto o portão da fatia está fechado (L-03), a discagem é para a lista
  // de números de teste, que não é lead de ninguém.
  const id = await semearTentativa(contaA, {
    lead_id: null,
    phone_e164: '+5511980000001',
  })
  expect(id).toBeTruthy()
})

// Isolamento (classe Servidor) -----------------------------------------------------------

test('o membro lê e o dono não insere, não altera e não apaga', async () => {
  const id = await semearTentativa(contaA, { outcome: 'daily_per_account' })

  await banco.comoUsuario(contaA.donoId)

  const { rows: lidos } = await banco.sql.query(
    'select id from public.call_attempts where id = $1',
    [id],
  )
  // Ler é de todo membro: é por estas linhas que a tela explica por que a
  // Sarah não ligou.
  expect(lidos).toHaveLength(1)

  // Inserir tentativa é desligar o teto por dentro, porque a contagem do teto é
  // a própria tabela.
  await expect(
    banco.sql.query(
      `insert into public.call_attempts
         (account_id, phone_e164, outcome, actor, source)
       values ($1, '+5511990000001', 'placed', 'system', 'inventada')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: alterados } = await banco.sql.query(
    `update public.call_attempts set outcome = 'placed' where id = $1 returning id`,
    [id],
  )
  expect(alterados).toEqual([])

  // Apagar é devolver cota que já foi gasta.
  const { rows: apagados } = await banco.sql.query(
    'delete from public.call_attempts where id = $1 returning id',
    [id],
  )
  expect(apagados).toEqual([])
})

test('o operador lê e também não escreve', async () => {
  const id = await semearTentativa(contaA)

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query(
    'select id from public.call_attempts where id = $1',
    [id],
  )
  expect(rows).toHaveLength(1)

  const { rows: alterados } = await banco.sql.query(
    `update public.call_attempts set source = 'manual' where id = $1 returning id`,
    [id],
  )
  expect(alterados).toEqual([])
})

test('a tabela não tem política de escrita nenhuma no catálogo', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ cmd: string }>(
    `select cmd from pg_policies
      where schemaname = 'public' and tablename = 'call_attempts'`,
  )
  // A ausência é o contrato da classe Servidor: política nova de escrita
  // reprova aqui antes de alguém descobrir pelo teto que parou de valer.
  expect(rows.map((linha) => linha.cmd)).toEqual(['SELECT'])
})

test('a conta vizinha recebe zero linha, e o anônimo também', async () => {
  await semearTentativa(contaA)
  await semearTentativa(contaB)

  await banco.comoUsuario(contaA.donoId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.call_attempts',
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.account_id).toBe(contaA.id)

  await banco.comoAnonimo()
  const { rows: semNada } = await banco.sql.query(
    'select id from public.call_attempts',
  )
  expect(semNada).toEqual([])
})

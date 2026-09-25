// A chamada: a tabela que registra cada ligação (seção 3.5).
//
// O que este arquivo prova:
//
// 1. O único por (account_id, idempotency_key) barra a segunda discagem da
//    mesma fonte, e deixa passar a mesma chave na conta vizinha. É a correção
//    de T-07, e sem ela a idempotência voltaria a depender de ler antes de
//    escrever.
// 2. Cada lista fechada recusa o valor de fora: propósito, sentido, estado,
//    origem da classificação, quem atendeu e motivo do fim.
// 3. Classe Servidor da seção 3.9: o membro lê, e ninguém do cliente insere,
//    altera nem apaga — nem o dono da conta.
// 4. A configuração `portuguese` responde no Postgres embarcado, e a busca por
//    palavra da transcrição encontra a chamada (L-15, RF-419).
// 5. A conta vizinha recebe zero linha, e a sessão anônima também.
// 6. `consent_records.call_id` ganhou a chave estrangeira que a US-049 deixou
//    declarada, e ela cascateia.
//
// Referência: migração 20260922040000_chamadas.sql,
// docs/PRD-implementacao.md seções 3.5, 3.9 e 4.2, docs/revisao-tecnica.md
// T-07, T-15, T-20, L-15 e L-23, docs/PRD.md RF-419, RF-418 e RF-810.

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
 * Insert mínimo pela sessão de serviço, que é o único caminho que a tabela tem:
 * `calls` é da classe Servidor e não tem política de escrita de cliente.
 */
async function semearChamada(
  conta: Conta,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    lead_id: conta.leadId,
    purpose: 'discovery',
    direction: 'outbound',
    idempotency_key: `discagem-${conta.id}`,
    ...extras,
  }

  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (${colunas.join(', ')})
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

// O único por (conta, chave) faz o resíduo do teste anterior derrubar o insert
// seguinte pela restrição errada, e a mensagem enganaria quem fosse ler.
beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.consent_records')
  await banco.sql.query('delete from public.calls')
})

// A idempotência (T-07) ---------------------------------------------------------

test('a segunda discagem da mesma fonte bate no único, e na conta vizinha entra', async () => {
  await semearChamada(contaA, { idempotency_key: 'fila:2026-09-22:lead-1' })

  // Sem esta restrição, "não discar duas vezes pela mesma fonte" dependeria de
  // ler antes de escrever — e as duas ligações sairiam de verdade.
  await expect(
    semearChamada(contaA, { idempotency_key: 'fila:2026-09-22:lead-1' }),
  ).rejects.toThrow(/calls_idempotencia_unica/i)

  const naVizinha = await semearChamada(contaB, {
    idempotency_key: 'fila:2026-09-22:lead-1',
  })
  expect(naVizinha).toBeTruthy()
})

test('chamada sem chave de idempotência é recusada', async () => {
  // Nula, o único deixaria passar quantas linhas quisessem: é a coluna que
  // sustenta T-07, e não uma anotação.
  await expect(
    semearChamada(contaA, { idempotency_key: null }),
  ).rejects.toThrow(/idempotency_key/i)

  await expect(
    semearChamada(contaA, { idempotency_key: '   ' }),
  ).rejects.toThrow(/calls_idempotency_key_check/i)
})

test('o único é por conta, e o catálogo confirma as duas colunas', async () => {
  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select pg_get_constraintdef(c.oid) as definicao
       from pg_constraint as c
      where c.conname = 'calls_idempotencia_unica'`,
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.definicao).toMatch(/UNIQUE \(account_id, idempotency_key\)/i)
})

// As listas fechadas -------------------------------------------------------------

const LISTAS_FECHADAS: {
  coluna: string
  restricao: string
  aceito: string
  recusado: string
}[] = [
  {
    coluna: 'purpose',
    restricao: 'calls_purpose_check',
    aceito: 'followup',
    recusado: 'descoberta',
  },
  {
    coluna: 'direction',
    restricao: 'calls_direction_check',
    aceito: 'rehearsal',
    recusado: 'saida',
  },
  {
    coluna: 'status',
    restricao: 'calls_status_check',
    aceito: 'in_progress',
    recusado: 'em_curso',
  },
  {
    coluna: 'classification_source',
    restricao: 'calls_classification_source_check',
    aceito: 'human',
    recusado: 'modelo',
  },
  {
    coluna: 'answered_by',
    restricao: 'calls_answered_by_check',
    aceito: 'machine',
    recusado: 'secretaria',
  },
  {
    coluna: 'end_reason',
    restricao: 'calls_end_reason_check',
    aceito: 'voicemail',
    recusado: 'desistiu',
  },
]

test.each(LISTAS_FECHADAS)(
  '$coluna recusa "$recusado" e aceita "$aceito"',
  async ({ coluna, restricao, aceito, recusado }) => {
    await expect(
      semearChamada(contaA, {
        [coluna]: recusado,
        idempotency_key: `fora-da-lista-${coluna}`,
      }),
    ).rejects.toThrow(new RegExp(restricao, 'i'))

    const id = await semearChamada(contaA, {
      [coluna]: aceito,
      idempotency_key: `dentro-da-lista-${coluna}`,
    })
    expect(id).toBeTruthy()
  },
)

const MOTIVOS_DO_FIM = [
  'completed',
  'voicemail',
  'max_duration',
  'dial_lost',
  'provider_lost',
  'canceled',
  'no_answer',
  'busy',
  'invalid_number',
  'transferred',
]

test('os dez motivos do fim entram, e a lista do banco é exatamente essa', async () => {
  // Varredura, e não casos escolhidos: motivo novo na migração entra nas
  // asserções sozinho, e motivo retirado derruba a segunda metade do teste.
  for (const motivo of MOTIVOS_DO_FIM) {
    const id = await semearChamada(contaA, {
      end_reason: motivo,
      idempotency_key: `fim-${motivo}`,
    })
    expect(id).toBeTruthy()
  }

  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select pg_get_constraintdef(c.oid) as definicao
       from pg_constraint as c
      where c.conname = 'calls_end_reason_check'`,
  )
  const citados = [...(rows[0]?.definicao ?? '').matchAll(/'([a-z_]+)'/g)].map(
    (achado) => achado[1]!,
  )
  expect(new Set(citados)).toEqual(new Set(MOTIVOS_DO_FIM))
})

// As demais réguas ----------------------------------------------------------------

test('o custo nasce em zero e não aceita negativo', async () => {
  const id = await semearChamada(contaA)
  const { rows } = await banco.sql.query<{ cost_cents: number }>(
    'select cost_cents from public.calls where id = $1',
    [id],
  )
  // A soma materializada de call_costs chega na US-052; até lá o padrão é o
  // valor, e ninguém o escreve à mão.
  expect(rows[0]?.cost_cents).toBe(0)

  await expect(
    banco.sql.query('update public.calls set cost_cents = -1 where id = $1', [id]),
  ).rejects.toThrow(/calls_cost_cents_check/i)
})

test('o número torto é recusado nos dois lados da ligação', async () => {
  await expect(
    semearChamada(contaA, {
      from_number: '5511990000001',
      idempotency_key: 'origem-torta',
    }),
  ).rejects.toThrow(/calls_from_number_check/i)

  await expect(
    semearChamada(contaA, {
      to_number: '+55 11 99000-0001',
      idempotency_key: 'destino-torto',
    }),
  ).rejects.toThrow(/calls_to_number_check/i)
})

test('o check do destino é o mesmo de leads, letra por letra', async () => {
  const { rows } = await banco.sql.query<{ tabela: string; expressao: string }>(
    `select rel.relname as tabela, pg_get_constraintdef(c.oid) as expressao
       from pg_constraint as c
       join pg_class as rel on rel.oid = c.conrelid
      where c.conname in ('leads_phone_e164_check', 'calls_to_number_check')`,
  )
  expect(rows).toHaveLength(2)

  // `to_number` é o número para o qual se discou, e o passo 3 da guarda compara
  // o do lead com a lista de bloqueio. Régua diferente faria o mesmo telefone
  // ter duas formas válidas no mesmo banco.
  const expressoes = rows.map((linha) =>
    linha.expressao
      .replace(linha.tabela === 'leads' ? 'phone_e164' : 'to_number', '')
      .replace(/\s+/g, ''),
  )
  expect(expressoes[0]).toBe(expressoes[1])
})

test('sentimento e nota ficam dentro da escala declarada', async () => {
  await expect(
    semearChamada(contaA, { sentiment: 1.5, idempotency_key: 'sentimento' }),
  ).rejects.toThrow(/calls_sentiment_check/i)

  await expect(
    semearChamada(contaA, { evaluation_score: 11, idempotency_key: 'nota' }),
  ).rejects.toThrow(/calls_evaluation_score_check/i)
})

test('transcrição que não é objeto é recusada', async () => {
  await expect(
    semearChamada(contaA, {
      transcript: '[]',
      idempotency_key: 'transcricao-vetor',
    }),
  ).rejects.toThrow(/calls_transcript_check/i)
})

// A busca dentro da transcrição (L-15, RF-419) ------------------------------------

test('a configuração portuguese responde neste Postgres', async () => {
  // Se um dia não responder, a coluna gerada não existe e a migração nem
  // aplica: este teste é o aviso antecipado, com a mensagem legível.
  const { rows } = await banco.sql.query<{ existe: boolean }>(
    `select exists (select 1 from pg_ts_config where cfgname = 'portuguese') as existe`,
  )
  expect(rows[0]?.existe).toBe(true)
})

test('a busca encontra a palavra da transcrição, flexionada e com acento', async () => {
  const id = await semearChamada(contaA, {
    idempotency_key: 'com-transcricao',
    transcript: JSON.stringify({
      turns: [
        { role: 'agent', text: 'Oi, aqui é a Sarah. Posso falar do orçamento?' },
        { role: 'lead', text: 'Pode mandar a proposta de contratação.' },
      ],
    }),
  })

  await semearChamada(contaA, {
    idempotency_key: 'sem-transcricao',
    transcript: JSON.stringify({ turns: [{ role: 'agent', text: 'Bom dia.' }] }),
  })

  const { rows } = await banco.sql.query<{ id: string }>(
    `select id from public.calls
      where transcript_tsv @@ plainto_tsquery('portuguese', $1)`,
    ['orçamentos'],
  )
  // Radical, e não literal: "orçamentos" acha "orçamento" porque a configuração
  // é a da língua em que a Sarah fala.
  expect(rows.map((linha) => linha.id)).toEqual([id])

  const { rows: porFlexao } = await banco.sql.query<{ id: string }>(
    `select id from public.calls
      where transcript_tsv @@ plainto_tsquery('portuguese', $1)`,
    ['contratar'],
  )
  expect(porFlexao.map((linha) => linha.id)).toEqual([id])
})

test('transcrição vazia ou de forma inesperada não derruba o insert', async () => {
  // Uma ligação que aconteceu vale mais do que a busca dentro dela.
  const vazia = await semearChamada(contaA, { idempotency_key: 'vazia' })
  const torta = await semearChamada(contaA, {
    idempotency_key: 'torta',
    transcript: JSON.stringify({ turns: 'ainda não puxada' }),
  })

  const { rows } = await banco.sql.query<{ id: string; tsv: string }>(
    'select id, transcript_tsv::text as tsv from public.calls where id = any($1)',
    [[vazia, torta]],
  )
  expect(rows).toHaveLength(2)
  expect(rows.every((linha) => linha.tsv === '')).toBe(true)
})

test('o índice GIN da transcrição existe', async () => {
  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select indexdef as definicao
       from pg_indexes
      where schemaname = 'public' and indexname = 'calls_transcricao_busca'`,
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.definicao).toMatch(/using gin/i)
})

// Os índices que as rotinas usam ---------------------------------------------------

test('os três índices da seção 3.5 existem, com a forma que a consulta pede', async () => {
  const { rows } = await banco.sql.query<{ nome: string; definicao: string }>(
    `select indexname as nome, indexdef as definicao
       from pg_indexes
      where schemaname = 'public' and tablename = 'calls'`,
  )
  const porNome = new Map(rows.map((linha) => [linha.nome, linha.definicao]))

  expect(porNome.get('calls_lista_da_conta')).toMatch(
    /account_id, started_at DESC/i,
  )
  // Parcial: a varredura periódica e o freio de emergência só olham para as
  // chamadas que ainda não terminaram.
  expect(porNome.get('calls_em_curso')).toMatch(/where.*queued.*in_progress/is)
  expect(porNome.get('calls_conversa_do_provedor_unica')).toMatch(
    /create unique index/i,
  )
})

test('duas chamadas com a mesma conversa do provedor colidem, mesmo em contas diferentes', async () => {
  await semearChamada(contaA, {
    idempotency_key: 'conversa-a',
    provider_conversation_id: 'conv_123',
  })

  // Global e não por conta de propósito: é por este identificador que as sete
  // ferramentas resolvem a chamada, e duplicata faria a ferramenta escrever na
  // conta errada.
  await expect(
    semearChamada(contaB, {
      idempotency_key: 'conversa-b',
      provider_conversation_id: 'conv_123',
    }),
  ).rejects.toThrow(/calls_conversa_do_provedor_unica/i)

  // Nula não conflita: o único é parcial, e a chamada em fila ainda não tem
  // conversa no provedor.
  const semConversa = await semearChamada(contaA, { idempotency_key: 'sem-conversa-1' })
  const outraSemConversa = await semearChamada(contaA, {
    idempotency_key: 'sem-conversa-2',
  })
  expect(semConversa).not.toBe(outraSemConversa)
})

// Isolamento (classe Servidor) ------------------------------------------------------

test('o membro lê e o dono não insere, não altera e não apaga', async () => {
  const id = await semearChamada(contaA)

  await banco.comoUsuario(contaA.donoId)

  const { rows: lidos } = await banco.sql.query(
    'select id from public.calls where id = $1',
    [id],
  )
  expect(lidos).toHaveLength(1)

  // Nem o dono escreve: uma política de insert de cliente daria à conta o poder
  // de inventar uma chamada que nunca houve, com transcrição e custo.
  await expect(
    banco.sql.query(
      `insert into public.calls (account_id, purpose, direction, idempotency_key)
       values ($1, 'discovery', 'outbound', 'inventada')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: alterados } = await banco.sql.query(
    `update public.calls set status = 'ended' where id = $1 returning id`,
    [id],
  )
  expect(alterados).toEqual([])

  const { rows: apagados } = await banco.sql.query(
    'delete from public.calls where id = $1 returning id',
    [id],
  )
  expect(apagados).toEqual([])
})

test('o operador lê e também não escreve', async () => {
  const id = await semearChamada(contaA)

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query('select id from public.calls where id = $1', [
    id,
  ])
  // Ler é de todo membro, inclusive do viewer: a ficha da chamada é a própria
  // entrega da fatia.
  expect(rows).toHaveLength(1)

  const { rows: alterados } = await banco.sql.query(
    `update public.calls set end_reason = 'completed' where id = $1 returning id`,
    [id],
  )
  expect(alterados).toEqual([])
})

test('a tabela não tem política de escrita nenhuma no catálogo', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ cmd: string }>(
    `select cmd from pg_policies where schemaname = 'public' and tablename = 'calls'`,
  )
  // A ausência é o contrato da classe Servidor, e é ela que este teste guarda:
  // política nova de escrita reprova aqui antes de alguém descobrir pela tela.
  expect(rows.map((linha) => linha.cmd)).toEqual(['SELECT'])
})

test('a conta vizinha recebe zero linha, e o anônimo também', async () => {
  await semearChamada(contaA, { idempotency_key: 'da-a' })
  await semearChamada(contaB, { idempotency_key: 'da-b' })

  await banco.comoUsuario(contaA.donoId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.calls',
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.account_id).toBe(contaA.id)

  await banco.comoAnonimo()
  const { rows: semNada } = await banco.sql.query('select id from public.calls')
  expect(semNada).toEqual([])
})

// Sem trilha ------------------------------------------------------------------------

test('a chamada não gera linha de auditoria', async () => {
  await banco.sql.query('delete from public.audit_log')
  const id = await semearChamada(contaA)
  await banco.sql.query(`update public.calls set status = 'ended' where id = $1`, [id])

  const { rows } = await banco.sql.query<{ total: number | string }>(
    `select count(*) as total from public.audit_log where target_type = 'calls'`,
  )
  // Cada chamada passa por fila, toque, conversa e finalização: a trilha teria
  // dezenas de linhas por ligação, nenhuma com autor humano. O que precisa de
  // autor é a decisão de discar, e essa call-place registra.
  expect(Number(rows[0]?.total)).toBe(0)
})

// O par que a US-049 deixou declarado ------------------------------------------------

test('consent_records.call_id aponta para calls e cascateia', async () => {
  const id = await semearChamada(contaA)

  await banco.sql.query(
    `insert into public.consent_records (account_id, call_id, kind, granted)
     values ($1, $2, 'recording', true)`,
    [contaA.id, id],
  )

  // Antes desta migração a coluna guardava qualquer uuid; agora o banco confere.
  await expect(
    banco.sql.query(
      `insert into public.consent_records (account_id, call_id, kind, granted)
       values ($1, gen_random_uuid(), 'recording', true)`,
      [contaA.id],
    ),
  ).rejects.toThrow(/consent_records_call_id_fkey/i)

  await banco.sql.query('delete from public.calls where id = $1', [id])
  const { rows } = await banco.sql.query('select id from public.consent_records')
  // A prova do consentimento é um trecho da transcrição da chamada: sem a
  // chamada, o registro apontaria para nada.
  expect(rows).toEqual([])
})

test('apagar o lead leva a chamada junto (RF-808)', async () => {
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead efêmero', '+5511970000009', 'cenario')
     returning id`,
    [contaA.id],
  )
  const leadId = leads[0]!.id
  await semearChamada(contaA, { lead_id: leadId, idempotency_key: 'do-efemero' })

  await banco.sql.query('delete from public.leads where id = $1', [leadId])

  const { rows } = await banco.sql.query(
    'select id from public.calls where lead_id = $1',
    [leadId],
  )
  // A transcrição é o dado mais pessoal desta tabela, e RF-808 apaga todos os
  // dados do lead.
  expect(rows).toEqual([])
})

// O registro de cada ferramenta acionada e a chamada em curso sem a transcrição
// junto (seção 3.5, T-02, R-08).
//
// O que este arquivo prova:
//
// 1. **O único de (call_id, tool, at)**, que é a idempotência de
//    `call-finalize`: reler a mesma transcrição encontra as mesmas invocações
//    de sistema, e a segunda leitura bate na restrição em vez de duplicar a
//    linha. E o instante separa duas invocações legítimas da mesma ferramenta
//    na mesma chamada, que é o caso normal de `tool-availability`.
// 2. **O prefixo `system:`**, que é o que separa o que executamos do que o
//    provedor executou (T-02). A lista fechada de dez se confere contra o
//    catálogo, nos dois sentidos: ferramenta retirada da migração derruba a
//    varredura, ferramenta acrescentada sem teste derruba a comparação.
//    A ferramenta que o provedor executou e que ainda não sabemos ler entra
//    com o prefixo e o nome que veio (migração
//    20260923000000_ferramenta_desconhecida.sql): perder o registro é pior do
//    que guardar um nome sem tradução. O prefixo continua obrigatório, e a
//    régua do nome é a mesma de `call-finalize`.
// 3. **Classe Servidor da seção 3.9** nas duas tabelas: o membro lê, e ninguém
//    do cliente insere, altera nem apaga — nem o dono da conta.
// 4. **`call_live` é espelho mantido por gatilho**: nasce com a chamada,
//    acompanha a mudança de status e some quando a ligação termina.
// 5. **A transcrição nunca entra em `call_live`** (R-08), e o efeito se mede
//    por duas asserções que são a mesma regra vista de dois lados: nenhuma
//    coluna da tabela guarda texto de conversa (conjunto exato, lido do
//    catálogo), e um update que só mexe em `calls.transcript` não reescreve a
//    linha — nem seus valores, nem sua versão no `xmin`, que é o que a
//    replicação lógica emitiria.
// 6. A conta vizinha recebe zero linha nas duas tabelas.
//
// Referência: migração 20260922070000_registro_de_ferramentas.sql,
// docs/PRD-implementacao.md seções 3.5, 3.9, 4.6 e 5,
// docs/revisao-tecnica.md T-02, T-03 e R-08, docs/PRD.md seção 9.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { NOME_DE_SISTEMA } from '../../supabase/functions/call-finalize/finalizacao.ts'
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

/** As sete nossas (docs/PRD.md seção 9) e as três do provedor (T-02, T-03). */
const NOSSAS_FERRAMENTAS = [
  'tool-availability',
  'tool-book-meeting',
  'tool-confirm-meeting',
  'tool-reschedule',
  'tool-qualify',
  'tool-transfer',
  'tool-dnc',
]

const FERRAMENTAS_DO_PROVEDOR = [
  'system:end_call',
  'system:transfer_to_number',
  'system:voicemail_detection',
]

/** As seis colunas de R-08, mais a chave. Nenhuma delas guarda conversa. */
const COLUNAS_DE_CALL_LIVE = [
  'account_id',
  'call_id',
  'duration_sec',
  'lead_id',
  'purpose',
  'started_at',
  'status',
]

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
 * Chamada pela sessão de serviço, que é o único caminho que `calls` tem: a
 * tabela é da classe Servidor e não tem política de escrita de cliente.
 */
async function semearChamada(
  conta: Conta,
  chave: string,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    lead_id: conta.leadId,
    purpose: 'discovery',
    direction: 'outbound',
    idempotency_key: chave,
    ...extras,
  }

  const colunas = Object.keys(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    Object.values(campos),
  )
  return rows[0]!.id
}

/**
 * Invocação pela sessão de serviço, pelo mesmo motivo: quem grava são as
 * próprias ferramentas e `call-finalize`, que lê as de sistema da transcrição.
 */
async function semearInvocacao(
  conta: Conta,
  chamadaId: string,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    call_id: chamadaId,
    tool: 'tool-qualify',
    ...extras,
  }

  const colunas = Object.keys(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.call_tool_invocations (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    Object.values(campos),
  )
  return rows[0]!.id
}

interface LinhaViva {
  readonly account_id: string
  readonly status: string
  readonly purpose: string
  readonly lead_id: string | null
  readonly started_at: string
  readonly duration_sec: number | null
  /** A versão da linha. É ela que a replicação lógica emitiria de novo. */
  readonly versao: string
}

async function lerLinhaViva(chamadaId: string): Promise<LinhaViva | undefined> {
  const { rows } = await banco.sql.query<LinhaViva>(
    `select account_id, status, purpose, lead_id, started_at, duration_sec,
            xmin::text as versao
       from public.call_live
      where call_id = $1`,
    [chamadaId],
  )
  return rows[0]
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
  await banco.sql.query('delete from public.call_tool_invocations')
  // `call_live` sai junto por cascata: a linha é espelho da chamada.
  await banco.sql.query('delete from public.calls')
})

// A idempotência de call-finalize (T-02) ---------------------------------------

test('reler a mesma transcrição não duplica a invocação', async () => {
  // O caso de verdade: a finalização roda por duas vias — o aviso do provedor e
  // a varredura periódica — e as duas leem a mesma transcrição. A segunda
  // encontra a mesma invocação de sistema, com o mesmo instante.
  const chamadaId = await semearChamada(contaA, 'unico-1')
  const instante = '2026-09-22T14:05:31Z'

  await semearInvocacao(contaA, chamadaId, {
    tool: 'system:end_call',
    at: instante,
  })

  await expect(
    semearInvocacao(contaA, chamadaId, {
      tool: 'system:end_call',
      at: instante,
    }),
  ).rejects.toThrow(/call_tool_invocations_unica/i)
})

test('a mesma ferramenta em dois instantes são duas invocações', async () => {
  // `tool-availability` é chamada de novo quando o horário oferecido acabou de
  // ser preenchido (T-08). Duas linhas é o certo; uma seria perder a segunda
  // consulta na contagem por ferramenta.
  const chamadaId = await semearChamada(contaA, 'unico-2')

  await semearInvocacao(contaA, chamadaId, {
    tool: 'tool-availability',
    at: '2026-09-22T14:05:31Z',
  })
  await semearInvocacao(contaA, chamadaId, {
    tool: 'tool-availability',
    at: '2026-09-22T14:06:02Z',
  })

  const { rows } = await banco.sql.query(
    'select id from public.call_tool_invocations where call_id = $1',
    [chamadaId],
  )
  expect(rows).toHaveLength(2)
})

test('a mesma ferramenta no mesmo instante em duas chamadas convive', async () => {
  const primeira = await semearChamada(contaA, 'unico-3-a')
  const segunda = await semearChamada(contaA, 'unico-3-b')
  const instante = '2026-09-22T14:05:31Z'

  await semearInvocacao(contaA, primeira, { at: instante })
  const outra = await semearInvocacao(contaA, segunda, { at: instante })

  expect(outra).toBeTruthy()
})

// O prefixo que separa quem executou (T-02, T-03) ------------------------------

test('as três do provedor entram prefixadas, e as sete nossas sem prefixo', async () => {
  const chamadaId = await semearChamada(contaA, 'ferramentas')

  for (const ferramenta of [...NOSSAS_FERRAMENTAS, ...FERRAMENTAS_DO_PROVEDOR]) {
    const id = await semearInvocacao(contaA, chamadaId, { tool: ferramenta })
    expect(id).toBeTruthy()
  }

  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select pg_get_constraintdef(c.oid) as definicao
       from pg_constraint as c
      where c.conname = 'call_tool_invocations_tool_check'`,
  )
  const citadas = [
    ...(rows[0]?.definicao ?? '').matchAll(/'([a-z_:-]+)'/g),
  ].map((achado) => achado[1]!)

  // A asserção do outro lado: ferramenta retirada da migração derruba a
  // varredura acima, e ferramenta acrescentada sem teste derruba esta.
  expect(new Set(citadas)).toEqual(
    new Set([...NOSSAS_FERRAMENTAS, ...FERRAMENTAS_DO_PROVEDOR]),
  )
})

test('a ferramenta do provedor sem o prefixo é recusada', async () => {
  // Sem o prefixo, o encerramento do provedor e uma ferramenta nossa ficariam
  // indistinguíveis no mesmo relatório.
  const chamadaId = await semearChamada(contaA, 'sem-prefixo')

  await expect(
    semearInvocacao(contaA, chamadaId, { tool: 'end_call' }),
  ).rejects.toThrow(/call_tool_invocations_tool_check/i)

  await expect(
    semearInvocacao(contaA, chamadaId, { tool: 'system:tool-qualify' }),
  ).rejects.toThrow(/call_tool_invocations_tool_check/i)
})

test('a ferramenta desconhecida do provedor entra com o prefixo e o nome que veio', async () => {
  const chamadaId = await semearChamada(contaA, 'desconhecida')

  for (const ferramenta of ['system:skip_turn', 'system:language_detection', 'system:v2.play_tone']) {
    const id = await semearInvocacao(contaA, chamadaId, { tool: ferramenta })
    expect(id).toBeTruthy()
  }
})

test('sem o prefixo, com nome vazio ou fora da régua, a desconhecida é recusada', async () => {
  const chamadaId = await semearChamada(contaA, 'desconhecida-recusada')

  for (const ferramenta of [
    'skip_turn',
    'tool-inventada',
    'system:',
    'system:com espaço',
    'system:tool-qualify',
    `system:${'a'.repeat(101)}`,
  ]) {
    await expect(
      semearInvocacao(contaA, chamadaId, { tool: ferramenta }),
    ).rejects.toThrow(/call_tool_invocations_tool_check/i)
  }
})

test('a régua do nome desconhecido é a mesma no banco e em call-finalize', async () => {
  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select pg_get_constraintdef(c.oid) as definicao
       from pg_constraint as c
      where c.conname = 'call_tool_invocations_tool_check'`,
  )
  // `^[...]{1,100}$` no módulo é `^system:[...]{1,100}$` na restrição.
  expect(rows[0]?.definicao).toContain(`'^system:${NOME_DE_SISTEMA.source.slice(1)}'`)
})

// As réguas da invocação -------------------------------------------------------

test('request e response nascem objeto e recusam outra forma', async () => {
  const chamadaId = await semearChamada(contaA, 'formas')
  const id = await semearInvocacao(contaA, chamadaId)

  const { rows } = await banco.sql.query<{
    request: unknown
    response: unknown
  }>(
    'select request, response from public.call_tool_invocations where id = $1',
    [id],
  )
  expect(rows[0]?.request).toEqual({})
  expect(rows[0]?.response).toEqual({})

  await expect(
    semearInvocacao(contaA, chamadaId, {
      tool: 'tool-dnc',
      request: JSON.stringify([1, 2]),
    }),
  ).rejects.toThrow(/call_tool_invocations_request_check/i)
})

test('latência negativa e erro em branco são recusados', async () => {
  const chamadaId = await semearChamada(contaA, 'reguas')

  await expect(
    semearInvocacao(contaA, chamadaId, { latency_ms: -1 }),
  ).rejects.toThrow(/call_tool_invocations_latency_ms_check/i)

  // Erro que existe e não diz qual vira falha sem causa na contagem.
  await expect(
    semearInvocacao(contaA, chamadaId, { error: '   ' }),
  ).rejects.toThrow(/call_tool_invocations_error_check/i)

  // Nulo nos dois é o caso das três do provedor, que não cronometramos.
  const id = await semearInvocacao(contaA, chamadaId, {
    tool: 'system:voicemail_detection',
    latency_ms: null,
    error: null,
  })
  expect(id).toBeTruthy()
})

test('invocação da conta B pendurada numa chamada da conta A é recusada', async () => {
  const daA = await semearChamada(contaA, 'chave-composta')

  await expect(semearInvocacao(contaB, daA)).rejects.toThrow(
    /call_tool_invocations_da_chamada_da_conta/i,
  )
})

test('apagar a chamada leva as invocações junto', async () => {
  const chamadaId = await semearChamada(contaA, 'cascata')
  await semearInvocacao(contaA, chamadaId)

  await banco.sql.query('delete from public.calls where id = $1', [chamadaId])

  const { rows } = await banco.sql.query(
    'select id from public.call_tool_invocations where call_id = $1',
    [chamadaId],
  )
  expect(rows).toEqual([])
})

// O espelho da chamada viva (R-08) ---------------------------------------------

test('a linha viva nasce com a chamada', async () => {
  const chamadaId = await semearChamada(contaA, 'viva-1')

  const viva = await lerLinhaViva(chamadaId)
  expect(viva?.status).toBe('queued')
  expect(viva?.purpose).toBe('discovery')
  expect(viva?.lead_id).toBe(contaA.leadId)
  expect(viva?.account_id).toBe(contaA.id)
  expect(viva?.started_at).toBeTruthy()
})

test('a linha viva acompanha a mudança de status', async () => {
  const chamadaId = await semearChamada(contaA, 'viva-2')

  for (const status of ['ringing', 'in_progress']) {
    await banco.sql.query('update public.calls set status = $2 where id = $1', [
      chamadaId,
      status,
    ])
    expect((await lerLinhaViva(chamadaId))?.status).toBe(status)
  }

  await banco.sql.query(
    'update public.calls set duration_sec = 42 where id = $1',
    [chamadaId],
  )
  expect((await lerLinhaViva(chamadaId))?.duration_sec).toBe(42)
})

test('a linha viva some quando a chamada termina', async () => {
  for (const [chave, fim] of [
    ['viva-3-ended', 'ended'],
    ['viva-3-failed', 'failed'],
  ] as const) {
    const chamadaId = await semearChamada(contaA, chave)
    expect(await lerLinhaViva(chamadaId)).toBeDefined()

    await banco.sql.query('update public.calls set status = $2 where id = $1', [
      chamadaId,
      fim,
    ])
    // A assinatura é da tela de acompanhamento, e não do histórico: chamada
    // encerrada que ficasse aqui carregaria o passado inteiro em cada
    // assinatura nova.
    expect(await lerLinhaViva(chamadaId)).toBeUndefined()
  }
})

test('chamada que nasce encerrada não cria linha viva', async () => {
  const chamadaId = await semearChamada(contaA, 'viva-4', {
    status: 'failed',
    end_reason: 'invalid_number',
  })
  expect(await lerLinhaViva(chamadaId)).toBeUndefined()
})

test('a transcrição não entra em call_live, nem por coluna nem por evento', async () => {
  const chamadaId = await semearChamada(contaA, 'viva-5')
  await banco.sql.query(
    `update public.calls set status = 'in_progress' where id = $1`,
    [chamadaId],
  )
  const antes = await lerLinhaViva(chamadaId)
  expect(antes).toBeDefined()

  await banco.sql.query(
    'update public.calls set transcript = $2::jsonb where id = $1',
    [
      chamadaId,
      JSON.stringify({
        turns: [
          { role: 'agent', text: 'oi, aqui é a Sarah', at: '2026-09-22T14:00:00Z' },
          { role: 'lead', text: 'oi, tudo bem', at: '2026-09-22T14:00:04Z' },
        ],
      }),
    ],
  )

  const depois = await lerLinhaViva(chamadaId)
  // Nem os valores mudam, nem a versão da linha: com `update` seco no lugar do
  // `update of`, o `xmin` mudaria a cada turno de conversa e a replicação
  // lógica emitiria um evento por turno para cada navegador aberto.
  expect(depois).toEqual(antes)

  // E a transcrição chegou mesmo, para que o teste não passe por engano.
  const { rows } = await banco.sql.query<{ total: number | string }>(
    `select jsonb_array_length(transcript->'turns') as total
       from public.calls where id = $1`,
    [chamadaId],
  )
  expect(Number(rows[0]?.total)).toBe(2)
})

test('nenhuma coluna de call_live guarda texto de conversa', async () => {
  // O conjunto exato, e não só a ausência de `transcript`: acrescentar coluna
  // aqui é decisão sobre o que trafega em toda atualização de toda chamada em
  // curso, para todo navegador aberto na tela de acompanhamento.
  const { rows } = await banco.sql.query<{ coluna: string }>(
    `select a.attname as coluna
       from pg_attribute as a
       join pg_class as c on c.oid = a.attrelid
       join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'call_live'
        and a.attnum > 0
        and not a.attisdropped
      order by a.attname`,
  )
  expect(rows.map((linha) => linha.coluna)).toEqual(COLUNAS_DE_CALL_LIVE)
})

test('call_live é tabela, e não visão: a assinatura observa tabela', async () => {
  const { rows } = await banco.sql.query<{ tipo: string }>(
    `select c.relkind as tipo
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'call_live'`,
  )
  expect(rows[0]?.tipo).toBe('r')
})

// Isolamento (classe Servidor) -------------------------------------------------

test('o membro lê a invocação e nem o dono escreve nela', async () => {
  const chamadaId = await semearChamada(contaA, 'isolamento-1')
  const id = await semearInvocacao(contaA, chamadaId, { latency_ms: 310 })

  await banco.comoUsuario(contaA.donoId)

  const { rows: lidos } = await banco.sql.query(
    'select id from public.call_tool_invocations where id = $1',
    [id],
  )
  expect(lidos).toHaveLength(1)

  // Inserir aqui seria inventar que uma ferramenta rodou.
  await expect(
    banco.sql.query(
      `insert into public.call_tool_invocations (account_id, call_id, tool)
       values ($1, $2, 'tool-dnc')`,
      [contaA.id, chamadaId],
    ),
  ).rejects.toThrow(/row-level security/i)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: alterados } = await banco.sql.query(
    'update public.call_tool_invocations set latency_ms = 1 where id = $1 returning id',
    [id],
  )
  expect(alterados).toEqual([])

  // Apagar seria esconder que a ferramenta rodou.
  const { rows: apagados } = await banco.sql.query(
    'delete from public.call_tool_invocations where id = $1 returning id',
    [id],
  )
  expect(apagados).toEqual([])
})

test('o operador lê a chamada viva e não escreve nela', async () => {
  const chamadaId = await semearChamada(contaA, 'isolamento-2')

  await banco.comoUsuario(contaA.operadorId)

  const { rows: lidos } = await banco.sql.query(
    'select call_id from public.call_live where call_id = $1',
    [chamadaId],
  )
  expect(lidos).toHaveLength(1)

  // Insert de cliente faria aparecer na tela uma ligação que não existe.
  await expect(
    banco.sql.query(
      `insert into public.call_live
         (call_id, account_id, status, purpose, started_at)
       values ($1, $2, 'in_progress', 'discovery', now())`,
      [chamadaId, contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  const { rows: apagados } = await banco.sql.query(
    'delete from public.call_live where call_id = $1 returning call_id',
    [chamadaId],
  )
  expect(apagados).toEqual([])
})

test('a conta vizinha recebe zero linha nas duas tabelas', async () => {
  const daA = await semearChamada(contaA, 'vizinha-a')
  await semearInvocacao(contaA, daA, { tool: 'tool-transfer' })
  const daB = await semearChamada(contaB, 'vizinha-b')
  await semearInvocacao(contaB, daB, { tool: 'tool-dnc' })

  await banco.comoUsuario(contaA.donoId)

  const { rows: invocacoes } = await banco.sql.query<{ call_id: string }>(
    'select call_id from public.call_tool_invocations',
  )
  expect(invocacoes.map((linha) => linha.call_id)).toEqual([daA])

  const { rows: vivas } = await banco.sql.query<{ call_id: string }>(
    'select call_id from public.call_live',
  )
  expect(vivas.map((linha) => linha.call_id)).toEqual([daA])
})

test('o anônimo não vê nenhuma das duas', async () => {
  const chamadaId = await semearChamada(contaA, 'anonimo')
  await semearInvocacao(contaA, chamadaId)

  await banco.comoAnonimo()

  const { rows: invocacoes } = await banco.sql.query(
    'select id from public.call_tool_invocations',
  )
  expect(invocacoes).toEqual([])

  const { rows: vivas } = await banco.sql.query(
    'select call_id from public.call_live',
  )
  expect(vivas).toEqual([])
})

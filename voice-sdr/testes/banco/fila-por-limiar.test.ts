// A fila alimentada pelos limiares da conta, pelo caminho do dado (US-141,
// RF-909, RF-915, T-16). `finalizarChamada` roda de verdade com a porta sobre o
// PGlite (`testes/auxiliares/porta-da-finalizacao.ts`): leitura dos limiares
// em `account_settings`, cálculo por `_shared/fila/gatilhos.ts`, gravação por
// `registrar_item_de_fila` e a sequência de falhas por `falhas_consecutivas`.
//
// O que este arquivo prova:
//
// 1. **O quinto critério de aceite da F4**: a mesma chamada, com sentimento
//    -0,6, gera item na conta com o piso em -0,5 e não gera na conta com o
//    piso em -0,8. Duas contas, e não uma conta com o piso trocado no meio,
//    para a prova não depender de ordem entre os testes.
// 2. **O sentimento chega à chamada e ao lead com a fonte**: `tool` quando veio
//    da ferramenta, `backfill` quando veio do modelo da retaguarda.
// 3. **Mudar o limiar não reescreve a fila**: o item aberto continua aberto,
//    com o limiar que o criou em `threshold_snapshot`, e a chamada seguinte já
//    obedece ao limiar novo.
// 4. **Critério reprovado vira item**, pelo que a retaguarda gravou em
//    `calls.evaluation`.
// 5. **Três tentativas seguidas sem atender** ao mesmo número, contadas em
//    `call_attempts`, viram item com a chave do número e do dia da conta.
// 6. **Duas finalizações da mesma chamada não duplicam item**: a primeira cai
//    antes de `finalized_at`, a segunda volta depois dos 5 minutos, e o único
//    parcial barra o segundo registro.
// 7. **O ensaio não gera item** nem toca o lead (T-16).

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import {
  finalizarChamada,
  VALIDADE_DA_REIVINDICACAO_MS,
  type PortaDaFinalizacao,
} from '../../supabase/functions/call-finalize/finalizacao.ts'
import {
  INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS,
  TRANSCRICOES_DE_EXEMPLO,
} from '../../supabase/functions/call-finalize/transcricoes-de-exemplo.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'
import { portaDaFinalizacaoSobreOBanco, type AjustesDaPorta } from '../auxiliares/porta-da-finalizacao.ts'

const SEGREDO = 'segredo-interno-do-teste'
const INICIO_MS = INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS * 1000
const AGORA = new Date(INICIO_MS + 5 * 60 * 1000).toISOString()

const ATENDIDA = TRANSCRICOES_DE_EXEMPLO.find((f) => f.nome === 'sem nenhuma invocação')!
const CAIXA_POSTAL = TRANSCRICOES_DE_EXEMPLO.find((f) => f.nome === 'caixa postal')!

interface Conta {
  readonly id: string
  readonly leadId: string
  readonly telefone: string
}

let banco: BancoDeTeste
let comPisoMeio: Conta
let comPisoBaixo: Conta
let sequencia = 0

async function criarConta(nome: string, telefone: string, piso: number): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>('insert into public.accounts (name) values ($1) returning id', [
    nome,
  ])
  const id = rows[0]!.id
  await banco.sql.query('update public.account_settings set sentiment_floor = $2 where account_id = $1', [id, piso])
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Marcos Ferreira', $2, 'cenario') returning id`,
    [id, telefone],
  )
  return { id, leadId: leads[0]!.id, telefone }
}

interface Semente {
  readonly direcao?: 'outbound' | 'rehearsal'
  /** O que `tool-qualify` gravou durante a conversa. */
  readonly sentimentoDaFerramenta?: number
  /** A tentativa em `call_attempts` que discou a chamada, e quando. */
  readonly tentativaEm?: number
}

/** A chamada em curso, semeada como serviço. */
async function semearChamada(conta: Conta, semente: Semente = {}): Promise<string> {
  sequencia += 1
  const classificacao =
    semente.sentimentoDaFerramenta === undefined
      ? null
      : JSON.stringify({ stage_key: 'qualificado', sentiment: semente.sentimentoDaFerramenta })
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, status, provider_conversation_id, idempotency_key, started_at,
        to_number, classification, classification_source)
     values ($1, $2, 'discovery', $3, 'ringing', $4, $5, $6, $7, coalesce($8::jsonb, '{}'::jsonb), $9)
     returning id`,
    [
      conta.id, conta.leadId, semente.direcao ?? 'outbound', `conv_fila_${sequencia}`, `fila-${sequencia}`,
      new Date(INICIO_MS).toISOString(), conta.telefone, classificacao, classificacao === null ? null : 'tool',
    ],
  )
  const chamadaId = rows[0]!.id
  if (semente.tentativaEm !== undefined) await tentativa(conta, chamadaId, semente.tentativaEm)
  return chamadaId
}

async function tentativa(conta: Conta, chamadaId: string | null, minutosAntes: number): Promise<void> {
  await banco.sql.query(
    `insert into public.call_attempts
       (account_id, lead_id, phone_e164, outcome, actor, source, call_id, attempted_at)
     values ($1, $2, $3, 'placed', 'system', 'cron-dial', $4, $5)`,
    [conta.id, conta.leadId, conta.telefone, chamadaId, new Date(INICIO_MS - minutosAntes * 60_000).toISOString()],
  )
}

/** Uma tentativa anterior que saiu e caiu na caixa postal. */
async function falhaAnterior(conta: Conta, minutosAntes: number): Promise<void> {
  sequencia += 1
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (account_id, lead_id, purpose, direction, status, answered_by, idempotency_key, started_at)
     values ($1, $2, 'discovery', 'outbound', 'ended', 'machine', $3, $4) returning id`,
    [conta.id, conta.leadId, `fila-anterior-${sequencia}`, new Date(INICIO_MS - minutosAntes * 60_000).toISOString()],
  )
  await tentativa(conta, rows[0]!.id, minutosAntes)
}

function finalizar(chamadaId: string, porta: PortaDaFinalizacao, agora = AGORA) {
  return finalizarChamada({ metodo: 'POST', chamadaId, segredoInterno: SEGREDO }, porta, { segredoInterno: SEGREDO, agora })
}

function porta(conversa: unknown, ajustes: AjustesDaPorta = {}): PortaDaFinalizacao {
  return portaDaFinalizacaoSobreOBanco(banco.sql, conversa, ajustes)
}

interface ItemGravado {
  kind: string
  status: string
  deduplicacao_key: string
  threshold_snapshot: Record<string, unknown> | null
}

async function itens(conta: Conta): Promise<ItemGravado[]> {
  const { rows } = await banco.sql.query<ItemGravado>(
    `select kind, status, deduplicacao_key, threshold_snapshot
       from public.exception_items where account_id = $1 order by created_at, kind`,
    [conta.id],
  )
  return rows
}

async function sentimentoGravado(chamadaId: string) {
  const { rows } = await banco.sql.query<{ sentiment: string | null; sentiment_source: string | null; last_sentiment: string | null }>(
    `select c.sentiment, c.sentiment_source, l.last_sentiment
       from public.calls c left join public.leads l on l.id = c.lead_id where c.id = $1`,
    [chamadaId],
  )
  const linha = rows[0]!
  return {
    sentimento: linha.sentiment === null ? null : Number(linha.sentiment),
    fonte: linha.sentiment_source,
    doLead: linha.last_sentiment === null ? null : Number(linha.last_sentiment),
  }
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  comPisoMeio = await criarConta('Fluxo Cargo', '+5511990000101', -0.5)
  comPisoBaixo = await criarConta('Rota Norte', '+5511990000202', -0.8)
  // As fixtures não dizem o aviso de gravação. Sem os critérios da conta e
  // com a gravação desligada (o aviso não se aplica), a avaliação automática
  // (US-142) só decide pelo juízo gravado, e a fila destes testes fica sendo a
  // do assunto deles. A avaliação tem arquivo próprio:
  // testes/banco/avaliacao-da-chamada.test.ts.
  await banco.sql.query('delete from public.evaluation_criteria')
  await banco.sql.query('update public.account_settings set recording_enabled = false')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.exception_items')
  await banco.sql.query('delete from public.call_attempts')
  await banco.sql.query('delete from public.calls')
  await banco.sql.query('update public.leads set last_sentiment = null')
  await banco.sql.query('update public.account_settings set sentiment_floor = -0.5 where account_id = $1', [comPisoMeio.id])
  await banco.sql.query('update public.account_settings set sentiment_floor = -0.8 where account_id = $1', [comPisoBaixo.id])
})

describe('o piso de sentimento da conta (quinto critério de aceite da F4)', () => {
  test('-0,6 gera item com o piso em -0,5 e não gera com o piso em -0,8', async () => {
    const naMeio = await semearChamada(comPisoMeio, { sentimentoDaFerramenta: -0.6 })
    const naBaixa = await semearChamada(comPisoBaixo, { sentimentoDaFerramenta: -0.6 })

    expect((await finalizar(naMeio, porta(ATENDIDA.corpo))).status).toBe(200)
    expect((await finalizar(naBaixa, porta(ATENDIDA.corpo))).status).toBe(200)

    expect(await itens(comPisoMeio)).toEqual([
      {
        kind: 'sentimento_negativo',
        status: 'aberto',
        deduplicacao_key: `sentimento:${naMeio}`,
        threshold_snapshot: { sentiment_floor: -0.5 },
      },
    ])
    expect(await itens(comPisoBaixo)).toEqual([])
  })

  test('o sentimento da ferramenta chega à chamada e ao lead, com a fonte', async () => {
    const chamadaId = await semearChamada(comPisoBaixo, { sentimentoDaFerramenta: -0.6 })
    await finalizar(chamadaId, porta(ATENDIDA.corpo))
    expect(await sentimentoGravado(chamadaId)).toEqual({ sentimento: -0.6, fonte: 'tool', doLead: -0.6 })
  })

  test('mudar o limiar não reescreve a fila, e a chamada seguinte já obedece ao novo', async () => {
    const primeira = await semearChamada(comPisoMeio, { sentimentoDaFerramenta: -0.6 })
    await finalizar(primeira, porta(ATENDIDA.corpo))

    await banco.sql.query('update public.account_settings set sentiment_floor = -0.8 where account_id = $1', [
      comPisoMeio.id,
    ])
    const seguinte = await semearChamada(comPisoMeio, { sentimentoDaFerramenta: -0.6 })
    await finalizar(seguinte, porta(ATENDIDA.corpo))

    expect(await itens(comPisoMeio)).toEqual([
      {
        kind: 'sentimento_negativo',
        status: 'aberto',
        deduplicacao_key: `sentimento:${primeira}`,
        threshold_snapshot: { sentiment_floor: -0.5 },
      },
    ])
  })
})

test('a retaguarda: o sentimento do modelo vem com a fonte, e o critério reprovado vira item', async () => {
  const chamadaId = await semearChamada(comPisoBaixo)
  // O que `call-classify` grava quando a finalização o aciona e espera.
  const retaguarda = async (id: string) => {
    await banco.sql.query(
      `update public.calls
          set classification = '{"stage_key": null}'::jsonb, classification_source = 'backfill',
              classification_confidence = 0.6, sentiment = -0.3,
              evaluation = '{"criterios": {"aviso_gravacao": {"aprovado": false, "justificativa": null}}}'::jsonb
        where id = $1`,
      [id],
    )
  }

  expect((await finalizar(chamadaId, porta(ATENDIDA.corpo, { acionarClassificacao: retaguarda }))).status).toBe(200)

  expect(await sentimentoGravado(chamadaId)).toEqual({ sentimento: -0.3, fonte: 'backfill', doLead: -0.3 })
  expect(await itens(comPisoBaixo)).toEqual([
    {
      kind: 'avaliacao_reprovada',
      status: 'aberto',
      deduplicacao_key: `avaliacao:${chamadaId}`,
      threshold_snapshot: { failed_criteria_cap: 1 },
    },
  ])
})

test('três tentativas seguidas sem atender ao mesmo número viram item, e duas não', async () => {
  await falhaAnterior(comPisoMeio, 120)
  const segunda = await semearChamada(comPisoMeio, { tentativaEm: 60 })
  await finalizar(segunda, porta(CAIXA_POSTAL.corpo))
  expect(await itens(comPisoMeio)).toEqual([])

  const terceira = await semearChamada(comPisoMeio, { tentativaEm: 0 })
  await finalizar(terceira, porta(CAIXA_POSTAL.corpo))

  // 2026-03-20 em São Paulo, o fuso padrão da conta.
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(INICIO_MS))
  expect(await itens(comPisoMeio)).toEqual([
    {
      kind: 'falha_repetida',
      status: 'aberto',
      deduplicacao_key: `falha:${comPisoMeio.telefone}:${dia}`,
      threshold_snapshot: { consecutive_failures_cap: 3 },
    },
  ])
})

test('uma tentativa atendida no meio zera a sequência', async () => {
  await falhaAnterior(comPisoMeio, 180)
  const atendida = await semearChamada(comPisoMeio, { tentativaEm: 120 })
  await finalizar(atendida, porta(ATENDIDA.corpo))
  await falhaAnterior(comPisoMeio, 60)
  const ultima = await semearChamada(comPisoMeio, { tentativaEm: 0 })
  await finalizar(ultima, porta(CAIXA_POSTAL.corpo))

  const { rows } = await banco.sql.query<{ falhas: number }>('select falhas from public.falhas_consecutivas($1, $2)', [
    comPisoMeio.id,
    ultima,
  ])
  expect(rows).toEqual([{ falhas: 2 }])
  expect((await itens(comPisoMeio)).filter((i) => i.kind === 'falha_repetida')).toEqual([])
})

test('duas finalizações da mesma chamada não duplicam item', async () => {
  const chamadaId = await semearChamada(comPisoMeio, { sentimentoDaFerramenta: -0.9 })

  // A primeira passa pela fila e cai antes de `finalized_at`.
  expect((await finalizar(chamadaId, porta(ATENDIDA.corpo, { conclusaoFalha: 1 }))).status).toBe(503)
  const depois = new Date(Date.parse(AGORA) + VALIDADE_DA_REIVINDICACAO_MS + 1_000).toISOString()
  const segunda = await finalizar(chamadaId, porta(ATENDIDA.corpo), depois)
  expect(segunda.status).toBe(200)
  expect(segunda.corpo).toMatchObject({ fila: { situacao: 'avaliada', criados: [], jaAbertos: ['sentimento_negativo'] } })

  expect((await itens(comPisoMeio)).map((i) => i.deduplicacao_key)).toEqual([`sentimento:${chamadaId}`])
})

test('o ensaio não gera item e não toca o lead', async () => {
  const chamadaId = await semearChamada(comPisoMeio, { direcao: 'rehearsal', sentimentoDaFerramenta: -0.9 })
  expect((await finalizar(chamadaId, porta(ATENDIDA.corpo))).status).toBe(200)

  expect(await itens(comPisoMeio)).toEqual([])
  expect((await sentimentoGravado(chamadaId)).doLead).toBeNull()
})

describe('falhas_consecutivas', () => {
  test('só service_role executa', async () => {
    const { rows } = await banco.sql.query<{ grantee: string }>(
      `select grantee from information_schema.routine_privileges
        where routine_schema = 'public' and routine_name = 'falhas_consecutivas' and privilege_type = 'EXECUTE'
        order by grantee`,
    )
    expect(rows.map((r) => r.grantee).filter((g) => g !== 'postgres')).toEqual(['service_role'])
  })

  test('chamada sem tentativa não devolve linha', async () => {
    const chamadaId = await semearChamada(comPisoMeio)
    const { rows } = await banco.sql.query('select * from public.falhas_consecutivas($1, $2)', [comPisoMeio.id, chamadaId])
    expect(rows).toEqual([])
  })
})

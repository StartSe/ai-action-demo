// A finalização de verdade contra o banco (US-107): `finalizarChamada` roda com
// uma porta escrita sobre o PGlite, e a conversa do provedor sai das fixtures
// de `call-finalize/transcricoes-de-exemplo.ts`. É o que o teste de unidade da
// finalização não alcança — o dublê dele implementa o único em memória, e aqui
// quem decide é `call_tool_invocations_unica`, o check de `end_reason` e o de
// `answered_by`.
//
// O que este arquivo prova:
//
// 1. **O efeito em `calls` e em `call_tool_invocations`** para cada fixture:
//    desfecho, motivo do fim, quem atendeu e as linhas das ferramentas de
//    sistema, com a chamada semeada como serviço.
// 2. **A ordem vem do instante, e não da gravação**: a porta grava as linhas de
//    trás para frente, e a leitura por `at` devolve a ordem da transcrição.
// 3. **Duas finalizações em sequência não duplicam invocação** — a segunda cai
//    na reivindicação —, e a passagem que caiu antes de `finalized_at` e volta
//    depois dos 5 minutos esbarra no único e não insere nada.
// 4. **Transcrição sem invocação** finaliza normal, sem linha e sem item na
//    fila.
// 5. **O bloqueio refeito** (US-108, R-02): o `tool-dnc` que não gravou vira
//    linha em `dnc_entries` pelo RPC da ferramenta, com a origem do `reason`,
//    as notas da reaplicação e o instante da promessa, e o item da fila junto;
//    o bloqueio que já existia não muda nem ganha segundo item; a segunda
//    passagem não duplica; e o ensaio não bloqueia nada.
// 6. **As duas falas da pessoa errada** (US-109, RF-422): a divergência chega a
//    `calls.evaluation.medicoes` pelo RPC, e a conformidade não escreve nada.
//
// A porta é do teste (`testes/auxiliares/porta-da-finalizacao.ts`), e não o
// `index.ts`.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import {
  finalizarChamada,
  VALIDADE_DA_REIVINDICACAO_MS,
  type PortaDaFinalizacao,
} from '../../supabase/functions/call-finalize/finalizacao.ts'
import { ENCERRAMENTOS_DE_EXEMPLO } from '../../supabase/functions/call-finalize/encerramentos-de-exemplo.ts'
import { NOTA_DA_REAPLICACAO } from '../../supabase/functions/call-finalize/reaplicacao-do-bloqueio.ts'
import {
  INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS,
  TRANSCRICOES_DE_EXEMPLO,
  type TranscricaoDeExemplo,
} from '../../supabase/functions/call-finalize/transcricoes-de-exemplo.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'
import { ISO, portaDaFinalizacaoSobreOBanco, type AjustesDaPorta } from '../auxiliares/porta-da-finalizacao.ts'

const SEGREDO = 'segredo-interno-do-teste'
const INICIO_MS = INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS * 1000
const TELEFONE_DO_LEAD = '+5511990000001'
const AGORA = new Date(INICIO_MS + 5 * 60 * 1000).toISOString()

let banco: BancoDeTeste
let contaId: string
let leadId: string
let sequencia = 0

const portaSobreOBanco = (fixture: Pick<TranscricaoDeExemplo, 'corpo'>, ajustes: AjustesDaPorta = {}) =>
  portaDaFinalizacaoSobreOBanco(banco.sql, fixture.corpo, ajustes)

/** A chamada em curso, semeada como serviço: `calls` não tem escrita de cliente. */
async function semearChamada(direcao: 'outbound' | 'rehearsal' = 'outbound'): Promise<string> {
  sequencia += 1
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, status, provider_conversation_id, idempotency_key, started_at)
     values ($1, $2, 'discovery', $6, 'ringing', $3, $4, $5)
     returning id`,
    [
      contaId, leadId, `conv_finalizacao_${sequencia}`, `finalizacao-${sequencia}`,
      new Date(INICIO_MS).toISOString(), direcao,
    ],
  )
  return rows[0]!.id
}

function finalizar(chamadaId: string, porta: PortaDaFinalizacao, agora = AGORA) {
  return finalizarChamada(
    { metodo: 'POST', chamadaId, segredoInterno: SEGREDO },
    porta,
    { segredoInterno: SEGREDO, agora },
  )
}

async function invocacoesGravadas(chamadaId: string) {
  const { rows } = await banco.sql.query<{ tool: string; at: string; error: string | null }>(
    `select tool, ${ISO('at')} as at, error
       from public.call_tool_invocations
      where call_id = $1
      order by at`,
    [chamadaId],
  )
  return rows.map((r) => ({ tool: r.tool, ms: Date.parse(r.at) - INICIO_MS, error: r.error }))
}

async function chamadaGravada(chamadaId: string) {
  const { rows } = await banco.sql.query<{
    status: string
    end_reason: string | null
    answered_by: string | null
    finalizada: boolean
  }>(
    `select status, end_reason, answered_by, finalized_at is not null as finalizada
       from public.calls where id = $1`,
    [chamadaId],
  )
  return rows[0]!
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    "insert into public.accounts (name) values ('Fluxo Cargo') returning id",
  )
  contaId = rows[0]!.id
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Marcos Ferreira', $2, 'cenario') returning id`,
    [contaId, TELEFONE_DO_LEAD],
  )
  leadId = leads[0]!.id
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
  await banco.sql.query('delete from public.dnc_entries')
  await banco.sql.query('delete from public.consent_records')
  await banco.sql.query('delete from public.integration_events')
  // `call_tool_invocations` e `call_costs` saem por cascata.
  await banco.sql.query('delete from public.calls')
})

describe.each(TRANSCRICOES_DE_EXEMPLO.map((fixture) => [fixture.nome, fixture] as const))(
  'a fixture "%s"',
  (_nome, fixture) => {
    test('grava o fim em calls e as ferramentas em ordem de instante, e a segunda finalização não duplica', async () => {
      const chamadaId = await semearChamada()
      const porta = portaSobreOBanco(fixture)

      const primeira = await finalizar(chamadaId, porta)
      expect(primeira.status).toBe(200)
      // O aviso do provedor e a varredura no mesmo segundo: a segunda cai na
      // reivindicação.
      const segunda = await finalizar(chamadaId, porta)
      expect(segunda.status).toBe(409)

      expect(await chamadaGravada(chamadaId)).toEqual({
        status: 'ended',
        end_reason: fixture.esperado.motivo,
        answered_by: fixture.esperado.atendidaPor,
        finalizada: true,
      })
      expect(await invocacoesGravadas(chamadaId)).toEqual(fixture.esperado.linhas)
    })
  },
)

test('a passagem que caiu antes de finalized_at volta depois dos 5 minutos e o único não deixa duplicar', async () => {
  const fixture = TRANSCRICOES_DE_EXEMPLO.find((f) => f.nome.startsWith('pessoa errada'))!
  const chamadaId = await semearChamada()
  const porta = portaSobreOBanco(fixture, { conclusaoFalha: 1 })

  expect((await finalizar(chamadaId, porta)).status).toBe(503)
  const depois = new Date(Date.parse(AGORA) + VALIDADE_DA_REIVINDICACAO_MS + 1_000).toISOString()
  const segunda = await finalizar(chamadaId, porta, depois)
  expect(segunda.status).toBe(200)

  expect(await invocacoesGravadas(chamadaId)).toEqual(fixture.esperado.linhas)
  expect((await chamadaGravada(chamadaId)).finalizada).toBe(true)
})

test('transcrição sem invocação de sistema finaliza normal, sem linha e sem item na fila', async () => {
  const fixture = TRANSCRICOES_DE_EXEMPLO.find((f) => f.nome === 'sem nenhuma invocação')!
  const chamadaId = await semearChamada()

  const resposta = await finalizar(chamadaId, portaSobreOBanco(fixture))
  expect(resposta.status).toBe(200)
  expect(resposta.corpo).toMatchObject({ ok: true, invocacoes: 0, motivoDoFim: 'completed' })

  expect(await invocacoesGravadas(chamadaId)).toEqual([])
  const { rows } = await banco.sql.query('select id from public.exception_items where call_id = $1', [chamadaId])
  expect(rows).toEqual([])
})

describe('o bloqueio refeito na finalização (US-108)', () => {
  const naoPerturbe = TRANSCRICOES_DE_EXEMPLO.find((f) => f.nome === 'não perturbe com o banco fora do ar')!
  const PROMESSA = new Date(INICIO_MS + 7_000).toISOString()

  async function bloqueiosAtivos() {
    const { rows } = await banco.sql.query<{
      phone_e164: string
      source: string
      notes: string | null
      created_at: string
    }>(
      `select phone_e164, source, notes, ${ISO('created_at')} as created_at
         from public.dnc_entries where account_id = $1 and removed_at is null`,
      [contaId],
    )
    return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }))
  }

  async function itensDaChamada(chamadaId: string) {
    const { rows } = await banco.sql.query<{ kind: string; context: Record<string, unknown> }>(
      'select kind, context from public.exception_items where call_id = $1',
      [chamadaId],
    )
    return rows
  }

  test('sem a linha em dnc_entries, a finalização cria o bloqueio e o item da fila', async () => {
    const chamadaId = await semearChamada()
    const resposta = await finalizar(chamadaId, portaSobreOBanco(naoPerturbe))
    expect(resposta.status).toBe(200)

    expect(await bloqueiosAtivos()).toEqual([
      {
        phone_e164: TELEFONE_DO_LEAD,
        source: 'lead_request',
        notes: `${NOTA_DA_REAPLICACAO} | pediu para não ligar mais`,
        created_at: PROMESSA,
      },
    ])
    expect(await itensDaChamada(chamadaId)).toEqual([
      {
        kind: 'dnc_requested',
        context: {
          call_id: chamadaId,
          origem: 'lead_request',
          recorte: 'pediu para não ligar mais',
          blocked_at: PROMESSA,
          reaplicado: true,
        },
      },
    ])
  })

  test('com a linha, não duplica, não sobrescreve e não abre item', async () => {
    const antes = '2026-03-20T10:00:07.500Z'
    await banco.sql.query(
      `insert into public.dnc_entries (account_id, phone_e164, reason, source, notes, created_at)
       values ($1, $2, 'Pediu durante a ligação.', 'lead_request', 'gravado pela ferramenta', $3)`,
      [contaId, TELEFONE_DO_LEAD, antes],
    )
    const chamadaId = await semearChamada()
    expect((await finalizar(chamadaId, portaSobreOBanco(naoPerturbe))).status).toBe(200)

    expect(await bloqueiosAtivos()).toEqual([
      { phone_e164: TELEFONE_DO_LEAD, source: 'lead_request', notes: 'gravado pela ferramenta', created_at: antes },
    ])
    expect(await itensDaChamada(chamadaId)).toEqual([])
  })

  test('a passagem que volta depois dos 5 minutos não cria segundo bloqueio nem segundo item', async () => {
    const chamadaId = await semearChamada()
    const porta = portaSobreOBanco(naoPerturbe, { conclusaoFalha: 1 })
    expect((await finalizar(chamadaId, porta)).status).toBe(503)
    const depois = new Date(Date.parse(AGORA) + VALIDADE_DA_REIVINDICACAO_MS + 1_000).toISOString()
    expect((await finalizar(chamadaId, porta, depois)).status).toBe(200)

    expect(await bloqueiosAtivos()).toHaveLength(1)
    expect(await itensDaChamada(chamadaId)).toHaveLength(1)
  })

  test('a pessoa errada com dois tool-dnc grava um bloqueio wrong_number', async () => {
    const pessoaErrada = TRANSCRICOES_DE_EXEMPLO.find((f) => f.nome.startsWith('pessoa errada'))!
    const chamadaId = await semearChamada()
    expect((await finalizar(chamadaId, portaSobreOBanco(pessoaErrada))).status).toBe(200)

    expect(await bloqueiosAtivos()).toMatchObject([{ source: 'wrong_number', notes: NOTA_DA_REAPLICACAO }])
    expect(await itensDaChamada(chamadaId)).toHaveLength(1)
  })

  test('chamada de ensaio com tool-dnc não bloqueia nem abre item', async () => {
    const chamadaId = await semearChamada('rehearsal')
    const resposta = await finalizar(chamadaId, portaSobreOBanco(naoPerturbe))
    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ bloqueios: { ensaio: true, criados: 0 } })

    expect(await bloqueiosAtivos()).toEqual([])
    expect(await itensDaChamada(chamadaId)).toEqual([])
  })
})

describe('as duas falas da pessoa errada (US-109)', () => {
  async function avaliacaoGravada(chamadaId: string) {
    const { rows } = await banco.sql.query<{ evaluation: Record<string, unknown> }>(
      'select evaluation from public.calls where id = $1',
      [chamadaId],
    )
    return rows[0]!.evaluation
  }

  test('na terceira fala, a divergência entra em evaluation.medicoes', async () => {
    const exemplo = ENCERRAMENTOS_DE_EXEMPLO.find((e) => e.nome === 'encerrou na terceira')!
    const chamadaId = await semearChamada()
    const resposta = await finalizar(chamadaId, portaSobreOBanco(exemplo))
    expect(resposta.corpo).toMatchObject({ ok: true, encerramentoDaPessoaErrada: 'divergente' })

    expect(await avaliacaoGravada(chamadaId)).toEqual({
      medicoes: {
        encerramento_pessoa_errada: {
          conforme: false,
          falas: 3,
          limite: 2,
          encerrou_com_end_call: true,
          requisito: 'RF-422',
        },
      },
    })
  })

  test('na fala seguinte é conforme, e a avaliação continua vazia', async () => {
    const exemplo = ENCERRAMENTOS_DE_EXEMPLO.find((e) => e.nome === 'encerrou na fala seguinte')!
    const chamadaId = await semearChamada()
    const resposta = await finalizar(chamadaId, portaSobreOBanco(exemplo))
    expect(resposta.corpo).toMatchObject({ ok: true, encerramentoDaPessoaErrada: 'conforme' })
    expect(await avaliacaoGravada(chamadaId)).toEqual({})
  })
})

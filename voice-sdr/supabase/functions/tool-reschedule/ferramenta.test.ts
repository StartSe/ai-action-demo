// tool-reschedule sobre o esqueleto, com leitura e escrita dubladas: a suíte
// de contrato da seção 9.2 (carga válida, campo faltante, segredo inválido,
// conversa inexistente, propósito errado, oferta expirada, oferta de outra
// chamada, 23P01 e modo ensaio), o cancelamento e a idempotência. A transação
// de verdade em PGlite está em testes/banco/remarcacao-de-reuniao.test.ts.

import { describe, expect, test } from 'vitest'

import type { ReuniaoEmJogo } from '../_shared/agente/reuniao-em-jogo.ts'
import { FALAS_DA_AGENDA } from '../_shared/speech/agenda.ts'
import { FALAS_DAS_FERRAMENTAS } from '../_shared/speech/ferramentas.ts'
import { FALAS_DO_LEMBRETE, falarRemarcacao } from '../_shared/speech/lembrete.ts'
import { FALAS_DO_RESGATE } from '../_shared/speech/resgate.ts'
import type {
  AmbienteDaFerramenta,
  ChamadaDaFerramenta,
  InvocacaoParaRegistro,
  RespostaDaFerramenta,
} from '../_shared/tools/esqueleto.ts'
import { derivarSegredo } from '../_shared/tools/segredo.ts'
import type { OfertaDaChamada } from '../tool-book-meeting/agendamento.ts'

import { criarToolReschedule, lerAcao, type EscritaDaRemarcacao, type ResultadoDaEscrita } from './remarcacao.ts'

const CONTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CHAMADA_ID = 'cafecafe-dead-4bee-8fed-abcdefabcdef'
const OUTRA_CHAMADA = 'cafecafe-dead-4bee-8fed-000000000002'
const LEAD = 'facefeed-beef-4abc-8def-fedcbafedcba'
const REUNIAO = 'deadbeef-0000-4000-8000-000000000001'
const NOVA = 'deadbeef-0000-4000-8000-000000000002'
const ANA = 'a0a0a0a0-1111-4111-8111-111111111111'
const CONVERSA = 'conv_lembrete_02'
const CHAVE = 'chave-do-servidor-de-teste'

/** Segunda, 5 de outubro de 2026, 14h40 em São Paulo. */
const AGORA = Date.UTC(2026, 9, 5, 17, 40, 0)

const LEMBRETE: ChamadaDaFerramenta = {
  id: CHAMADA_ID,
  account_id: CONTA,
  purpose: 'reminder',
  direction: 'outbound',
  lead_id: LEAD,
}

function reuniao(extra: Partial<ReuniaoEmJogo> = {}): ReuniaoEmJogo {
  return {
    id: REUNIAO,
    contaId: CONTA,
    leadId: LEAD,
    status: 'scheduled',
    inicio: '2026-10-05T18:00:00.000Z',
    fim: '2026-10-05T18:30:00.000Z',
    modalidade: 'video',
    especialistaId: ANA,
    nomeDoEspecialista: 'Ana',
    fusoDoLead: 'America/Sao_Paulo',
    fusoDoEspecialista: 'America/Sao_Paulo',
    ...extra,
  }
}

/** Terça, 6 de outubro: 9h e 9h30 em São Paulo, da chamada dada. */
function oferta(position: number, chamada = CHAMADA_ID, extras: Partial<OfertaDaChamada> = {}): OfertaDaChamada & { chamada: string } {
  const inicio = Date.UTC(2026, 9, 6, 12, 0, 0) + (position - 1) * 30 * 60_000
  return {
    chamada,
    position,
    specialist_id: ANA,
    starts_at: new Date(inicio).toISOString(),
    ends_at: new Date(inicio + 30 * 60_000).toISOString(),
    expires_at: new Date(AGORA + 3_600_000).toISOString(),
    fusoDoEspecialista: 'America/Sao_Paulo',
    ...extras,
  }
}

interface Opcoes {
  chamada?: ChamadaDaFerramenta
  reuniao?: ReuniaoEmJogo | null
  ofertas?: Array<OfertaDaChamada & { chamada: string }>
  /** O código que o RPC devolve em vez de remarcar. */
  codigo?: string
}

function montar(opcoes: Opcoes = {}) {
  const chamada = opcoes.chamada ?? LEMBRETE
  const estado = {
    reuniao: opcoes.reuniao === undefined ? reuniao() : opcoes.reuniao,
    ofertas: opcoes.ofertas ?? [oferta(1), oferta(2)],
    remarcada: null as { id: string; inicio: string } | null,
    escritas: [] as string[],
    registros: [] as InvocacaoParaRegistro[],
  }

  const escrita: EscritaDaRemarcacao = {
    async remarcarReuniao(_conta, _chamada, posicao, motivo): Promise<ResultadoDaEscrita> {
      estado.escritas.push(`remarcar:${posicao}:${motivo}`)
      if (opcoes.codigo) return { resultado: opcoes.codigo }
      const escolhida = estado.ofertas.find((o) => o.chamada === CHAMADA_ID && o.position === posicao)
      if (!escolhida) return { resultado: 'posicao_nao_oferecida' }
      estado.remarcada = { id: NOVA, inicio: escolhida.starts_at }
      estado.ofertas = []
      return { resultado: 'remarcada', meeting_id: NOVA, starts_at: escolhida.starts_at }
    },
    async cancelarReuniao(_conta, _chamada, motivo): Promise<ResultadoDaEscrita> {
      estado.escritas.push(`cancelar:${motivo}`)
      if (estado.reuniao?.status === 'canceled') return { resultado: 'ja_cancelada' }
      estado.reuniao = estado.reuniao && { ...estado.reuniao, status: 'canceled' }
      return { resultado: 'cancelada', meeting_id: REUNIAO }
    },
  }

  const ambiente: AmbienteDaFerramenta<EscritaDaRemarcacao> = {
    escrita,
    chaves: { vigente: CHAVE },
    agora: () => AGORA,
    esperar: () => new Promise<void>(() => undefined),
    log: () => undefined,
    porta: {
      async contasCandidatas() {
        return [CONTA]
      },
      async chamadaDaConversa(contaId, conversaId) {
        return conversaId === CONVERSA && contaId === chamada.account_id ? chamada : null
      },
      async registrarInvocacao(invocacao) {
        estado.registros.push(invocacao)
      },
    },
  }

  const tratar = criarToolReschedule({
    async reuniaoDaChamada() {
      return estado.reuniao
    },
    async ofertaDaChamada(_conta, chamadaId, posicao) {
      return estado.ofertas.find((o) => o.chamada === chamadaId && o.position === posicao) ?? null
    },
    async remarcacaoDaChamada() {
      return estado.remarcada
    },
  })

  const chamar = async (corpo: unknown, extras: { conversa?: string; segredo?: string } = {}) =>
    vista(
      await tratar(
        {
          metodo: 'POST',
          segredo: extras.segredo ?? (await derivarSegredo(CHAVE, CONTA)),
          conversa: extras.conversa ?? CONVERSA,
          corpo,
        },
        ambiente,
      ),
    )
  return { estado, chamar }
}

function vista(resposta: RespostaDaFerramenta): RespostaDaFerramenta {
  expect(Object.keys(resposta.corpo).sort()).toEqual(['data', 'ok', 'speech'])
  expect(resposta.corpo.speech.trim()).not.toBe('')
  expect(resposta.corpo.speech).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  return resposta
}

const REMARCAR = { action: 'reschedule', slot_position: 2, reason: 'não posso hoje' }
const CANCELAR = { action: 'cancel', reason: 'mudou de ideia' }
const FALA_DA_REMARCACAO = falarRemarcacao(
  { inicio: oferta(2).starts_at, fusoDoLead: 'America/Sao_Paulo', fusoDoEspecialista: 'America/Sao_Paulo' },
  new Date(AGORA).toISOString(),
)

describe('a suíte de contrato da seção 9.2', () => {
  test('carga válida: remarca no horário da posição e devolve a reunião nova', async () => {
    const { estado, chamar } = montar()
    const resposta = await chamar(REMARCAR)
    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: true,
      data: { meeting_id: NOVA, action: 'reschedule', starts_at: oferta(2).starts_at },
      speech: FALA_DA_REMARCACAO,
    })
    expect(resposta.corpo.speech).toBe('Pronto, remarquei pra amanhã às 9h30. Vou te mandar o convite novo por e-mail.')
    expect(estado.escritas).toEqual(['remarcar:2:não posso hoje'])
    expect(estado.registros[0]).toMatchObject({ tool: 'tool-reschedule', error: null })
  })

  test.each([
    ['action', { slot_position: 1, reason: 'x' }],
    ['reason', { action: 'reschedule', slot_position: 1 }],
  ])('campo faltante (%s): 400 com o campo nomeado, sem escrita', async (chave, corpo) => {
    const { estado, chamar } = montar()
    const resposta = await chamar(corpo)
    expect(resposta.status).toBe(400)
    expect(resposta.corpo.data).toMatchObject({ chave })
    expect(estado.escritas).toEqual([])
  })

  test('segredo inválido: 401', async () => {
    const { estado, chamar } = montar()
    expect((await chamar(REMARCAR, { segredo: await derivarSegredo('outra', CONTA) })).status).toBe(401)
    expect(estado.escritas).toEqual([])
    expect(estado.registros).toEqual([])
  })

  test('conversa inexistente: 404', async () => {
    const { chamar } = montar()
    expect((await chamar(REMARCAR, { conversa: 'conv_nenhuma' })).status).toBe(404)
  })

  test('propósito errado: 409 na descoberta e no acompanhamento; lembrete e resgate atendem', async () => {
    for (const purpose of ['discovery', 'followup']) {
      const { estado, chamar } = montar({ chamada: { ...LEMBRETE, purpose } })
      const resposta = await chamar(REMARCAR)
      expect(resposta.status).toBe(409)
      expect(resposta.corpo.speech).toBe(FALAS_DAS_FERRAMENTAS.propositoErrado)
      expect(estado.escritas).toEqual([])
    }
    const resgate = montar({ chamada: { ...LEMBRETE, purpose: 'rescue' }, reuniao: reuniao({ status: 'no_show' }) })
    expect((await resgate.chamar(REMARCAR)).corpo.ok).toBe(true)
  })

  test('oferta expirada: pede nova consulta, sem escrita', async () => {
    const vencida = new Date(AGORA - 1000).toISOString()
    const { estado, chamar } = montar({ ofertas: [oferta(1, CHAMADA_ID, { expires_at: vencida }), oferta(2, CHAMADA_ID, { expires_at: vencida })] })
    const resposta = await chamar(REMARCAR)
    expect(resposta.corpo).toMatchObject({ ok: false, speech: FALAS_DA_AGENDA.ofertaSemValidade, data: { reason: 'oferta_expirada' } })
    expect(estado.escritas).toEqual([])
  })

  test('oferta de outra chamada não serve', async () => {
    const { estado, chamar } = montar({ ofertas: [oferta(1, OUTRA_CHAMADA), oferta(2, OUTRA_CHAMADA)] })
    const resposta = await chamar(REMARCAR)
    expect(resposta.corpo).toMatchObject({ ok: false, data: { reason: 'posicao_nao_oferecida' } })
    expect(estado.escritas).toEqual([])
  })

  test('23P01: o horário foi tomado no meio, e a fala manda consultar de novo', async () => {
    const { chamar } = montar({ codigo: 'horario_ocupado' })
    const resposta = await chamar(REMARCAR)
    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ ok: false, speech: FALAS_DA_AGENDA.horarioTomado, data: { reason: 'horario_ocupado' } })
  })

  test('modo ensaio: a mesma fala, sem reunião nova e sem escrita', async () => {
    const { estado, chamar } = montar({ chamada: { ...LEMBRETE, direction: 'rehearsal' } })
    const resposta = await chamar(REMARCAR)
    expect(resposta.corpo).toMatchObject({ ok: true, speech: FALA_DA_REMARCACAO, data: { meeting_id: null } })
    expect(estado.escritas).toEqual([])
    expect(estado.remarcada).toBeNull()
  })
})

describe('o resto do comportamento', () => {
  test('duas vezes com a mesma posição: a mesma reunião, uma escrita só', async () => {
    const { estado, chamar } = montar()
    const primeira = await chamar(REMARCAR)
    const segunda = await chamar(REMARCAR)
    expect(segunda.corpo.data).toMatchObject({ meeting_id: NOVA })
    expect(segunda.corpo.speech).toBe(primeira.corpo.speech)
    expect(estado.escritas).toHaveLength(1)
  })

  test('cancelar: cancela uma vez e diz que cancelou', async () => {
    const { estado, chamar } = montar()
    const resposta = await chamar(CANCELAR)
    expect(resposta.corpo).toMatchObject({ ok: true, speech: FALAS_DO_LEMBRETE.cancelada, data: { action: 'cancel' } })
    await chamar(CANCELAR)
    expect(estado.escritas).toEqual(['cancelar:mudou de ideia'])
  })

  test('no resgate, desistir não cancela nada e a assistente agradece', async () => {
    const { estado, chamar } = montar({ chamada: { ...LEMBRETE, purpose: 'rescue' }, reuniao: reuniao({ status: 'no_show' }) })
    const resposta = await chamar(CANCELAR)
    expect(resposta.corpo).toMatchObject({ ok: true, speech: FALAS_DO_RESGATE.semInteresse })
    expect(estado.escritas).toEqual([])
  })

  test('ação desconhecida pergunta o que a pessoa quer; sem reunião é a frase de contorno', async () => {
    expect((await montar().chamar({ action: 'adiar', reason: 'x' })).corpo).toMatchObject({
      ok: false,
      speech: FALAS_DO_LEMBRETE.remarcarOuCancelar,
    })
    expect((await montar({ reuniao: null }).chamar(REMARCAR)).corpo).toMatchObject({
      ok: false,
      speech: FALAS_DAS_FERRAMENTAS.falha,
    })
  })

  test('reunião que já não está de pé não se remarca', async () => {
    const { estado, chamar } = montar({ reuniao: reuniao({ status: 'rescheduled' }) })
    expect((await chamar(REMARCAR)).corpo).toMatchObject({ ok: false, speech: FALAS_DO_LEMBRETE.naoEstaMaisMarcada })
    expect(estado.escritas).toEqual([])
  })

  test('lerAcao aceita as formas em inglês e em português, e nada mais', () => {
    expect(lerAcao(' Reschedule ')).toBe('reschedule')
    expect(lerAcao('remarcar')).toBe('reschedule')
    expect(lerAcao('cancel')).toBe('cancel')
    expect(lerAcao('cancelar')).toBe('cancel')
    expect(lerAcao('adiar')).toBeNull()
    expect(lerAcao(3)).toBeNull()
  })
})

// tool-confirm-meeting sobre o esqueleto, com a leitura e a escrita dubladas:
// a suíte de contrato da seção 9.2 (carga válida, campo faltante, segredo
// inválido, conversa inexistente, propósito errado, reunião já confirmada,
// reunião cancelada e modo ensaio) mais a idempotência da confirmação.
// A escrita de verdade em PGlite está em testes/banco/confirmacao-de-reuniao.test.ts.

import { describe, expect, test } from 'vitest'

import type { ReuniaoEmJogo } from '../_shared/agente/reuniao-em-jogo.ts'
import { FALAS_DAS_FERRAMENTAS } from '../_shared/speech/ferramentas.ts'
import { FALAS_DO_LEMBRETE, falarPresencaConfirmada } from '../_shared/speech/lembrete.ts'
import type {
  AmbienteDaFerramenta,
  ChamadaDaFerramenta,
  InvocacaoParaRegistro,
  RespostaDaFerramenta,
} from '../_shared/tools/esqueleto.ts'
import { derivarSegredo } from '../_shared/tools/segredo.ts'

import { criarToolConfirmMeeting, type EscritaDaConfirmacao, type ResultadoDaConfirmacao } from './confirmacao.ts'

const CONTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CHAMADA_ID = 'cafecafe-dead-4bee-8fed-abcdefabcdef'
const LEAD = 'facefeed-beef-4abc-8def-fedcbafedcba'
const REUNIAO = 'deadbeef-0000-4000-8000-000000000001'
const CONVERSA = 'conv_lembrete_01'
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
    especialistaId: 'a0a0a0a0-1111-4111-8111-111111111111',
    nomeDoEspecialista: 'Ana',
    fusoDoLead: 'America/Manaus',
    fusoDoEspecialista: 'America/Sao_Paulo',
    ...extra,
  }
}

function montar(opcoes: { chamada?: ChamadaDaFerramenta; reuniao?: ReuniaoEmJogo | null; escritaLevanta?: boolean } = {}) {
  const chamada = opcoes.chamada ?? LEMBRETE
  const estado = {
    reuniao: opcoes.reuniao === undefined ? reuniao() : opcoes.reuniao,
    confirmacoes: [] as string[],
    eventos: 0,
    registros: [] as InvocacaoParaRegistro[],
  }

  const escrita: EscritaDaConfirmacao = {
    async confirmarReuniao(_conta, _chamada, agora): Promise<ResultadoDaConfirmacao> {
      if (opcoes.escritaLevanta) throw new Error('banco fora do ar')
      estado.confirmacoes.push(agora)
      // `update ... where status = 'scheduled' returning`, ao pé da letra.
      if (estado.reuniao === null) return 'sem_reuniao'
      if (estado.reuniao.status === 'scheduled') {
        estado.reuniao = { ...estado.reuniao, status: 'confirmed' }
        estado.eventos += 1
        return 'confirmada'
      }
      return estado.reuniao.status === 'confirmed' ? 'ja_confirmada' : 'status_nao_elegivel'
    },
  }

  const ambiente: AmbienteDaFerramenta<EscritaDaConfirmacao> = {
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

  const tratar = criarToolConfirmMeeting({
    async reuniaoDaChamada() {
      return estado.reuniao
    },
  })
  const chamar = async (corpo: unknown = {}, extras: { conversa?: string; segredo?: string } = {}) =>
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

describe('a suíte de contrato da seção 9.2', () => {
  test('carga válida: confirma e fala o horário no fuso do lead', async () => {
    const { estado, chamar } = montar()
    const resposta = await chamar()
    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: true,
      data: { meeting_id: REUNIAO, status: 'confirmed', starts_at: '2026-10-05T18:00:00.000Z' },
      speech: falarPresencaConfirmada(reuniao(), new Date(AGORA).toISOString()),
    })
    expect(resposta.corpo.speech).toContain('14h no seu horário, 15h aqui em São Paulo')
    expect(estado.confirmacoes).toEqual([new Date(AGORA).toISOString()])
    expect(estado.registros).toHaveLength(1)
    expect(estado.registros[0]).toMatchObject({ tool: 'tool-confirm-meeting', call_id: CHAMADA_ID, error: null })
  })

  test('campo faltante não existe: a ferramenta não tem entrada, e corpo vazio ou nulo confirma igual', async () => {
    for (const corpo of [{}, null, 'não é objeto']) {
      const { chamar } = montar()
      expect((await chamar(corpo)).corpo.ok).toBe(true)
    }
  })

  test('segredo inválido: 401, sem leitura e sem registro', async () => {
    const { estado, chamar } = montar()
    const resposta = await chamar({}, { segredo: await derivarSegredo('outra-chave', CONTA) })
    expect(resposta.status).toBe(401)
    expect(estado.confirmacoes).toEqual([])
    expect(estado.registros).toEqual([])
  })

  test('conversa inexistente: 404', async () => {
    const { estado, chamar } = montar()
    expect((await chamar({}, { conversa: 'conv_que_nao_existe' })).status).toBe(404)
    expect(estado.confirmacoes).toEqual([])
  })

  test('propósito errado: 409 com a frase de contorno, e nada confirmado', async () => {
    for (const purpose of ['discovery', 'rescue', 'followup']) {
      const { estado, chamar } = montar({ chamada: { ...LEMBRETE, purpose } })
      const resposta = await chamar()
      expect(resposta.status).toBe(409)
      expect(resposta.corpo.speech).toBe(FALAS_DAS_FERRAMENTAS.propositoErrado)
      expect(estado.confirmacoes).toEqual([])
    }
  })

  test('reunião já confirmada: a mesma frase, sem escrever de novo', async () => {
    const { estado, chamar } = montar({ reuniao: reuniao({ status: 'confirmed' }) })
    const resposta = await chamar()
    expect(resposta.corpo.ok).toBe(true)
    expect(resposta.corpo.speech).toBe(falarPresencaConfirmada(reuniao(), new Date(AGORA).toISOString()))
    expect(estado.confirmacoes).toEqual([])
  })

  test('reunião cancelada: ok falso com a frase que oferece horário novo', async () => {
    const { estado, chamar } = montar({ reuniao: reuniao({ status: 'canceled' }) })
    const resposta = await chamar()
    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ ok: false, speech: FALAS_DO_LEMBRETE.naoEstaMaisMarcada })
    expect(estado.confirmacoes).toEqual([])
    expect(estado.registros[0]?.error).toBe('status_nao_elegivel')
  })

  test('modo ensaio: a mesma resposta, e a reunião fica intacta', async () => {
    const real = await montar().chamar()
    const { estado, chamar } = montar({ chamada: { ...LEMBRETE, direction: 'rehearsal' } })
    const ensaio = await chamar()
    expect(ensaio.corpo).toEqual(real.corpo)
    expect(estado.confirmacoes).toEqual([])
    expect(estado.reuniao?.status).toBe('scheduled')
    expect(estado.eventos).toBe(0)
  })
})

describe('a idempotência', () => {
  test('confirmar duas vezes na mesma chamada: uma escrita que confirma, a mesma frase e um evento só', async () => {
    const { estado, chamar } = montar()
    const primeira = await chamar()
    const segunda = await chamar()
    expect(segunda.corpo).toEqual(primeira.corpo)
    expect(estado.eventos).toBe(1)
    // A segunda nem vai à escrita: a leitura já vê a reunião confirmada.
    expect(estado.confirmacoes).toHaveLength(1)
  })

  test('chamada sem reunião: a frase de contorno, com ok falso', async () => {
    const { chamar } = montar({ reuniao: null })
    const resposta = await chamar()
    expect(resposta.corpo).toMatchObject({ ok: false, speech: FALAS_DAS_FERRAMENTAS.falha })
  })

  test('escrita que falha vira a frase de contorno, nunca erro técnico', async () => {
    const { chamar } = montar({ escritaLevanta: true })
    const resposta = await chamar()
    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ ok: false, speech: FALAS_DAS_FERRAMENTAS.falha })
  })
})

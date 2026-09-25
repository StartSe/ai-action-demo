// tool-qualify sobre o esqueleto, com as portas dubladas em memória: os seis
// casos da seção 9.2 (carga válida, campo faltante, segredo inválido, conversa
// inexistente, propósito errado e ensaio) e o primeiro critério de aceite da
// F4 pelo caminho portável — ao fim da chamada o lead está na etapa certa, com
// pontuação, temperatura e resumo da dor, e ninguém digitou nada.

import { describe, expect, test } from 'vitest'

import type { EtapaDoCatalogo } from '../_shared/qualificacao/etapa.ts'
import { REGUA_DE_EXEMPLO } from '../_shared/qualificacao/pontuacao.ts'
import { FALAS_DA_QUALIFICACAO } from '../_shared/speech/qualificacao.ts'
import { FALAS_DAS_FERRAMENTAS } from '../_shared/speech/ferramentas.ts'
import type {
  AmbienteDaFerramenta,
  ChamadaDaFerramenta,
  InvocacaoParaRegistro,
  RespostaDaFerramenta,
} from '../_shared/tools/esqueleto.ts'
import { derivarSegredo } from '../_shared/tools/segredo.ts'

import {
  briefingDaEntrada,
  criarToolQualify,
  type EscritaDaQualificacao,
  type GravacaoDoLead,
} from './qualificacao.ts'

const CONTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CHAMADA_ID = 'cafecafe-dead-4bee-8fed-abcdefabcdef'
const LEAD = 'facefeed-beef-4abc-8def-fedcbafedcba'
const CONVERSA = 'conv_qualifica_01'
const CHAVE = 'chave-do-servidor-de-teste'

const CATALOGO: readonly EtapaDoCatalogo[] = [
  { key: 'new', label: 'Novo', is_won: false, is_lost: false },
  { key: 'contacted', label: 'Contatado', is_won: false, is_lost: false },
  { key: 'qualified', label: 'Tem fit', is_won: false, is_lost: false },
  { key: 'lost', label: 'Perdido', is_won: false, is_lost: true },
]

const CHAMADA: ChamadaDaFerramenta = {
  id: CHAMADA_ID,
  account_id: CONTA,
  purpose: 'discovery',
  direction: 'outbound',
  lead_id: LEAD,
}

const CARGA = {
  stage_key: 'qualified',
  criterios: { dor_confirmada: true, orcamento: true, decisor: true },
  pain: 'Entregas controladas em planilha.',
  next_action: 'Especialista liga na terça.',
  sentiment: 0.4,
  meeting_outcome: 'attended',
}

function montar(opcoes: { chamada?: ChamadaDaFerramenta } = {}) {
  const chamada = opcoes.chamada ?? CHAMADA
  const escritas: string[] = []
  const leads: GravacaoDoLead[] = []
  const etapas: [string, string][] = []
  const classificacoes: Record<string, unknown>[] = []
  const registros: InvocacaoParaRegistro[] = []

  const escrita: EscritaDaQualificacao = {
    async gravarLead(gravacao) {
      escritas.push('gravarLead')
      leads.push(gravacao)
    },
    async moverEtapa(leadId, stageKey) {
      escritas.push('moverEtapa')
      etapas.push([leadId, stageKey])
    },
    async gravarClassificacao(_conta, _chamada, classificacao) {
      escritas.push('gravarClassificacao')
      classificacoes.push({ ...classificacao })
    },
  }

  const ambiente: AmbienteDaFerramenta<EscritaDaQualificacao> = {
    escrita,
    chaves: { vigente: CHAVE },
    agora: () => Date.UTC(2026, 8, 24, 14, 0, 0),
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
        registros.push(invocacao)
      },
    },
  }

  const tratar = criarToolQualify({
    async catalogoDeEtapas() {
      return CATALOGO
    },
    async reguaDaConta() {
      return REGUA_DE_EXEMPLO
    },
  })

  const chamar = async (
    corpo: unknown,
    extras: { conversa?: string; segredo?: string } = {},
  ): Promise<RespostaDaFerramenta> =>
    tratar(
      {
        metodo: 'POST',
        segredo: extras.segredo ?? (await derivarSegredo(CHAVE, CONTA)),
        conversa: extras.conversa ?? CONVERSA,
        corpo,
      },
      ambiente,
    )

  return { chamar, escritas, leads, etapas, classificacoes, registros }
}

const CODIGOS = ['etapa_desconhecida', 'lead_ausente', 'regua_invalida', 'segredo_invalido', 'proposito_nao_permitido']

function semCodigo(resposta: RespostaDaFerramenta): void {
  const corpo = JSON.stringify(resposta.corpo)
  for (const codigo of CODIGOS) expect(corpo).not.toContain(codigo)
}

describe('carga válida (primeiro critério de aceite da F4)', () => {
  test('o lead sai na etapa certa, com pontuação, temperatura e dor, sem ninguém digitar', async () => {
    const b = montar()
    const resposta = await b.chamar(CARGA)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: true,
      data: { lead_id: LEAD, score: 80 },
      speech: FALAS_DA_QUALIFICACAO.registrada,
    })
    expect(b.escritas).toEqual(['gravarLead', 'moverEtapa', 'gravarClassificacao'])
    expect(b.etapas).toEqual([[LEAD, 'qualified']])
    expect(b.leads[0]).toEqual({
      contaId: CONTA,
      leadId: LEAD,
      score: 80,
      temperatura: 'quente',
      sentimento: 0.4,
      briefing: { pain: 'Entregas controladas em planilha.', next_action: 'Especialista liga na terça.' },
    })
    expect(b.classificacoes[0]).toMatchObject({ stage_key: 'qualified', temperature: 'quente', score: 80 })
  })

  test('meeting_outcome é aceito e não vira escrita nenhuma', async () => {
    const b = montar()
    await b.chamar(CARGA)
    expect(JSON.stringify([b.leads, b.classificacoes])).not.toContain('attended')
  })

  test('a invocação é registrada com pedido, resposta e latência', async () => {
    const b = montar()
    await b.chamar(CARGA)
    expect(b.registros).toHaveLength(1)
    expect(b.registros[0]).toMatchObject({ tool: 'tool-qualify', call_id: CHAMADA_ID, error: null })
    expect(typeof b.registros[0]!.latency_ms).toBe('number')
  })

  test('campo não confirmado vai vazio, e a resposta não traz texto que não veio', async () => {
    const b = montar()
    const resposta = await b.chamar({ stage_key: 'contacted' })
    expect(resposta.corpo.ok).toBe(true)
    expect(b.leads[0]!.briefing).toEqual({})
    expect(b.leads[0]!.sentimento).toBeNull()
    expect(b.leads[0]!.score).toBe(0)
    expect(resposta.corpo.speech).toBe(FALAS_DA_QUALIFICACAO.registrada)
    expect(briefingDaEntrada({ pain: '   ', fit: 'ok' })).toEqual({ fit: 'ok' })
  })
})

describe('recusas', () => {
  test('campo faltante: sem stage_key, 400 e nenhuma escrita', async () => {
    const b = montar()
    const resposta = await b.chamar({ pain: 'x' })
    expect(resposta.status).toBe(400)
    expect(b.escritas).toEqual([])
  })

  test('etapa desconhecida: frase de contorno, nenhuma escrita, e o código fica no registro', async () => {
    const b = montar()
    const resposta = await b.chamar({ ...CARGA, stage_key: 'Tem fit' })
    expect(resposta.corpo).toMatchObject({ ok: false, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(b.escritas).toEqual([])
    expect(b.registros[0]!.error).toContain('etapa_desconhecida')
    semCodigo(resposta)
  })

  test('lead ausente: frase de contorno e nenhuma escrita', async () => {
    const b = montar({ chamada: { ...CHAMADA, lead_id: null } })
    const resposta = await b.chamar(CARGA)
    expect(resposta.corpo.ok).toBe(false)
    expect(b.escritas).toEqual([])
    semCodigo(resposta)
  })

  test('segredo inválido: 401 e nenhuma escrita', async () => {
    const b = montar()
    const resposta = await b.chamar(CARGA, { segredo: 'x'.repeat(43) })
    expect(resposta.status).toBe(401)
    expect(b.escritas).toEqual([])
    semCodigo(resposta)
  })

  test('conversa inexistente: 404 e nenhuma escrita', async () => {
    const b = montar()
    const resposta = await b.chamar(CARGA, { conversa: 'conv_desconhecida' })
    expect(resposta.status).toBe(404)
    expect(b.escritas).toEqual([])
  })

  test('propósito errado: 409, segunda linha de RF-309', async () => {
    const b = montar({ chamada: { ...CHAMADA, purpose: 'confirmation' } })
    const resposta = await b.chamar(CARGA)
    expect(resposta.status).toBe(409)
    expect(b.escritas).toEqual([])
    semCodigo(resposta)
  })
})

describe('modo ensaio (T-16)', () => {
  test('lê de verdade, responde a mesma fala e não escreve nada', async () => {
    const real = montar()
    const ensaio = montar({ chamada: { ...CHAMADA, direction: 'rehearsal' } })
    const a = await real.chamar(CARGA)
    const b = await ensaio.chamar(CARGA)
    expect(b.corpo).toEqual(a.corpo)
    expect(ensaio.escritas).toEqual([])
    expect(ensaio.registros).toHaveLength(1)
  })
})

// "O mesmo tipo de resultado" (US-139, segundo critério de aceite da F4): a
// mesma conversa qualificada pela ferramenta, ao vivo, e pela retaguarda,
// depois, grava o lead, a etapa e o núcleo da classificação na mesma forma e
// com os mesmos valores. O que difere é só o que cada caminho tem de próprio: a
// origem, a confiança do modelo, o modelo e os campos não confirmados.
//
// Os dois caminhos rodam de verdade — `criarToolQualify` sobre o esqueleto e
// `classificarChamada` —, cada um com as portas em memória. O cenário é próprio
// deste arquivo: importar o de `tool-qualify/qualificacao.test.ts` registraria
// a suíte inteira dele aqui.

import { expect, test } from 'vitest'

import { MODELOS_PADRAO } from '../_shared/modelo/resolucao.ts'
import type { EtapaDoCatalogo } from '../_shared/qualificacao/etapa.ts'
import { REGUA_DE_EXEMPLO } from '../_shared/qualificacao/pontuacao.ts'
import type { GravacaoDoLead } from '../_shared/qualificacao/resultado.ts'
import type { AmbienteDaFerramenta, ChamadaDaFerramenta } from '../_shared/tools/esqueleto.ts'
import { derivarSegredo } from '../_shared/tools/segredo.ts'
import { criarToolQualify, type EscritaDaQualificacao } from '../tool-qualify/qualificacao.ts'

import {
  classificarChamada,
  criteriosDaChamada,
  TETO_DA_CONFIANCA_DA_RETAGUARDA,
  type GravacaoDaClassificacao,
  type PortaDaClassificacao,
} from './classificacao.ts'

const CONTA = '44444444-4444-4444-8444-444444444444'
const CHAMADA = '55555555-5555-4555-8555-555555555555'
const LEAD = '66666666-6666-4666-8666-666666666666'
const CONVERSA = 'conv_mesmo_resultado'
const CHAVE = 'chave-do-servidor-de-teste'
const SEGREDO_INTERNO = 'segredo-interno-de-teste'

const CATALOGO: readonly EtapaDoCatalogo[] = [
  { key: 'new', label: 'Novo', is_won: false, is_lost: false },
  { key: 'contacted', label: 'Contatado', is_won: false, is_lost: false },
  { key: 'qualified', label: 'Tem fit', is_won: false, is_lost: false },
  { key: 'lost', label: 'Perdido', is_won: false, is_lost: true },
]

/** A mesma conversa, como a Sarah a registra e como o modelo a lê. */
const QUALIFICACAO = {
  stage_key: 'qualificado',
  criterios: { dor_confirmada: true, orcamento: false, decisor: true },
  pain: 'Entregas controladas em planilha.',
  objections: 'Contrato com o fornecedor atual até março.',
  next_action: 'Especialista liga na terça.',
  sentiment: 0.3,
}

interface Gravado {
  readonly lead: GravacaoDoLead[]
  readonly etapas: [string, string][]
  readonly classificacao: Record<string, unknown>[]
}

async function pelaFerramenta(): Promise<Gravado> {
  const gravado: Gravado = { lead: [], etapas: [], classificacao: [] }
  const chamada: ChamadaDaFerramenta = {
    id: CHAMADA,
    account_id: CONTA,
    purpose: 'discovery',
    direction: 'outbound',
    lead_id: LEAD,
  }
  const escrita: EscritaDaQualificacao = {
    async gravarLead(g) {
      gravado.lead.push(g)
    },
    async moverEtapa(lead, etapa) {
      gravado.etapas.push([lead, etapa])
    },
    async gravarClassificacao(_conta, _chamada, c) {
      gravado.classificacao.push({ ...c })
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
        return conversaId === CONVERSA && contaId === CONTA ? chamada : null
      },
      async registrarInvocacao() {},
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
  const resposta = await tratar(
    { metodo: 'POST', segredo: await derivarSegredo(CHAVE, CONTA), conversa: CONVERSA, corpo: QUALIFICACAO },
    ambiente,
  )
  expect(resposta.status).toBe(200)
  return gravado
}

async function pelaRetaguarda(): Promise<Gravado & { chamada: GravacaoDaClassificacao[] }> {
  const gravado = { lead: [] as GravacaoDoLead[], etapas: [] as [string, string][], classificacao: [] as Record<string, unknown>[], chamada: [] as GravacaoDaClassificacao[] }
  const porta: PortaDaClassificacao = {
    async lerChamada(id) {
      return {
        id,
        account_id: CONTA,
        purpose: 'discovery',
        lead_id: LEAD,
        direction: 'outbound',
        transcript: {
          turns: [
            { role: 'agent', text: 'Como vocês controlam as entregas?' },
            { role: 'lead', text: 'Em planilha, e o contrato atual vai até março.' },
          ],
        },
        classification_source: null,
        sentiment: null,
        evaluation_score: null,
      }
    },
    async reivindicar() {
      return true
    },
    async concluirClassificacao() {},
    async liberarReivindicacao() {},
    async criteriosDaConta() {
      return []
    },
    async etapasDaConta() {
      return CATALOGO
    },
    async reguaDaConta() {
      return REGUA_DE_EXEMPLO
    },
    async modeloDaConta() {
      return { porta: 'platform', modelo: MODELOS_PADRAO.platform.classify, escolhidoPelaConta: false }
    },
    async perguntarAoModelo() {
      return {
        ok: true,
        status: 200,
        texto: JSON.stringify({
          ...QUALIFICACAO,
          fit: null,
          confidence: 0.97,
          evaluation: criteriosDaChamada('discovery').map((c) => ({ key: c.chave, approved: true, reason: 'ok' })),
        }),
      }
    },
    async gravarClassificacao(_conta, _chamada, g) {
      gravado.chamada.push(g)
      gravado.classificacao.push({ ...(g.classification ?? {}) })
      return true
    },
    async gravarLead(g) {
      gravado.lead.push(g)
    },
    async moverEtapa(lead, etapa) {
      gravado.etapas.push([lead, etapa])
    },
    async gravarCusto() {},
    async registrarEventoDeIntegracao() {},
    async registrarItemDeFila() {
      throw new Error('nenhum item deveria nascer aqui')
    },
  }
  const resposta = await classificarChamada(
    { metodo: 'POST', chamadaId: CHAMADA, segredoInterno: SEGREDO_INTERNO },
    porta,
    { segredoInterno: SEGREDO_INTERNO },
  )
  expect(resposta.status).toBe(200)
  return gravado
}

/** O que só a retaguarda tem. */
const PROPRIOS_DA_RETAGUARDA = ['confidence', 'nao_confirmados', 'modelo']

test('a mesma entrada produz o mesmo lead, a mesma etapa e o mesmo núcleo de classificação', async () => {
  const ferramenta = await pelaFerramenta()
  const retaguarda = await pelaRetaguarda()

  expect(retaguarda.lead).toEqual(ferramenta.lead)
  expect(retaguarda.etapas).toEqual(ferramenta.etapas)
  expect(ferramenta.etapas).toEqual([[LEAD, 'qualified']])

  const nucleo = Object.fromEntries(
    Object.entries(retaguarda.classificacao[0] ?? {}).filter(([chave]) => !PROPRIOS_DA_RETAGUARDA.includes(chave)),
  )
  expect(nucleo).toEqual(ferramenta.classificacao[0])
  // A forma, e não só os valores: as mesmas chaves nos dois lados.
  expect(Object.keys(nucleo).sort()).toEqual(Object.keys(ferramenta.classificacao[0] ?? {}).sort())
})

test('o que difere é a origem e a confiança: backfill abaixo do teto, e a ferramenta sem confiança nenhuma', async () => {
  const retaguarda = await pelaRetaguarda()
  const gravacao = retaguarda.chamada[0]
  expect(gravacao?.classification_source).toBe('backfill')
  // O modelo se declarou 0,97 seguro; o teto é da retaguarda.
  expect(gravacao?.classification_confidence).toBe(TETO_DA_CONFIANCA_DA_RETAGUARDA)
  const ferramenta = await pelaFerramenta()
  expect(ferramenta.classificacao[0]).not.toHaveProperty('confidence')
})

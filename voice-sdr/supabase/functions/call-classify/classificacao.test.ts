// Provas da classificação de retaguarda. Ambiente node, sem rede e sem banco:
// a porta é um `Proxy` que registra todo membro tocado, sobre uma chamada em
// memória que implementa a condição do `update`, e o modelo é um dublê que
// devolve o texto que o caso manda.
//
// O que este arquivo segura:
//
// 1. **A classificação gravada com `source='backfill'`**, que em F2 é o caso
//    de toda chamada.
// 2. **O mapeamento por `stage_key`** (RF-203): renomear a etapa não muda a
//    classificação, e o rótulo em português no lugar da chave é recusado.
// 3. **Campo não confirmado sai vazio**, com a razão, e nunca aproximado.
// 4. **Sentimento fora da faixa é recusado**, e não recortado.
// 5. **Falha do modelo** responde 503 sem gravar classificação — e, em
//    `call-finalize/finalizacao.test.ts`, não trava a finalização.
// 6. **O modelo é `claude-sonnet-5`**, e o rastro e o custo levam o `call_id`.
// 7. **O ramo da ferramenta** (F4): a classificação confirmada ao vivo não é
//    sobrescrita.
// 8. **As quatro escritas da retaguarda** (US-139): a chamada, o lead, a
//    etapa pelo RPC e o custo, com a etapa e a pontuação dos módulos
//    compartilhados. A forma comparada com a de tool-qualify está em
//    `mesmo-resultado.test.ts`.
// 9. **A correção humana** sai com `ja_corrigida`, antes e durante a corrida;
//    **sem transcrição** é recusa própria; **modelo fora do ar** abre uma
//    pendência na fila, e só uma.
//
// CLASSIFICAÇÃO POR MODELO NÃO É DETERMINÍSTICA: aqui se prova o contrato e o
// caminho, com o modelo dublado. O acerto do julgamento é do CI e de revisão
// humana.

import { describe, expect, test } from 'vitest'

import { MODELOS_PADRAO } from '../_shared/modelo/resolucao.ts'
import { LINHAS_DA_SEMENTE, type LinhaDeCriterio } from '../_shared/qualificacao/avaliacao.ts'
import { REGUA_DE_EXEMPLO, type Regua } from '../_shared/qualificacao/pontuacao.ts'
import type { GravacaoDoLead } from '../_shared/qualificacao/resultado.ts'

import {
  chaveDaPendencia,
  classificarChamada,
  confiancaDaRetaguarda,
  avaliacaoAutomatica,
  criteriosDaChamada,
  custoEmCentavos,
  decidirRamo,
  FONTE_DO_CUSTO,
  GENERO_DA_PENDENCIA,
  PROVEDOR_DO_MODELO,
  TAREFA_DA_CLASSIFICACAO,
  TETO_DA_CONFIANCA_DA_RETAGUARDA,
  type ChamadaParaClassificar,
  type CondicaoDaGravacao,
  type CorpoDaClassificacao,
  type EtapaDoFunil,
  type EventoDeIntegracao,
  type GravacaoDaClassificacao,
  type ItemDaPendencia,
  type LinhaDeCusto,
  type PedidoAoModelo,
  type PortaDaClassificacao,
  type RespostaDaClassificacao,
  type RespostaDoModelo,
} from './classificacao.ts'

const SEGREDO = 'segredo-interno-desta-instalacao'
const CONTA = '11111111-1111-4111-8111-111111111111'
const CHAMADA = '22222222-2222-4222-8222-222222222222'
const LEAD = '33333333-3333-4333-8333-333333333333'

const ETAPAS: readonly EtapaDoFunil[] = [
  { key: 'new', label: 'Novo', is_won: false, is_lost: false },
  { key: 'contacted', label: 'Contatado', is_won: false, is_lost: false },
  { key: 'qualified', label: 'Qualificado', is_won: false, is_lost: false },
  { key: 'meeting_booked', label: 'Reunião marcada', is_won: false, is_lost: false },
  { key: 'won', label: 'Ganho', is_won: true, is_lost: false },
  { key: 'lost', label: 'Perdido', is_won: false, is_lost: true },
]

/** As mesmas chaves com os rótulos que o cliente escolheu. */
const ETAPAS_RENOMEADAS: readonly EtapaDoFunil[] = ETAPAS.map((etapa) => ({
  ...etapa,
  label: `Coluna ${etapa.label.toUpperCase()} renomeada`,
}))

const TRANSCRICAO = {
  turns: [
    { role: 'agent', text: 'Oi, Marcos! Aqui é a Sarah. A ligação é gravada.', at: '2026-03-20T10:00:01Z' },
    { role: 'lead', text: 'Tudo bem, pode falar.', at: '2026-03-20T10:00:06Z' },
    { role: 'agent', text: 'Como vocês organizam as entregas hoje?', at: '2026-03-20T10:00:09Z' },
    { role: 'lead', text: 'Tudo em planilha, e atrasa toda semana.', at: '2026-03-20T10:00:14Z' },
  ],
}

function respostaDoModelo(ajustes: Record<string, unknown> = {}): string {
  return JSON.stringify({
    stage_key: 'qualified',
    criterios: { dor_confirmada: true, orcamento: true, decisor: true, prazo: null },
    pain: 'Entregas controladas em planilha, com atraso semanal.',
    fit: 'Frota própria de 40 caminhões.',
    objections: 'Já tentou um sistema e desistiu.',
    next_action: 'Especialista liga na terça à tarde.',
    sentiment: 0.4,
    confidence: 0.7,
    evaluation: criteriosDaChamada('discovery').map((criterio) => ({
      key: criterio.chave,
      approved: true,
      reason: 'Conferido na conversa.',
    })),
    ...ajustes,
  })
}

interface Bancada {
  readonly porta: PortaDaClassificacao
  readonly tocados: string[]
  readonly pedidos: PedidoAoModelo[]
  readonly gravacoes: { gravacao: GravacaoDaClassificacao; condicao: CondicaoDaGravacao }[]
  readonly custos: LinhaDeCusto[]
  readonly eventos: EventoDeIntegracao[]
  readonly leads: GravacaoDoLead[]
  /** [lead, etapa] de cada movimento, na ordem. */
  readonly movimentos: [string, string][]
  /** As pendências abertas, deduplicadas pela chave como `registrar_item_de_fila`. */
  readonly itens: ItemDaPendencia[]
  /** A ordem das escritas, pelo nome do membro da porta. */
  readonly escritas: string[]
  readonly chamada: ChamadaEmMemoria
  /** `classify_started_at` e `classified_at` da linha em memória (US-140). */
  readonly trava: { reivindicada: boolean; concluida: boolean }
}

/** A linha em memória, que o dublê da corrida escreve por fora. */
type ChamadaEmMemoria = { -readonly [K in keyof ChamadaParaClassificar]: ChamadaParaClassificar[K] }

interface AjustesDaBancada {
  chamada?: Partial<ChamadaParaClassificar>
  etapas?: readonly EtapaDoFunil[]
  regua?: Regua
  modelo?: RespostaDoModelo
  /** De qual modelo a conta fala. Sem isto, a plataforma com o padrão (US-246). */
  portaDoModelo?: { porta: 'platform' | 'openrouter'; modelo: string; escolhidoPelaConta: boolean }
  semChamada?: boolean
  /** `evaluation_criteria` da conta; ausente é nenhum. */
  criterios?: readonly LinhaDeCriterio[]
}

function bancada(ajustes: AjustesDaBancada = {}): Bancada {
  const tocados: string[] = []
  const pedidos: PedidoAoModelo[] = []
  const gravacoes: Bancada['gravacoes'] = []
  const custos: LinhaDeCusto[] = []
  const eventos: EventoDeIntegracao[] = []
  const leads: GravacaoDoLead[] = []
  const movimentos: [string, string][] = []
  const itens: ItemDaPendencia[] = []
  const escritas: string[] = []
  const chamada = {
    id: CHAMADA,
    account_id: CONTA,
    purpose: 'discovery',
    lead_id: LEAD,
    direction: 'outbound',
    transcript: TRANSCRICAO,
    classification_source: null,
    sentiment: null,
    evaluation_score: null,
    ...ajustes.chamada,
  } as ChamadaEmMemoria
  const trava = { reivindicada: false, concluida: false }

  const real: PortaDaClassificacao = {
    async lerChamada(chamadaId) {
      return ajustes.semChamada || chamadaId !== CHAMADA ? null : { ...chamada }
    },
    // O `where` de `reivindicar_classificacao`, sem o relógio: a trava só se
    // solta por `liberarReivindicacao`.
    async reivindicar() {
      if (trava.concluida || trava.reivindicada || chamada.classification_source === 'human') return false
      trava.reivindicada = true
      return true
    },
    async concluirClassificacao() {
      trava.concluida = true
    },
    async liberarReivindicacao() {
      trava.reivindicada = false
    },
    async criteriosDaConta() {
      return ajustes.criterios ?? []
    },
    async etapasDaConta() {
      return ajustes.etapas ?? ETAPAS
    },
    async reguaDaConta() {
      return ajustes.regua ?? REGUA_DE_EXEMPLO
    },
    async modeloDaConta() {
      return (
        ajustes.portaDoModelo ?? {
          porta: 'platform' as const,
          modelo: MODELOS_PADRAO.platform[TAREFA_DA_CLASSIFICACAO],
          escolhidoPelaConta: false,
        }
      )
    },
    async perguntarAoModelo(pedido) {
      pedidos.push(pedido)
      return (
        ajustes.modelo ?? {
          ok: true,
          status: 200,
          latenciaMs: 1800,
          endpoint: 'v1/messages',
          texto: respostaDoModelo(),
          tokensDeEntrada: 4_000,
          tokensDeSaida: 300,
        }
      )
    },
    // A condição do `update`, ao pé da letra, sobre a linha em memória.
    async gravarClassificacao(_conta, _chamada, gravacao, condicao) {
      const casa =
        condicao === 'sem_origem'
          ? chamada.classification_source === null
          : chamada.classification_source === 'tool' && chamada.evaluation_score === null
      if (!casa) return false
      escritas.push('gravarClassificacao')
      gravacoes.push({ gravacao, condicao })
      if (gravacao.classification_source) chamada.classification_source = gravacao.classification_source
      chamada.evaluation_score = gravacao.evaluation_score ?? chamada.evaluation_score
      return true
    },
    async gravarLead(gravacao) {
      escritas.push('gravarLead')
      leads.push(gravacao)
    },
    async moverEtapa(leadId, stageKey) {
      escritas.push('moverEtapa')
      movimentos.push([leadId, stageKey])
    },
    async registrarItemDeFila(item) {
      if (itens.some((aberto) => aberto.deduplicacao_key === item.deduplicacao_key)) return 'ja_aberto'
      itens.push(item)
      return 'criado'
    },
    async gravarCusto(linha) {
      escritas.push('gravarCusto')
      const existe = custos.some(
        (c) => c.call_id === linha.call_id && c.component === linha.component && c.source === linha.source,
      )
      if (!existe) custos.push(linha)
    },
    async registrarEventoDeIntegracao(evento) {
      eventos.push(evento)
    },
  }

  const porta = new Proxy(real, {
    get(alvo, membro, receptor) {
      tocados.push(String(membro))
      return Reflect.get(alvo, membro, receptor) as unknown
    },
  })

  return { porta, tocados, pedidos, gravacoes, custos, eventos, leads, movimentos, itens, escritas, chamada, trava }
}

function classificar(b: Bancada, pedido: Partial<{ chamadaId: unknown; segredo: string | null; metodo: string }> = {}) {
  return classificarChamada(
    {
      metodo: pedido.metodo ?? 'POST',
      chamadaId: 'chamadaId' in pedido ? pedido.chamadaId : CHAMADA,
      segredoInterno: 'segredo' in pedido ? (pedido.segredo ?? null) : SEGREDO,
    },
    b.porta,
    { segredoInterno: SEGREDO },
  )
}

function corpo(resposta: RespostaDaClassificacao): CorpoDaClassificacao {
  expect(resposta.corpo.ok).toBe(true)
  return resposta.corpo as CorpoDaClassificacao
}

function gravada(b: Bancada): GravacaoDaClassificacao {
  const ultima = b.gravacoes.at(-1)
  if (!ultima) throw new Error('nenhuma classificação gravada')
  return ultima.gravacao
}

describe('o portão interno', () => {
  test('sem o segredo, com o segredo errado e com a instalação sem segredo: 401, e a porta intocada', async () => {
    for (const [segredo, instalacao] of [
      [null, SEGREDO],
      ['outro-segredo', SEGREDO],
      [SEGREDO, ''],
    ] as const) {
      const b = bancada()
      const resposta = await classificarChamada(
        { metodo: 'POST', chamadaId: CHAMADA, segredoInterno: segredo },
        b.porta,
        { segredoInterno: instalacao },
      )
      expect(resposta.status).toBe(401)
      expect(b.tocados).toEqual([])
    }
  })

  test('método diferente de POST e call_id que não é uuid não chegam à porta', async () => {
    const b = bancada()
    expect((await classificar(b, { metodo: 'GET' })).status).toBe(405)
    for (const chamadaId of [null, 42, '', 'nao-e-uuid']) {
      expect((await classificar(b, { chamadaId })).status).toBe(400)
    }
    expect(b.tocados).toEqual([])
  })

  test('chamada que não existe: 404, sem perguntar ao modelo', async () => {
    const b = bancada({ semChamada: true })
    expect((await classificar(b)).status).toBe(404)
    expect(b.pedidos).toHaveLength(0)
  })
})

describe('a retaguarda, que em F2 é toda chamada', () => {
  test('grava a classificação com source=backfill, o sentimento e a avaliação', async () => {
    const b = bancada()
    const resposta = corpo(await classificar(b))
    expect(resposta).toMatchObject({ desfecho: 'classificada', ramo: 'retaguarda', naoConfirmados: [] })
    expect(b.gravacoes).toHaveLength(1)
    expect(b.gravacoes[0]?.condicao).toBe('sem_origem')
    const g = gravada(b)
    expect(g.classification_source).toBe('backfill')
    expect(typeof g.classification_confidence).toBe('number')
    expect(g.classification_confidence).toBeLessThan(1)
    // Régua de exemplo: dor 30 + orçamento 25 + decisor 25 = 80, quente.
    expect(g.classification).toMatchObject({
      stage_key: 'qualified',
      score: 80,
      temperature: 'quente',
      pain: 'Entregas controladas em planilha, com atraso semanal.',
      next_action: 'Especialista liga na terça à tarde.',
      criterios_atendidos: ['dor_confirmada', 'orcamento', 'decisor'],
      criterios_faltando: ['prazo'],
      criterios_reprovados: [],
      confidence: 0.7,
      nao_confirmados: {},
      modelo: 'claude-sonnet-5',
    })
    expect(g.classification_confidence).toBe(0.7)
    expect(g.sentiment).toBe(0.4)
    expect(g.evaluation_score).toBe(10)
  })

  test('sem origem de classificação o ramo é a retaguarda; com backfill, já classificada', () => {
    expect(decidirRamo({ classification_source: null, evaluation_score: null })).toBe('retaguarda')
    expect(decidirRamo({ classification_source: 'backfill', evaluation_score: 7 })).toBe('ja_classificada')
    expect(decidirRamo({ classification_source: 'backfill', evaluation_score: null })).toBe('ja_classificada')
    expect(decidirRamo({ classification_source: 'human', evaluation_score: null })).toBe('ja_corrigida')
  })

  test('segunda passagem com a chamada já classificada: 409, sem perguntar ao modelo', async () => {
    const b = bancada({ chamada: { classification_source: 'backfill' } })
    expect((await classificar(b)).status).toBe(409)
    expect(b.pedidos).toHaveLength(0)
  })

  test('duas passagens em sequência gravam uma vez só: sem segundo movimento de etapa nem segundo item', async () => {
    const b = bancada()
    expect((await classificar(b)).status).toBe(200)
    const segunda = await classificar(b)
    expect(segunda.status).toBe(409)
    expect(segunda.corpo).toMatchObject({ ok: false, motivo: 'ja_classificada' })
    expect(b.gravacoes).toHaveLength(1)
    expect(b.pedidos).toHaveLength(1)
    expect(b.leads).toHaveLength(1)
    // O movimento é o que escreve o lead_event: um só.
    expect(b.movimentos).toHaveLength(1)
    expect(b.itens).toHaveLength(0)
  })

  test('a corrida: a outra passagem grava entre a leitura e o update, e esta recebe 409', async () => {
    const b = bancada()
    const perguntar = b.porta.perguntarAoModelo.bind(b.porta)
    // O dublê da corrida: a recuperação classifica enquanto o modelo pensa.
    Object.defineProperty(b.porta, 'perguntarAoModelo', {
      value: async (pedido: PedidoAoModelo) => {
        const resposta = await perguntar(pedido)
        b.chamada.classification_source = 'backfill'
        return resposta
      },
    })
    const resposta = await classificar(b)
    expect(resposta.status).toBe(409)
    expect(resposta.corpo).toMatchObject({ motivo: 'ja_classificada' })
    expect(b.gravacoes).toHaveLength(0)
    // Quem perdeu o update não mexe no lead.
    expect(b.leads).toHaveLength(0)
    expect(b.movimentos).toHaveLength(0)
  })

  test.each([null, {}, { turns: [] }, { turns: [{ role: 'agent', text: '   ' }] }, 'texto'])(
    'transcrição %j: recusa sem_transcricao, definitiva, sem perguntar ao modelo',
    async (transcript) => {
      const b = bancada({ chamada: { transcript } })
      const resposta = await classificar(b)
      expect(resposta.status).toBe(422)
      expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'sem_transcricao' })
      expect(b.pedidos).toHaveLength(0)
      expect(b.escritas).toEqual([])
    },
  )

  test('transcrição sem fala do interlocutor: nada a classificar, e o modelo não é chamado', async () => {
    const b = bancada({
      chamada: { transcript: { turns: [{ role: 'agent', text: 'Alô? Alô?', at: '2026-03-20T10:00:01Z' }] } },
    })
    expect(corpo(await classificar(b)).desfecho).toBe('sem_conversa')
    expect(b.pedidos).toHaveLength(0)
    expect(b.gravacoes).toHaveLength(0)
  })
})

describe('a etapa é a chave, nunca o nome (RF-203)', () => {
  test('o modelo recebe chave e rótulo de cada etapa da conta', async () => {
    const b = bancada()
    await classificar(b)
    const mensagem = b.pedidos[0]?.mensagem ?? ''
    for (const etapa of ETAPAS) expect(mensagem).toContain(`- ${etapa.key}: ${etapa.label}`)
  })

  test('renomear as colunas do funil não muda a classificação', async () => {
    const original = bancada()
    const renomeada = bancada({ etapas: ETAPAS_RENOMEADAS })
    await classificar(original)
    await classificar(renomeada)
    expect(renomeada.pedidos[0]?.mensagem).toContain('Coluna QUALIFICADO renomeada')
    expect(gravada(renomeada).classification).toEqual(gravada(original).classification)
    expect(gravada(renomeada).classification?.stage_key).toBe('qualified')
  })

  test('o rótulo em português no lugar da chave é recusado, e o campo sai vazio com a razão', async () => {
    const b = bancada({
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ stage_key: 'Qualificado' }), tokensDeEntrada: 10, tokensDeSaida: 10 },
    })
    const resposta = corpo(await classificar(b))
    expect(gravada(b).classification).toMatchObject({
      stage_key: null,
      nao_confirmados: { stage_key: 'fora_do_vocabulario' },
    })
    expect(resposta.naoConfirmados).toContain('stage_key')
  })

  test('chave que não está no funil da conta também é recusada', async () => {
    const semGanho = ETAPAS.filter((etapa) => etapa.key !== 'won')
    const b = bancada({
      etapas: semGanho,
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ stage_key: 'won' }), tokensDeEntrada: 10, tokensDeSaida: 10 },
    })
    await classificar(b)
    expect(gravada(b).classification?.stage_key).toBeNull()
  })
})

describe('campo não confirmado vai vazio; inventar é proibido', () => {
  test('etapa inventada e dor ausente saem vazias, cada uma com a razão, e a etapa não se move', async () => {
    const b = bancada({
      modelo: {
        ok: true,
        status: 200,
        texto: respostaDoModelo({ stage_key: 'quase_fechado', pain: null, next_action: 42 }),
        tokensDeEntrada: 10,
        tokensDeSaida: 10,
      },
    })
    const resposta = corpo(await classificar(b))
    const classificacao = gravada(b).classification
    expect(classificacao).toMatchObject({
      stage_key: null,
      nao_confirmados: {
        stage_key: 'fora_do_vocabulario',
        pain: 'nao_informado',
        next_action: 'tipo_invalido',
      },
    })
    // Campo não confirmado não vira frase: a chave nem aparece.
    expect(classificacao).not.toHaveProperty('pain')
    expect(classificacao).not.toHaveProperty('next_action')
    expect(resposta.naoConfirmados).toEqual(['stage_key', 'pain', 'next_action'])
    expect(resposta.etapa).toBeNull()
    expect(b.movimentos).toEqual([])
    // O que o modelo confirmou continua gravado ao lado do que ficou vazio.
    expect(gravada(b).sentiment).toBe(0.4)
    expect(b.leads[0]?.briefing).toEqual({
      fit: 'Frota própria de 40 caminhões.',
      objections: 'Já tentou um sistema e desistiu.',
    })
  })

  test('a temperatura é da régua, nunca do modelo: a que ele mandar é ignorada', async () => {
    const b = bancada({
      modelo: {
        ok: true,
        status: 200,
        texto: respostaDoModelo({ temperature: 'quente', criterios: { dor_confirmada: true } }),
        tokensDeEntrada: 1,
        tokensDeSaida: 1,
      },
    })
    await classificar(b)
    expect(gravada(b).classification).toMatchObject({ score: 30, temperature: 'frio' })
  })

  test.each([
    ['ausentes', undefined, 'nao_informado'],
    ['nulos', null, 'nao_informado'],
    ['em lista', [true, true], 'tipo_invalido'],
    ['em texto', 'todos', 'tipo_invalido'],
  ])('critérios de qualificação %s não pontuam, com a razão', async (_nome, criterios, motivo) => {
    const b = bancada({
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ criterios }), tokensDeEntrada: 1, tokensDeSaida: 1 },
    })
    await classificar(b)
    expect(gravada(b).classification).toMatchObject({
      score: 0,
      temperature: 'frio',
      criterios_faltando: REGUA_DE_EXEMPLO.criterios.map((c) => c.key),
      nao_confirmados: { criterios: motivo },
    })
  })

  test('resposta de critério que não é booleana é não confirmada, e não conta', async () => {
    const b = bancada({
      modelo: {
        ok: true,
        status: 200,
        texto: respostaDoModelo({ criterios: { dor_confirmada: 'sim', orcamento: 1, decisor: true, prazo: false } }),
        tokensDeEntrada: 1,
        tokensDeSaida: 1,
      },
    })
    await classificar(b)
    expect(gravada(b).classification).toMatchObject({
      score: 25,
      criterios_atendidos: ['decisor'],
      criterios_faltando: ['dor_confirmada', 'orcamento'],
      criterios_reprovados: ['prazo'],
    })
  })

  test('régua inválida: score e temperatura vazios, e o lead não é pontuado', async () => {
    const b = bancada({ regua: { criterios: [{ key: 'x', peso: 50 }], cortes: { morno: 40, quente: 70 } } })
    await classificar(b)
    expect(gravada(b).classification).toMatchObject({
      score: null,
      temperature: null,
      nao_confirmados: { score: 'regua_invalida' },
    })
    expect(b.leads).toEqual([])
    expect(b.movimentos).toEqual([[LEAD, 'qualified']])
  })

  test('confiança fora da faixa sai vazia, e a coluna grava zero', async () => {
    const b = bancada({
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ confidence: 1.4 }), tokensDeEntrada: 1, tokensDeSaida: 1 },
    })
    await classificar(b)
    expect(gravada(b).classification).toMatchObject({ confidence: null, nao_confirmados: { confidence: 'fora_da_faixa' } })
    expect(gravada(b).classification_confidence).toBe(0)
  })

  test('critério de avaliação que o modelo não decidiu fica nulo e fora da nota', async () => {
    const [primeiro, segundo] = criteriosDaChamada('discovery')
    const b = bancada({
      modelo: {
        ok: true,
        status: 200,
        texto: respostaDoModelo({
          evaluation: [
            { key: primeiro?.chave, approved: true, reason: 'ok' },
            { key: segundo?.chave, approved: false, reason: 'não fez' },
            { key: 'criterio_inventado', approved: true, reason: 'x' },
          ],
        }),
        tokensDeEntrada: 1,
        tokensDeSaida: 1,
      },
    })
    const resposta = corpo(await classificar(b))
    const g = gravada(b)
    expect(g.evaluation_score).toBe(5)
    const criterios = (g.evaluation as { criterios: Record<string, unknown> }).criterios
    expect(Object.keys(criterios)).toEqual(criteriosDaChamada('discovery').map((c) => c.chave))
    expect(criterios).not.toHaveProperty('criterio_inventado')
    expect(resposta.naoConfirmados.filter((campo) => campo.startsWith('evaluation.'))).toHaveLength(
      criteriosDaChamada('discovery').length - 2,
    )
  })

  test('nenhum critério decidido: nota nula, não zero', async () => {
    const b = bancada({
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ evaluation: [] }), tokensDeEntrada: 1, tokensDeSaida: 1 },
    })
    await classificar(b)
    expect(gravada(b).evaluation_score).toBeNull()
  })

  test('texto que não é o objeto combinado: 503, nada gravado e a pendência na fila', async () => {
    for (const texto of ['não é json', '[]', 'null', '"qualified"']) {
      const b = bancada({ modelo: { ok: true, status: 200, texto, tokensDeEntrada: 1, tokensDeSaida: 1 } })
      const resposta = await classificar(b)
      expect(resposta.status).toBe(503)
      expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'resposta_ilegivel' })
      expect(b.gravacoes).toHaveLength(0)
      expect(b.leads).toHaveLength(0)
      expect(b.movimentos).toHaveLength(0)
      expect(b.itens.map((item) => item.context)).toEqual([{ call_id: CHAMADA, motivo: 'resposta_ilegivel' }])
    }
  })
})

describe('o sentimento, entre -1 e 1', () => {
  test.each([1.5, -1.01, 3])('%s está fora da faixa: sai nulo, e não recortado', async (sentimento) => {
    const b = bancada({
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ sentiment: sentimento }), tokensDeEntrada: 1, tokensDeSaida: 1 },
    })
    await classificar(b)
    expect(gravada(b).sentiment).toBeNull()
    expect(gravada(b).classification).toMatchObject({ nao_confirmados: { sentiment: 'fora_da_faixa' } })
  })

  test.each([-1, 0, 1])('%s está na faixa e é gravado', async (sentimento) => {
    const b = bancada({
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ sentiment: sentimento }), tokensDeEntrada: 1, tokensDeSaida: 1 },
    })
    await classificar(b)
    expect(gravada(b).sentiment).toBe(sentimento)
  })

  test('sentimento em texto é tipo inválido', async () => {
    const b = bancada({
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ sentiment: '0.5' }), tokensDeEntrada: 1, tokensDeSaida: 1 },
    })
    await classificar(b)
    expect(gravada(b).classification).toMatchObject({ nao_confirmados: { sentiment: 'tipo_invalido' } })
  })
})

describe('o modelo fora do ar', () => {
  test('responde 503 modelo_indisponivel e não grava classificação nem custo', async () => {
    const b = bancada({ modelo: { ok: false, status: 529, latenciaMs: 30_000, endpoint: 'v1/messages' } })
    const resposta = await classificar(b)
    expect(resposta.status).toBe(503)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'modelo_indisponivel' })
    expect(b.tocados).not.toContain('gravarClassificacao')
    expect(b.custos).toHaveLength(0)
    // O rastro fica, que é por onde se descobre a falha.
    expect(b.eventos).toHaveLength(1)
    expect(b.eventos[0]).toMatchObject({ correlation_id: CHAMADA, status_code: 529 })
  })

  test('deixa a chamada classificável e abre uma pendência na fila, e só uma', async () => {
    const b = bancada({ modelo: { ok: false, status: 529, endpoint: 'v1/messages' } })
    await classificar(b)
    await classificar(b)
    expect(b.chamada.classification_source).toBeNull()
    expect(b.tocados).not.toContain('gravarLead')
    expect(b.tocados).not.toContain('moverEtapa')
    expect(b.itens).toEqual([
      {
        account_id: CONTA,
        kind: GENERO_DA_PENDENCIA,
        severity: 'media',
        deduplicacao_key: chaveDaPendencia(CHAMADA),
        context: { call_id: CHAMADA, motivo: 'modelo_indisponivel' },
        lead_id: LEAD,
        call_id: CHAMADA,
      },
    ])
    expect(b.tocados.filter((membro) => membro === 'registrarItemDeFila')).toHaveLength(2)
  })

  test('sem provedor conectado é configuração, não pendência: 428 e nenhum item', async () => {
    const b = bancada({ modelo: { ok: false, codigo: 'sem_credencial', status: null, endpoint: 'v1/messages' } })
    const resposta = await classificar(b)
    expect(resposta.status).toBe(428)
    expect(b.itens).toEqual([])
  })

  test('ensaio com o modelo fora do ar não abre item na fila', async () => {
    const b = bancada({ chamada: { direction: 'rehearsal' }, modelo: { ok: false, status: 529 } })
    expect((await classificar(b)).status).toBe(503)
    expect(b.itens).toEqual([])
  })

  test('porta que levanta vira 503 falha_interna, e nunca exceção', async () => {
    const b = bancada()
    Object.defineProperty(b.porta, 'etapasDaConta', {
      value: async () => {
        throw new Error('banco caiu')
      },
    })
    const resposta = await classificar(b)
    expect(resposta.status).toBe(503)
    expect(resposta.corpo).toMatchObject({ motivo: 'falha_interna' })
  })
})

describe('o modelo, o rastro e o custo', () => {
  test('o id do modelo é claude-sonnet-5', async () => {
    expect(MODELOS_PADRAO.platform[TAREFA_DA_CLASSIFICACAO]).toBe('claude-sonnet-5')
    const b = bancada()
    await classificar(b)
    expect(b.pedidos.map((pedido) => pedido.modelo)).toEqual(['claude-sonnet-5'])
  })

  test('integration_events com correlation_id igual ao call_id, sem a transcrição', async () => {
    const b = bancada()
    await classificar(b)
    expect(b.eventos).toHaveLength(1)
    expect(b.eventos[0]).toMatchObject({
      account_id: CONTA,
      provider: PROVEDOR_DO_MODELO,
      correlation_id: CHAMADA,
      status_code: 200,
      latency_ms: 1800,
      request: { model: 'claude-sonnet-5', turnos: 4 },
    })
    expect(JSON.stringify(b.eventos[0])).not.toContain('planilha')
  })

  test('o custo do componente model em call_costs, pelo preço do sonnet', async () => {
    const b = bancada()
    await classificar(b)
    // 4.000 × US$ 2/M + 300 × US$ 10/M = US$ 0,011 → 1 centavo.
    expect(b.custos).toEqual([
      { account_id: CONTA, call_id: CHAMADA, component: 'model', amount_cents: 1, currency: 'USD', source: FONTE_DO_CUSTO },
    ])
    expect(custoEmCentavos({ tokensDeEntrada: 1_000_000, tokensDeSaida: 1_000_000 })).toBe(1200)
    expect(custoEmCentavos({ tokensDeEntrada: null, tokensDeSaida: 10 })).toBeNull()
  })

  test('uso que não voltou não vira custo zero', async () => {
    const b = bancada({ modelo: { ok: true, status: 200, texto: respostaDoModelo() } })
    await classificar(b)
    expect(b.tocados).not.toContain('gravarCusto')
  })

  test('os critérios pedidos são os da publicação daquele propósito (RF-314)', async () => {
    const b = bancada({ chamada: { purpose: 'reminder' } })
    await classificar(b)
    const mensagem = b.pedidos[0]?.mensagem ?? ''
    for (const criterio of criteriosDaChamada('reminder')) expect(mensagem).toContain(criterio.chave)
    expect(mensagem).not.toContain('fechamento_sem_promessa')
    expect(criteriosDaChamada('discovery').map((c) => c.chave)).toContain('fechamento_sem_promessa')
  })
})

describe('o ramo da ferramenta, para a F4 só ligar', () => {
  test('classificada por tool-qualify: não sobrescreve a classificação e grava só a avaliação', async () => {
    const b = bancada({ chamada: { classification_source: 'tool', sentiment: -0.2 } })
    const resposta = corpo(await classificar(b))
    expect(resposta.ramo).toBe('ferramenta')
    expect(b.gravacoes[0]?.condicao).toBe('por_ferramenta')
    const g = gravada(b)
    expect(g).not.toHaveProperty('classification')
    expect(g).not.toHaveProperty('classification_source')
    expect(g).not.toHaveProperty('sentiment')
    expect(g.evaluation_score).toBe(10)
  })

  test('sem o sentimento da ferramenta, a retaguarda o preenche', async () => {
    const b = bancada({ chamada: { classification_source: 'tool', sentiment: null } })
    await classificar(b)
    expect(gravada(b).sentiment).toBe(0.4)
  })

  test('sob a ferramenta a retaguarda não mexe em lead nem etapa, e o modelo fora do ar não abre item', async () => {
    const b = bancada({ chamada: { classification_source: 'tool', sentiment: -0.2 } })
    await classificar(b)
    expect(b.leads).toEqual([])
    expect(b.movimentos).toEqual([])
    const fora = bancada({ chamada: { classification_source: 'tool' }, modelo: { ok: false, status: 529 } })
    expect((await classificar(fora)).status).toBe(503)
    expect(fora.itens).toEqual([])
  })

  test('ferramenta já avaliada: 409, sem perguntar ao modelo', async () => {
    const b = bancada({ chamada: { classification_source: 'tool', evaluation_score: 8 } })
    expect((await classificar(b)).status).toBe(409)
    expect(b.pedidos).toHaveLength(0)
  })
})

describe('a medição que a finalização gravou (US-109)', () => {
  const DIVERGENCIA = {
    encerramento_pessoa_errada: { conforme: false, falas: 3, limite: 2, encerrou_com_end_call: true, requisito: 'RF-422' },
  }

  test('a retaguarda grava o juízo do modelo e carrega evaluation.medicoes adiante', async () => {
    const b = bancada({ chamada: { evaluation: { medicoes: DIVERGENCIA, criterios: { velho: {} } } } })
    await classificar(b)
    const avaliacao = gravada(b).evaluation
    expect(avaliacao.medicoes).toEqual(DIVERGENCIA)
    // O juízo antigo do modelo é trocado pelo novo; só a medição sobrevive.
    expect(avaliacao.criterios).not.toHaveProperty('velho')
    expect(avaliacao.modelo).toBe('claude-sonnet-5')
  })

  test('sob a ferramenta também', async () => {
    const b = bancada({ chamada: { classification_source: 'tool', evaluation: { medicoes: DIVERGENCIA } } })
    await classificar(b)
    expect(gravada(b).evaluation.medicoes).toEqual(DIVERGENCIA)
  })

  test('sem medição, ou com forma inesperada, a avaliação não ganha a chave', async () => {
    for (const evaluation of [undefined, {}, { medicoes: [1] }, { medicoes: 'x' }, 'x']) {
      const b = bancada({ chamada: { evaluation } })
      await classificar(b)
      expect(gravada(b).evaluation).not.toHaveProperty('medicoes')
    }
  })
})

describe('a confiança da retaguarda (US-129)', () => {
  test.each([
    [0.72, 0.72],
    [1, TETO_DA_CONFIANCA_DA_RETAGUARDA],
    [0.95, TETO_DA_CONFIANCA_DA_RETAGUARDA],
    [null, 0],
    [undefined, 0],
    ['alta', 0],
    [-0.2, 0],
    [Number.NaN, 0],
  ])('declarada %s grava %s', (declarada, esperada) => {
    expect(confiancaDaRetaguarda(declarada)).toBe(esperada)
  })

  test('o teto fica abaixo de 1', () => {
    expect(TETO_DA_CONFIANCA_DA_RETAGUARDA).toBeLessThan(1)
  })
})

describe('as quatro escritas da retaguarda (US-139)', () => {
  test('custo, chamada, lead e etapa, nesta ordem, com os módulos compartilhados', async () => {
    const b = bancada()
    const resposta = corpo(await classificar(b))
    expect(b.escritas).toEqual(['gravarCusto', 'gravarClassificacao', 'gravarLead', 'moverEtapa'])
    expect(resposta.etapa).toBe('qualified')
    expect(b.leads).toEqual([
      {
        contaId: CONTA,
        leadId: LEAD,
        score: 80,
        temperatura: 'quente',
        sentimento: 0.4,
        briefing: {
          pain: 'Entregas controladas em planilha, com atraso semanal.',
          fit: 'Frota própria de 40 caminhões.',
          objections: 'Já tentou um sistema e desistiu.',
          next_action: 'Especialista liga na terça à tarde.',
        },
      },
    ])
    expect(b.movimentos).toEqual([[LEAD, 'qualified']])
  })

  test('o desfecho que o mapeamento único conhece vira a etapa canônica', async () => {
    const b = bancada({
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ stage_key: 'sem_interesse' }), tokensDeEntrada: 1, tokensDeSaida: 1 },
    })
    await classificar(b)
    expect(gravada(b).classification?.stage_key).toBe('lost')
    expect(b.movimentos).toEqual([[LEAD, 'lost']])
  })

  test('chave de etapa criada pela conta é aceita', async () => {
    const b = bancada({
      etapas: [...ETAPAS, { key: 'proposta_enviada', label: 'Proposta enviada', is_won: false, is_lost: false }],
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ stage_key: 'proposta_enviada' }), tokensDeEntrada: 1, tokensDeSaida: 1 },
    })
    await classificar(b)
    expect(b.movimentos).toEqual([[LEAD, 'proposta_enviada']])
  })

  test('sentimento nulo vai nulo ao lead, e quem decide não apagar o último é o adaptador', async () => {
    const b = bancada({
      modelo: { ok: true, status: 200, texto: respostaDoModelo({ sentiment: null }), tokensDeEntrada: 1, tokensDeSaida: 1 },
    })
    await classificar(b)
    expect(b.leads[0]?.sentimento).toBeNull()
  })

  test('chamada sem lead classifica a chamada e não toca lead nem etapa', async () => {
    const b = bancada({ chamada: { lead_id: null } })
    expect(corpo(await classificar(b)).etapa).toBeNull()
    expect(b.gravacoes).toHaveLength(1)
    expect(b.tocados).not.toContain('gravarLead')
    expect(b.tocados).not.toContain('moverEtapa')
  })

  test('ensaio grava a chamada e não toca lead nem etapa (T-16)', async () => {
    const b = bancada({ chamada: { direction: 'rehearsal' } })
    await classificar(b)
    expect(b.gravacoes).toHaveLength(1)
    expect(b.tocados).not.toContain('gravarLead')
    expect(b.tocados).not.toContain('moverEtapa')
  })

  test('toda confiança de backfill fica abaixo do teto', async () => {
    for (const confidence of [0, 0.5, 0.9, 0.95, 1]) {
      const b = bancada({
        modelo: { ok: true, status: 200, texto: respostaDoModelo({ confidence }), tokensDeEntrada: 1, tokensDeSaida: 1 },
      })
      await classificar(b)
      expect(gravada(b).classification_confidence).toBeLessThanOrEqual(TETO_DA_CONFIANCA_DA_RETAGUARDA)
      expect(gravada(b).classification_confidence).toBeLessThan(1)
    }
  })

  test('porta de escrita do lead que levanta depois da gravação da chamada: 503, e a chamada já classificada', async () => {
    const b = bancada()
    Object.defineProperty(b.porta, 'gravarLead', {
      value: async () => {
        throw new Error('banco caiu')
      },
    })
    expect((await classificar(b)).status).toBe(503)
    // A queda declarada no cabeçalho: a próxima passagem responde ja_classificada.
    expect((await classificar(b)).corpo).toMatchObject({ motivo: 'ja_classificada' })
  })
})

describe('a correção humana não é reclassificada', () => {
  test('já corrigida: 409 ja_corrigida, sem perguntar ao modelo e sem escrever nada', async () => {
    const b = bancada({ chamada: { classification_source: 'human' } })
    const resposta = await classificar(b)
    expect(resposta.status).toBe(409)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'ja_corrigida' })
    expect(b.pedidos).toHaveLength(0)
    expect(b.escritas).toEqual([])
    expect(b.itens).toEqual([])
  })

  test('a correção chega enquanto o modelo pensa: o update condicionado perde e a resposta é ja_corrigida', async () => {
    const b = bancada()
    const perguntar = b.porta.perguntarAoModelo.bind(b.porta)
    Object.defineProperty(b.porta, 'perguntarAoModelo', {
      value: async (pedido: PedidoAoModelo) => {
        const resposta = await perguntar(pedido)
        b.chamada.classification_source = 'human'
        return resposta
      },
    })
    const resposta = await classificar(b)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'ja_corrigida' })
    expect(b.gravacoes).toHaveLength(0)
    expect(b.leads).toHaveLength(0)
    expect(b.movimentos).toHaveLength(0)
  })
})

describe('a reivindicação da retaguarda (US-140)', () => {
  test('as duas vias no mesmo segundo: uma classificação só, e o modelo perguntado uma vez', async () => {
    const b = bancada()
    // As duas leem a chamada sem classificação antes de qualquer uma seguir:
    // é o caso em que "ler e depois decidir" classificaria duas vezes.
    const ler = b.porta.lerChamada.bind(b.porta)
    let leituras = 0
    let soltar: () => void = () => {}
    const asDuasLeram = new Promise<void>((resolver) => {
      soltar = resolver
    })
    Object.defineProperty(b.porta, 'lerChamada', {
      value: async (id: string) => {
        const lida = await ler(id)
        leituras += 1
        if (leituras === 2) soltar()
        await asDuasLeram
        return lida
      },
    })
    const inicio = performance.now()
    const respostas = await Promise.all([classificar(b), classificar(b)])
    // O que é nosso, com o modelo e o relógio injetados: a medição com rede e
    // modelo de verdade é do degrau 3.
    expect(performance.now() - inicio).toBeLessThan(50)

    expect(respostas.map((r) => r.status).toSorted()).toEqual([200, 409])
    expect(respostas.find((r) => r.status === 409)?.corpo).toMatchObject({ motivo: 'ja_reivindicada' })
    expect(b.pedidos).toHaveLength(1)
    expect(b.gravacoes).toHaveLength(1)
    expect(b.movimentos).toHaveLength(1)
  })

  test('quem não recebe a linha não pergunta ao modelo nem escreve', async () => {
    const b = bancada()
    b.trava.reivindicada = true
    const resposta = await classificar(b)
    expect(resposta.status).toBe(409)
    expect(resposta.corpo).toMatchObject({ motivo: 'ja_reivindicada' })
    expect(b.pedidos).toHaveLength(0)
    expect(b.escritas).toEqual([])
  })

  test('a reivindicação vem antes do modelo, e classified_at é a última escrita', async () => {
    const b = bancada()
    expect((await classificar(b)).status).toBe(200)
    expect(b.tocados.indexOf('reivindicar')).toBeLessThan(b.tocados.indexOf('perguntarAoModelo'))
    expect(b.tocados.at(-1)).toBe('concluirClassificacao')
    expect(b.trava.concluida).toBe(true)
  })

  test('classificada, a volta seguinte não passa da reivindicação', async () => {
    const b = bancada({ chamada: { classification_source: null } })
    b.trava.concluida = true
    expect((await classificar(b)).corpo).toMatchObject({ motivo: 'ja_reivindicada' })
    expect(b.pedidos).toHaveLength(0)
  })

  test('o modelo fora do ar solta a reivindicação para a varredura', async () => {
    const b = bancada({ modelo: { ok: false, status: 529, endpoint: 'v1/messages' } })
    expect((await classificar(b)).status).toBe(503)
    expect(b.trava).toEqual({ reivindicada: false, concluida: false })
  })

  test('sem fala do lead, a chamada é concluída e sai das duas vias', async () => {
    const b = bancada({
      chamada: { transcript: { turns: [{ role: 'agent', text: 'Alô? Alô?', at: '2026-03-20T10:00:01Z' }] } },
    })
    expect(corpo(await classificar(b)).desfecho).toBe('sem_conversa')
    expect(b.trava.concluida).toBe(true)
  })

  test('corrigida por gente sai antes da reivindicação', async () => {
    const b = bancada({ chamada: { classification_source: 'human' } })
    expect((await classificar(b)).corpo).toMatchObject({ motivo: 'ja_corrigida' })
    expect(b.tocados).not.toContain('reivindicar')
  })
})

// A avaliação automática pelos mesmos critérios da finalização (US-142) ------------

describe('a avaliação automática pelos critérios da conta (US-142)', () => {
  test('o modelo julga só o que é por modelo; trecho se decide sem ele', async () => {
    const b = bancada({ criterios: LINHAS_DA_SEMENTE })
    await classificar(b)
    const mensagem = b.pedidos[0]?.mensagem ?? ''
    expect(mensagem).toContain('nada_fora_da_base')
    expect(mensagem).not.toContain('identificacao_honesta')
  })

  test('grava evaluation.itens pelos critérios da conta, e a nota é a da avaliação automática', async () => {
    const julgados = criteriosDaChamada('discovery', LINHAS_DA_SEMENTE).filter((c) => c.como === 'modelo')
    const b = bancada({
      criterios: LINHAS_DA_SEMENTE,
      modelo: {
        ok: true,
        status: 200,
        texto: respostaDoModelo({
          evaluation: julgados.map((c) => ({ key: c.chave, approved: true, reason: 'Conferido.' })),
        }),
        tokensDeEntrada: 10,
        tokensDeSaida: 10,
      },
    })
    await classificar(b)
    const g = gravada(b)
    const itens = (g.evaluation as { itens?: { criterio: string; aprovado: boolean | null }[] }).itens ?? []
    const porCriterio = new Map(itens.map((item) => [item.criterio, item.aprovado]))
    expect(porCriterio.get('identificacao_honesta')).toBe(true)
    expect(porCriterio.get('aviso_gravacao')).toBe(true)
    expect(porCriterio.get('nada_fora_da_base')).toBe(true)
    expect(g.evaluation_score).toBe(10)
  })

  test('o que a finalização já decidiu é carregado como veio', async () => {
    const b = bancada({
      criterios: LINHAS_DA_SEMENTE,
      chamada: {
        evaluation: {
          itens: [{ criterio: 'identificacao_honesta', aprovado: false, evidencia: null }],
        },
      },
    })
    await classificar(b)
    const itens = (gravada(b).evaluation as { itens?: { criterio: string; aprovado: boolean | null }[] }).itens ?? []
    expect(itens.find((item) => item.criterio === 'identificacao_honesta')?.aprovado).toBe(false)
    // Obrigatório reprovado: a nota vai a zero, pela mesma aritmética da finalização.
    expect(gravada(b).evaluation_score).toBe(0)
  })

  test('nada decidido é nota nula, e não zero', async () => {
    const r = await avaliacaoAutomatica([], criteriosDaChamada('discovery'), {}, null)
    expect(r.nota).toBeNull()
  })
})

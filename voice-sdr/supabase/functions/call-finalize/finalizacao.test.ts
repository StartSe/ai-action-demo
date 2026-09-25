// Provas da finalização canônica. Ambiente node, sem rede e sem banco: a porta
// é um `Proxy` que registra todo membro tocado, na ordem, sobre uma chamada em
// memória que implementa a condição da reivindicação e os únicos de
// `call_costs` e `call_tool_invocations`.
//
// O que este arquivo segura:
//
// 1. **A reivindicação deixa passar um só** (T-15): duas finalizações em
//    sequência dão uma classificação, uma linha de custo por componente, um
//    conjunto de invocações e um consentimento. A segunda recebe 409 e não toca
//    em mais nada.
// 2. **A reivindicação expira em 5 minutos, e só a que não terminou**: dentro
//    da validade a segunda tentativa é recusada, depois dela é aceita, e uma
//    chamada finalizada nunca volta a ser reivindicada.
// 3. **Falha ao puxar a transcrição não grava nada** e não deixa a chamada
//    travada.
// 4. **Gravação desligada pula o áudio** (L-18), contando zero downloads.
// 5. **O aviso de gravação** achado e não achado (L-23), e a transcrição com
//    quem falou (RF-412).
// 6. **Custo parcial**: só o que o provedor devolveu vira linha (T-20).
// 7. **A primeira chamada de teste** só com transcrição, e sem derrubar a
//    finalização quando o RPC falha (RF-912).
// 8. **As ferramentas lidas da transcrição** (T-02, T-03, R-02): as três de
//    sistema com prefixo, o fim decidido por elas, a caixa postal chegando ao
//    dado, a desconhecida registrada, e o reaplicador de mentira chamado uma
//    vez para a invocação com erro — nem para a que deu certo, nem de novo na
//    releitura.
// 9. **O bloqueio refeito** (US-108, R-02): o `tool-dnc` que respondeu
//    `ok: false` vira bloqueio e item na finalização, uma vez só; o ensaio não
//    bloqueia; e o bloqueio que falha derruba a finalização para a varredura
//    voltar.
// 10. **As duas falas da pessoa errada** (US-109, RF-422): a divergência vai
//    para a avaliação, a conformidade não escreve nada, o ensaio é medido, e a
//    gravação que falha não segura o desfecho.

import { describe, expect, test } from 'vitest'

import { FALAS_DE_TODO_PROPOSITO } from '../_shared/speech/todos-os-propositos.ts'

import {
  caminhoDaGravacao,
  finalizarChamada,
  NOME_DE_SISTEMA,
  VALIDADE_DA_REIVINDICACAO_MS,
  type ChamadaReivindicada,
  type CorpoDaFinalizacao,
  type DesfechoDaChamada,
  type LinhaDeConsentimento,
  type LinhaDeCusto,
  type LinhaDeInvocacao,
  type OpcoesDaFinalizacao,
  type PoliticaDaFinalizacao,
  type PortaDaFinalizacao,
  type RespostaDaFinalizacao,
} from './finalizacao.ts'
import { classificarChamada, type PortaDaClassificacao } from '../call-classify/classificacao.ts'
import {
  LINHAS_DA_SEMENTE,
  type ItemDaAvaliacao,
  type LinhaDeCriterio,
} from '../_shared/qualificacao/avaliacao.ts'
import type { InvocacaoRegistrada } from '../_shared/qualificacao/obrigatoriedade.ts'
import { REGUA_DE_EXEMPLO } from '../_shared/qualificacao/pontuacao.ts'

import { REAPLICADORES, type InvocacaoParaReaplicar, type RegistroDeReaplicadores } from './reaplicacao.ts'
import { NOTA_DA_REAPLICACAO } from './reaplicacao-do-bloqueio.ts'
import type { ItemDeFila } from '../_shared/fila/gatilhos.ts'
import type { ResultadoGravado, SequenciaDeFalhas } from './sentimento-e-fila.ts'
import type { ItemDeBloqueioNaFila, PedidoDeBloqueio } from '../tool-dnc/bloqueio.ts'

const SEGREDO = 'segredo-interno-desta-instalacao'
const CREDENCIAL = 'xi-chave-da-conta-0123456789'
const CONTA = '11111111-1111-4111-8111-111111111111'
const CHAMADA = '22222222-2222-4222-8222-222222222222'
const LEAD = '33333333-3333-4333-8333-333333333333'
const CONVERSA = 'conv_de_teste_0001'
const TELEFONE_DO_LEAD = '+5511990000001'

/** 2026-03-20T10:00:00Z, o início da conversa no provedor. */
const INICIO_EM_SEGUNDOS = 1_774_000_800
const INICIO = new Date(INICIO_EM_SEGUNDOS * 1000).toISOString()
const AGORA = '2026-03-20T10:05:00.000Z'

const AVISO_DITO = FALAS_DE_TODO_PROPOSITO.avisoDeGravacao
  .replace('{nome_do_lead}', 'Marcos')
  .replace('{nome_do_agente}', 'Sarah')
  .replace('{empresa}', 'Fluxo Cargo')

function mais(instante: string, ms: number): string {
  return new Date(Date.parse(instante) + ms).toISOString()
}

interface TurnoCru {
  role: string
  message: string | null
  time_in_call_secs: number
  tool_calls?: { tool_name: string; params_as_json?: string; request_id?: string }[]
  tool_results?: { tool_name?: string; request_id?: string; result_value?: unknown; is_error?: boolean }[]
}

function conversaDoProvedor(ajustes: {
  status?: string
  turnos?: TurnoCru[]
  cobranca?: Record<string, unknown> | null
  temAudio?: boolean
  duracao?: number
} = {}): Record<string, unknown> {
  return {
    conversation_id: CONVERSA,
    status: ajustes.status ?? 'done',
    has_audio: ajustes.temAudio ?? true,
    transcript: ajustes.turnos ?? [
      { role: 'agent', message: AVISO_DITO, time_in_call_secs: 1 },
      { role: 'user', message: 'Tudo bem, pode falar.', time_in_call_secs: 6 },
      { role: 'agent', message: 'Como vocês organizam as entregas hoje?', time_in_call_secs: 9 },
      { role: 'user', message: 'Tudo em planilha, e atrasa.', time_in_call_secs: 14 },
      {
        role: 'agent',
        message: 'Obrigada, Marcos. Até mais!',
        time_in_call_secs: 58,
        tool_calls: [{ tool_name: 'end_call', params_as_json: '{"reason":"despedida"}' }],
      },
    ],
    metadata: {
      start_time_unix_secs: INICIO_EM_SEGUNDOS,
      call_duration_secs: ajustes.duracao ?? 60,
      termination_reason: 'end_call tool was called.',
      ...(ajustes.cobranca === null
        ? {}
        : { charging: ajustes.cobranca ?? { call_charge: 0.12, llm_price: 0.034 } }),
    },
  }
}

interface EstadoDaChamada {
  finalize_started_at: string | null
  finalized_at: string | null
  desfecho: DesfechoDaChamada | null
}

interface Bancada {
  readonly porta: PortaDaFinalizacao
  readonly tocados: string[]
  readonly chamada: EstadoDaChamada
  readonly desfechos: DesfechoDaChamada[]
  readonly custos: LinhaDeCusto[]
  readonly invocacoes: LinhaDeInvocacao[]
  readonly consentimentos: LinhaDeConsentimento[]
  readonly downloads: string[]
  readonly guardados: string[]
  readonly classificacoes: string[]
  readonly portoes: string[]
  /** `dnc_entries` ativos, pelo único parcial: um por número. */
  readonly bloqueios: PedidoDeBloqueio[]
  readonly itensDeBloqueio: ItemDeBloqueioNaFila[]
  /** O que `registrarMedicaoDaAvaliacao` recebeu, por critério. */
  readonly medicoes: { criterio: string; medicao: Readonly<Record<string, unknown>> }[]
  /** O que `registrarItemDeFila` recebeu, na ordem. */
  readonly itensDeFila: ItemDeFila[]
  /** O que `gravarSentimento` recebeu. */
  readonly sentimentos: { leadId: string | null; valor: number; fonte: string }[]
  /** O que `registrarAvaliacaoAutomatica` recebeu, na ordem. */
  readonly avaliacoes: { itens: readonly ItemDaAvaliacao[]; nota: number | null }[]
  /** O que `reprogramarTentativa` recebeu, na ordem (US-189). */
  readonly retentativas: { chamadaId: string; resultado: string }[]
}

interface AjustesDaBancada {
  politica?: Partial<PoliticaDaFinalizacao>
  conversa?: Record<string, unknown>
  /** Quantas buscas da conversa falham antes de a primeira dar certo. */
  conversaFalha?: number
  semConversaId?: boolean
  semCredencial?: boolean
  portaoFalha?: boolean
  classificacaoFalha?: boolean
  /** O acionamento de `call-classify`, no lugar do registro de mentira. */
  acionarClassificacao?: (chamadaId: string) => Promise<void>
  classificadaPorFerramenta?: boolean
  /** `calls.purpose`; ausente é descoberta. */
  proposito?: string
  /** O que `tool-qualify` gravou em `call_tool_invocations` durante a conversa. */
  invocacoesDaConversa?: readonly InvocacaoRegistrada[]
  direcao?: ChamadaReivindicada['direction']
  /** `call-cancel` marcou a chamada antes do fim. */
  cancelada?: boolean
  /** O vigia de `cron-call-recovery` marcou `max_duration` antes do fim (L-12). */
  marcadaPorDuracao?: boolean
  /** Quantas conclusões falham antes de a primeira dar certo. */
  conclusaoFalha?: number
  /** Quantas escritas de bloqueio falham antes de a primeira dar certo. */
  bloqueioFalha?: number
  medicaoFalha?: boolean
  /** O que a chamada tem gravado depois da classificação. */
  resultado?: Partial<ResultadoGravado>
  /** O piso de sentimento da conta; os demais limiares ficam no padrão. */
  pisoDeSentimento?: number
  /** O que `falhas_consecutivas` responde; `levanta` é o banco fora do ar. */
  sequencia?: SequenciaDeFalhas | null | 'levanta'
  /** `evaluation_criteria` da conta; ausente é a semente. */
  criterios?: readonly LinhaDeCriterio[]
  avaliacaoFalha?: boolean
  retentativaFalha?: boolean
}

function bancada(ajustes: AjustesDaBancada = {}): Bancada {
  const tocados: string[] = []
  const chamada: EstadoDaChamada = { finalize_started_at: null, finalized_at: null, desfecho: null }
  const desfechos: DesfechoDaChamada[] = []
  const custos: LinhaDeCusto[] = []
  const invocacoes: LinhaDeInvocacao[] = []
  const consentimentos: LinhaDeConsentimento[] = []
  const downloads: string[] = []
  const guardados: string[] = []
  const classificacoes: string[] = []
  const portoes: string[] = []
  const bloqueios: PedidoDeBloqueio[] = []
  const itensDeBloqueio: ItemDeBloqueioNaFila[] = []
  const medicoes: Bancada['medicoes'] = []
  const itensDeFila: ItemDeFila[] = []
  const sentimentos: Bancada['sentimentos'] = []
  const avaliacoes: Bancada['avaliacoes'] = []
  const retentativas: Bancada['retentativas'] = []
  let bloqueiosQueFalham = ajustes.bloqueioFalha ?? 0
  let falhasRestantes = ajustes.conversaFalha ?? 0
  let conclusoesQueFalham = ajustes.conclusaoFalha ?? 0

  const politica: PoliticaDaFinalizacao = {
    gravacaoLigada: true,
    retencaoEmDias: 90,
    avisoDeGravacao: null,
    duracaoMaximaEmSegundos: 600,
    ...ajustes.politica,
  }

  const real: PortaDaFinalizacao = {
    // A condição do update, ao pé da letra, sobre a linha em memória.
    async reivindicar(chamadaId, agora, vencidaAntesDe) {
      if (chamadaId !== CHAMADA) return null
      if (chamada.finalized_at !== null) return null
      const livre =
        chamada.finalize_started_at === null ||
        Date.parse(chamada.finalize_started_at) < Date.parse(vencidaAntesDe)
      if (!livre) return null
      chamada.finalize_started_at = agora
      return {
        id: CHAMADA,
        account_id: CONTA,
        lead_id: LEAD,
        direction: ajustes.direcao ?? 'outbound',
        purpose: ajustes.proposito ?? 'discovery',
        provider_conversation_id: ajustes.semConversaId ? null : CONVERSA,
        started_at: INICIO,
        classification_source: ajustes.classificadaPorFerramenta ? 'tool' : null,
        end_reason: ajustes.cancelada ? 'canceled' : (ajustes.marcadaPorDuracao ? 'max_duration' : null),
      }
    },
    async politicaDaConta() {
      return politica
    },
    async credencial() {
      return ajustes.semCredencial
        ? { ok: false, motivo: 'ausente' }
        : { ok: true, valor: CREDENCIAL, origem: 'conta' }
    },
    async buscarConversa(conversaId) {
      if (falhasRestantes > 0) {
        falhasRestantes -= 1
        return { ok: false, status: 503, endpoint: `convai/conversations/${conversaId}` }
      }
      return { ok: true, status: 200, conversa: ajustes.conversa ?? conversaDoProvedor() }
    },
    async baixarAudio(conversaId) {
      downloads.push(conversaId)
      return { ok: true, status: 200, audio: new Uint8Array([1, 2, 3]), tipo: 'audio/mpeg' }
    },
    async guardarGravacao(caminho) {
      guardados.push(caminho)
    },
    async gravarDesfecho(_conta, _chamada, desfecho) {
      desfechos.push(desfecho)
      chamada.desfecho = desfecho
    },
    // Os únicos do banco: `(call_id, component, source)` e `(call_id, tool, at)`.
    async gravarCustos(linhas) {
      for (const linha of linhas) {
        const existe = custos.some(
          (c) => c.call_id === linha.call_id && c.component === linha.component && c.source === linha.source,
        )
        if (!existe) custos.push(linha)
      }
    },
    // `returning` só do que entrou, com o instante no formato do banco.
    async gravarInvocacoes(linhas) {
      const inseridas: { tool: string; at: string }[] = []
      for (const linha of linhas) {
        const existe = invocacoes.some(
          (i) => i.call_id === linha.call_id && i.tool === linha.tool && i.at === linha.at,
        )
        if (existe) continue
        invocacoes.push(linha)
        inseridas.push({ tool: linha.tool, at: linha.at.replace('Z', '+00:00') })
      }
      return inseridas
    },
    async registrarConsentimento(linha) {
      consentimentos.push(linha)
    },
    async registrarPrimeiraChamadaDeTeste(chamadaId) {
      if (ajustes.portaoFalha) throw new Error('rpc ausente')
      portoes.push(chamadaId)
    },
    async invocacoesDaChamada() {
      return [...(ajustes.invocacoesDaConversa ?? []), ...invocacoes.map((i) => ({ tool: i.tool, error: i.error }))]
    },
    async acionarClassificacao(chamadaId) {
      if (ajustes.classificacaoFalha) throw new Error('call-classify fora do ar')
      classificacoes.push(chamadaId)
      if (ajustes.acionarClassificacao) await ajustes.acionarClassificacao(chamadaId)
    },
    async registrarEventoDeIntegracao() {},
    async numerosDaChamada() {
      return { de: null, para: TELEFONE_DO_LEAD, doLead: TELEFONE_DO_LEAD }
    },
    async bloquearNumero(pedido) {
      if (bloqueiosQueFalham > 0) {
        bloqueiosQueFalham -= 1
        throw new Error('banco fora do ar')
      }
      const existente = bloqueios.find((b) => b.telefone === pedido.telefone)
      if (existente) return { blockedAt: existente.instante, criado: false }
      bloqueios.push(pedido)
      return { blockedAt: pedido.instante, criado: true }
    },
    async abrirItemDeBloqueio(item) {
      itensDeBloqueio.push(item)
    },
    async registrarMedicaoDaAvaliacao(_conta, _chamada, criterio, medicao) {
      if (ajustes.medicaoFalha) throw new Error('banco fora do ar')
      medicoes.push({ criterio, medicao })
    },
    async lerResultadoDaChamada() {
      return { classification_source: null, classification: null, sentiment: null, evaluation: null, ...ajustes.resultado }
    },
    async gravarSentimento(_conta, _chamada, leadId, valor, fonte) {
      sentimentos.push({ leadId, valor, fonte })
    },
    async limiaresDaFila() {
      return {
        limiares: {
          sentiment_floor: ajustes.pisoDeSentimento ?? -0.5,
          consecutive_failures_cap: 3,
          failed_criteria_cap: 1,
          credit_alert_cents: null,
        },
        fuso: 'America/Sao_Paulo',
      }
    },
    async falhasConsecutivas() {
      const sequencia = ajustes.sequencia === undefined ? { telefone: TELEFONE_DO_LEAD, falhas: 0 } : ajustes.sequencia
      if (sequencia === 'levanta') throw new Error('banco fora do ar')
      return sequencia
    },
    // O único parcial `exception_items_uma_causa_aberta`, em memória.
    async registrarItemDeFila(_conta, item) {
      if (itensDeFila.some((i) => i.deduplicacaoKey === item.deduplicacaoKey)) return 'ja_aberto'
      itensDeFila.push(item)
      return 'criado'
    },
    async criteriosDaConta() {
      return ajustes.criterios ?? LINHAS_DA_SEMENTE
    },
    async registrarAvaliacaoAutomatica(_conta, _chamada, itens, nota) {
      if (ajustes.avaliacaoFalha) throw new Error('banco fora do ar')
      avaliacoes.push({ itens, nota })
    },
    async reprogramarTentativa(chamadaId, resultado) {
      if (ajustes.retentativaFalha) throw new Error('banco fora do ar')
      retentativas.push({ chamadaId, resultado })
    },
    async concluirFinalizacao(_conta, _chamada, agora) {
      if (conclusoesQueFalham > 0) {
        conclusoesQueFalham -= 1
        throw new Error('banco caiu antes de finalized_at')
      }
      chamada.finalized_at = agora
    },
  }

  const porta = new Proxy(real, {
    get(alvo, membro, receptor) {
      tocados.push(String(membro))
      return Reflect.get(alvo, membro, receptor) as unknown
    },
  })

  return {
    porta,
    tocados,
    chamada,
    desfechos,
    custos,
    invocacoes,
    consentimentos,
    downloads,
    guardados,
    classificacoes,
    portoes,
    bloqueios,
    itensDeBloqueio,
    medicoes,
    itensDeFila,
    sentimentos,
    avaliacoes,
    retentativas,
  }
}

function opcoes(agora = AGORA, reaplicadores?: RegistroDeReaplicadores): OpcoesDaFinalizacao {
  return reaplicadores ? { segredoInterno: SEGREDO, agora, reaplicadores } : { segredoInterno: SEGREDO, agora }
}

function finalizar(
  b: Bancada,
  agora = AGORA,
  pedido: Partial<{ chamadaId: unknown; segredo: string | null }> = {},
  reaplicadores?: RegistroDeReaplicadores,
) {
  return finalizarChamada(
    {
      metodo: 'POST',
      chamadaId: 'chamadaId' in pedido ? pedido.chamadaId : CHAMADA,
      segredoInterno: 'segredo' in pedido ? (pedido.segredo ?? null) : SEGREDO,
    },
    b.porta,
    opcoes(agora, reaplicadores),
  )
}

/** Um reaplicador de mentira que anota cada invocação recebida. */
function reaplicadorDeMentira(ferramenta: string, falha = false) {
  const chamadas: InvocacaoParaReaplicar[] = []
  const registro: RegistroDeReaplicadores = new Map([
    [
      ferramenta,
      async (invocacao: InvocacaoParaReaplicar) => {
        chamadas.push(invocacao)
        if (falha) throw new Error('o efeito também falhou agora')
      },
    ],
  ])
  return { chamadas, registro }
}

function corpo(resposta: RespostaDaFinalizacao): CorpoDaFinalizacao {
  expect(resposta.corpo.ok).toBe(true)
  return resposta.corpo as CorpoDaFinalizacao
}

function desfecho(b: Bancada): DesfechoDaChamada {
  const ultimo = b.desfechos.at(-1)
  if (!ultimo) throw new Error('nenhum desfecho gravado')
  return ultimo
}

describe('o portão interno', () => {
  test('sem o segredo, com o segredo errado e com a instalação sem segredo: 401, e a porta intocada', async () => {
    for (const [segredo, instalacao] of [
      [null, SEGREDO],
      ['outro-segredo-qualquer', SEGREDO],
      ['', SEGREDO],
      [SEGREDO, ''],
    ] as const) {
      const b = bancada()
      const resposta = await finalizarChamada(
        { metodo: 'POST', chamadaId: CHAMADA, segredoInterno: segredo },
        b.porta,
        { segredoInterno: instalacao, agora: AGORA },
      )
      expect(resposta.status).toBe(401)
      expect(b.tocados).toEqual([])
    }
  })

  test('método diferente de POST e call_id que não é uuid não chegam à reivindicação', async () => {
    const b = bancada()
    const get = await finalizarChamada(
      { metodo: 'GET', chamadaId: CHAMADA, segredoInterno: SEGREDO },
      b.porta,
      opcoes(),
    )
    expect(get.status).toBe(405)
    for (const chamadaId of [null, 42, '', 'nao-e-uuid']) {
      expect((await finalizar(b, AGORA, { chamadaId })).status).toBe(400)
    }
    expect(b.tocados).toEqual([])
  })
})

describe('a reivindicação atômica (T-15)', () => {
  test('duas finalizações em sequência: uma classificação, um custo por componente, um conjunto de invocações', async () => {
    const b = bancada()
    const primeira = await finalizar(b)
    const tocadosNaPrimeira = b.tocados.length
    const segunda = await finalizar(b)

    expect(primeira.status).toBe(200)
    expect(segunda.status).toBe(409)
    expect(segunda.corpo).toMatchObject({ ok: false, motivo: 'ja_reivindicada' })

    expect(b.desfechos).toHaveLength(1)
    expect(b.classificacoes).toEqual([CHAMADA])
    // Só o modelo: `call_charge` é crédito e não vira custo (ver o teste do custo).
    expect(b.custos.map((c) => c.component).sort()).toEqual(['model'])
    expect(b.invocacoes.map((i) => i.tool)).toEqual(['system:end_call'])
    expect(b.consentimentos).toHaveLength(1)
    expect(b.downloads).toHaveLength(1)

    // A segunda passagem só tocou a reivindicação, e mais nada.
    expect(b.tocados.slice(tocadosNaPrimeira)).toEqual(['reivindicar'])
  })

  test('a reivindicação é o primeiro passo e finalized_at é o último', async () => {
    const b = bancada()
    await finalizar(b)
    expect(b.tocados[0]).toBe('reivindicar')
    expect(b.tocados.at(-1)).toBe('concluirFinalizacao')
    expect(b.tocados.indexOf('gravarDesfecho')).toBeLessThan(b.tocados.indexOf('concluirFinalizacao'))
    expect(b.chamada.finalized_at).toBe(AGORA)
  })

  test('segunda tentativa dentro dos 5 minutos é recusada; depois deles, aceita', async () => {
    const b = bancada({ conversaFalha: 1 })

    const caiu = await finalizar(b)
    expect(caiu.status).toBe(503)
    expect(caiu.corpo).toMatchObject({ motivo: 'transcricao_indisponivel' })
    expect(b.chamada.finalize_started_at).toBe(AGORA)
    expect(b.chamada.finalized_at).toBeNull()

    const cedo = await finalizar(b, mais(AGORA, VALIDADE_DA_REIVINDICACAO_MS - 1_000))
    expect(cedo.status).toBe(409)

    const depois = await finalizar(b, mais(AGORA, VALIDADE_DA_REIVINDICACAO_MS + 1_000))
    expect(depois.status).toBe(200)
    expect(b.desfechos).toHaveLength(1)
    expect(b.classificacoes).toHaveLength(1)
  })

  test('chamada finalizada não é reivindicada de novo, nem depois dos 5 minutos', async () => {
    const b = bancada()
    expect((await finalizar(b)).status).toBe(200)
    const tardio = await finalizar(b, mais(AGORA, 10 * 60 * 1000))
    expect(tardio.status).toBe(409)
    expect(b.desfechos).toHaveLength(1)
    expect(b.classificacoes).toHaveLength(1)
  })

  test('chamada de outra instalação (a reivindicação sem linha) é 409 e nada mais', async () => {
    const b = bancada()
    const resposta = await finalizar(b, AGORA, { chamadaId: '99999999-9999-4999-8999-999999999999' })
    expect(resposta.status).toBe(409)
    expect(b.tocados).toEqual(['reivindicar'])
  })
})

describe('falha ao puxar a transcrição', () => {
  test('não grava desfecho, custo, invocação nem consentimento, e não conclui', async () => {
    const b = bancada({ conversaFalha: 1 })
    await finalizar(b)
    for (const escrita of [
      'gravarDesfecho',
      'gravarCustos',
      'gravarInvocacoes',
      'registrarConsentimento',
      'registrarPrimeiraChamadaDeTeste',
      'acionarClassificacao',
      'concluirFinalizacao',
      'baixarAudio',
    ]) {
      expect(b.tocados).not.toContain(escrita)
    }
  })

  test('conversa ainda em processamento é 503, e a varredura tenta de novo', async () => {
    const b = bancada({ conversa: conversaDoProvedor({ status: 'processing' }) })
    const resposta = await finalizar(b)
    expect(resposta.status).toBe(503)
    expect(resposta.corpo).toMatchObject({ motivo: 'transcricao_pendente' })
    expect(b.desfechos).toHaveLength(0)
    expect(b.chamada.finalized_at).toBeNull()
  })

  test('credencial ausente é 503 sem ir ao provedor', async () => {
    const b = bancada({ semCredencial: true })
    const resposta = await finalizar(b)
    expect(resposta.status).toBe(503)
    expect(b.tocados).not.toContain('buscarConversa')
  })

  test('chamada sem conversa no provedor é 422, porque tentar de novo não a faz aparecer', async () => {
    const b = bancada({ semConversaId: true })
    const resposta = await finalizar(b)
    expect(resposta.status).toBe(422)
    expect(b.tocados).toEqual(['reivindicar'])
  })

  test('o corpo de resposta nunca carrega a credencial', async () => {
    const b = bancada()
    const resposta = await finalizar(b)
    expect(JSON.stringify(resposta.corpo)).not.toContain(CREDENCIAL)
  })
})

describe('a transcrição e o fim', () => {
  test('cada turno com quem falou e o instante, na ordem (RF-412)', async () => {
    const b = bancada()
    await finalizar(b)
    const turnos = desfecho(b).transcript.turns
    expect(turnos.map((t) => t.role)).toEqual(['agent', 'lead', 'agent', 'lead', 'agent'])
    expect(turnos[1]).toEqual({
      role: 'lead',
      text: 'Tudo bem, pode falar.',
      at: mais(INICIO, 6_000),
    })
  })

  test('duração, atendimento, fim e motivo vêm da conversa', async () => {
    const b = bancada()
    const resposta = corpo(await finalizar(b))
    expect(desfecho(b)).toMatchObject({
      status: 'ended',
      duration_sec: 60,
      answered_at: INICIO,
      ended_at: mais(INICIO, 60_000),
      answered_by: 'human',
      end_reason: 'completed',
    })
    expect(resposta.motivoDoFim).toBe('completed')
  })

  test('caixa postal: answered_by machine e end_reason voicemail (T-03)', async () => {
    const b = bancada({
      conversa: conversaDoProvedor({
        turnos: [
          { role: 'agent', message: AVISO_DITO, time_in_call_secs: 1 },
          {
            role: 'agent',
            message: null,
            time_in_call_secs: 5,
            tool_calls: [{ tool_name: 'voicemail_detection' }],
          },
        ],
      }),
    })
    await finalizar(b)
    expect(desfecho(b)).toMatchObject({ answered_by: 'machine', end_reason: 'voicemail' })
    expect(b.invocacoes.map((i) => i.tool)).toEqual(['system:voicemail_detection'])
  })

  test('o teto de duração da conta vira max_duration', async () => {
    const b = bancada({ conversa: conversaDoProvedor({ duracao: 600, turnos: [
      { role: 'agent', message: AVISO_DITO, time_in_call_secs: 1 },
      { role: 'user', message: 'Pode.', time_in_call_secs: 4 },
    ] }) })
    await finalizar(b)
    expect(desfecho(b).end_reason).toBe('max_duration')
  })

  test('chamada marcada por call-cancel termina canceled, com o resto do fim lido da conversa', async () => {
    const b = bancada({ cancelada: true })
    const resposta = await finalizar(b)
    expect(desfecho(b)).toMatchObject({ status: 'ended', end_reason: 'canceled', answered_by: 'human' })
    expect(resposta.corpo).toMatchObject({ ok: true, motivoDoFim: 'canceled' })
  })

  test('chamada marcada pelo vigia da duração termina max_duration, mesmo com end_call na conversa (L-12)', async () => {
    const b = bancada({
      marcadaPorDuracao: true,
      conversa: conversaDoProvedor({ duracao: 120 }),
    })
    const resposta = await finalizar(b)
    expect(desfecho(b)).toMatchObject({ status: 'ended', end_reason: 'max_duration' })
    expect(resposta.corpo).toMatchObject({ ok: true, motivoDoFim: 'max_duration' })
  })

  test('ferramenta nossa na transcrição não vira invocação de sistema: quem a registra é a própria ferramenta', async () => {
    const b = bancada({
      conversa: conversaDoProvedor({
        turnos: [
          {
            role: 'agent',
            message: AVISO_DITO,
            time_in_call_secs: 1,
            tool_calls: [{ tool_name: 'tool-qualify' }, { tool_name: 'end_call' }],
          },
        ],
      }),
    })
    await finalizar(b)
    expect(b.invocacoes.map((i) => i.tool)).toEqual(['system:end_call'])
    // A `tool-qualify` não vira linha, mas ocupa o milissegundo do turno: o
    // instante é da invocação, e não do filtro (`leitura-da-transcricao.ts`).
    expect(b.invocacoes[0]?.at).toBe(mais(INICIO, 1_001))
  })

  test('sem turno nenhum, a chamada é failed com no_answer e ninguém atendeu', async () => {
    const b = bancada({ conversa: conversaDoProvedor({ turnos: [] }) })
    const resposta = corpo(await finalizar(b))
    expect(desfecho(b)).toMatchObject({
      status: 'failed',
      end_reason: 'no_answer',
      answered_by: 'unknown',
      answered_at: null,
    })
    expect(resposta.classificacao).toBe('dispensado')
  })
})

describe('a retentativa por resultado (US-189)', () => {
  const semTurno = () => conversaDoProvedor({ turnos: [] })
  const caixaPostal = () =>
    conversaDoProvedor({
      turnos: [
        { role: 'agent', message: AVISO_DITO, time_in_call_secs: 1 },
        { role: 'agent', message: null, time_in_call_secs: 5, tool_calls: [{ tool_name: 'voicemail_detection' }] },
      ],
    })

  test('sem atendimento pede a reprogramação, antes de finalized_at', async () => {
    const b = bancada({ conversa: semTurno() })
    const resposta = corpo(await finalizar(b))
    expect(resposta.retentativa).toBe('acionado')
    expect(b.retentativas).toEqual([{ chamadaId: CHAMADA, resultado: 'sem_atendimento' }])
    expect(b.tocados.indexOf('reprogramarTentativa')).toBeGreaterThan(b.tocados.indexOf('gravarDesfecho'))
    expect(b.tocados.indexOf('reprogramarTentativa')).toBeLessThan(b.tocados.indexOf('concluirFinalizacao'))
  })

  test('caixa postal pede a reprogramação com o resultado caixa_postal', async () => {
    const b = bancada({ conversa: caixaPostal() })
    await finalizar(b)
    expect(b.retentativas).toEqual([{ chamadaId: CHAMADA, resultado: 'caixa_postal' }])
  })

  test('conversa que aconteceu não reprograma', async () => {
    const b = bancada()
    const resposta = corpo(await finalizar(b))
    expect(resposta.retentativa).toBe('dispensado')
    expect(b.tocados).not.toContain('reprogramarTentativa')
  })

  test('ligação recebida sem turno não reprograma: ninguém discou', async () => {
    const b = bancada({ conversa: semTurno(), direcao: 'inbound' })
    expect(corpo(await finalizar(b)).retentativa).toBe('dispensado')
    expect(b.retentativas).toEqual([])
  })

  test('a reprogramação que falha fica escrita e a finalização conclui', async () => {
    const b = bancada({ conversa: semTurno(), retentativaFalha: true })
    const resposta = corpo(await finalizar(b))
    expect(resposta.retentativa).toBe('falhou')
    expect(b.chamada.finalized_at).toBe(AGORA)
  })
})

describe('o áudio (L-18)', () => {
  test('gravação ligada: baixa uma vez, guarda no caminho da conta e calcula o expurgo pela retenção', async () => {
    const b = bancada({ politica: { retencaoEmDias: 30 } })
    const resposta = corpo(await finalizar(b))
    const caminho = caminhoDaGravacao(CONTA, CHAMADA)
    expect(caminho.startsWith(`${CONTA}/`)).toBe(true)
    expect(b.downloads).toEqual([CONVERSA])
    expect(b.guardados).toEqual([caminho])
    expect(desfecho(b).recording_path).toBe(caminho)
    expect(desfecho(b).recording_expires_at).toBe(mais(INICIO, 60_000 + 30 * 24 * 60 * 60 * 1000))
    expect(resposta.audio).toBe('gravado')
  })

  test('gravação desligada: zero downloads, recording_path nulo e nenhum aviso procurado', async () => {
    const b = bancada({ politica: { gravacaoLigada: false } })
    const resposta = corpo(await finalizar(b))
    expect(b.downloads).toHaveLength(0)
    expect(b.tocados).not.toContain('baixarAudio')
    expect(b.tocados).not.toContain('guardarGravacao')
    expect(desfecho(b).recording_path).toBeNull()
    expect(desfecho(b).recording_expires_at).toBeNull()
    expect(desfecho(b).consent_notice_at).toBeNull()
    expect(b.consentimentos).toHaveLength(0)
    expect(resposta).toMatchObject({ audio: 'desligado', avisoDeGravacao: 'desligado' })
  })

  test('conversa sem áudio no provedor não tenta baixar', async () => {
    const b = bancada({ conversa: conversaDoProvedor({ temAudio: false }) })
    const resposta = corpo(await finalizar(b))
    expect(b.downloads).toHaveLength(0)
    expect(resposta.audio).toBe('sem_audio')
    expect(desfecho(b).recording_path).toBeNull()
  })
})

describe('o aviso de gravação (L-23, RF-420)', () => {
  test('achado: consent_notice_at é o instante do turno, e o consentimento traz a resposta do lead', async () => {
    const b = bancada()
    const resposta = corpo(await finalizar(b))
    expect(desfecho(b).consent_notice_at).toBe(mais(INICIO, 1_000))
    expect(b.consentimentos).toEqual([
      {
        account_id: CONTA,
        lead_id: LEAD,
        call_id: CHAMADA,
        kind: 'recording',
        granted: true,
        evidence: {
          aviso: 'encontrado',
          turno: 0,
          segundo: 1,
          fala: AVISO_DITO,
          resposta_do_lead: 'Tudo bem, pode falar.',
        },
        at: mais(INICIO, 1_000),
      },
    ])
    expect(resposta.avisoDeGravacao).toBe('encontrado')
  })

  test('não achado: consent_notice_at nulo e o registro diz ausente, com granted falso', async () => {
    const b = bancada({
      conversa: conversaDoProvedor({
        turnos: [
          { role: 'agent', message: 'Oi, Marcos! Aqui é a Sarah, da Fluxo Cargo.', time_in_call_secs: 1 },
          { role: 'user', message: 'Oi.', time_in_call_secs: 3 },
        ],
      }),
    })
    const resposta = corpo(await finalizar(b))
    expect(desfecho(b).consent_notice_at).toBeNull()
    expect(b.consentimentos).toHaveLength(1)
    expect(b.consentimentos[0]).toMatchObject({
      kind: 'recording',
      granted: false,
      evidence: { aviso: 'ausente' },
      at: AGORA,
    })
    expect(resposta.avisoDeGravacao).toBe('ausente')
  })

  test('o aviso na fala do lead não conta: quem avisa é a Sarah', async () => {
    const b = bancada({
      conversa: conversaDoProvedor({
        turnos: [
          { role: 'agent', message: 'Oi, Marcos!', time_in_call_secs: 1 },
          { role: 'user', message: 'Antes da gente começar: essa ligação é gravada, tudo bem?', time_in_call_secs: 3 },
        ],
      }),
    })
    await finalizar(b)
    expect(desfecho(b).consent_notice_at).toBeNull()
  })

  test('aviso sem resposta do lead é aviso dado e consentimento não obtido', async () => {
    const b = bancada({
      conversa: conversaDoProvedor({
        turnos: [{ role: 'agent', message: AVISO_DITO, time_in_call_secs: 2 }],
      }),
    })
    await finalizar(b)
    expect(desfecho(b).consent_notice_at).toBe(mais(INICIO, 2_000))
    expect(b.consentimentos[0]).toMatchObject({ granted: false, evidence: { aviso: 'encontrado' } })
  })

  test('o texto próprio da conta é o que se procura, sem acento e sem pontuação', async () => {
    const b = bancada({
      politica: { avisoDeGravacao: 'Só um aviso, {nome_do_lead}: esta conversa fica gravada pra nossa qualidade.' },
      conversa: conversaDoProvedor({
        turnos: [
          { role: 'agent', message: 'Oi!', time_in_call_secs: 0 },
          { role: 'agent', message: 'so um aviso, Marcos. Esta conversa fica GRAVADA pra nossa qualidade!', time_in_call_secs: 3 },
          { role: 'user', message: 'Tá certo.', time_in_call_secs: 7 },
        ],
      }),
    })
    await finalizar(b)
    expect(desfecho(b).consent_notice_at).toBe(mais(INICIO, 3_000))
    expect(b.consentimentos[0]?.granted).toBe(true)
  })
})

describe('o custo (T-20, P-07)', () => {
  test('só o modelo vira custo: `call_charge` é crédito, não moeda', async () => {
    // A primeira ligação de verdade gravou 2.719 créditos como US$ 2.719,00.
    // A conversão de crédito para moeda depende do plano da conta, então o
    // custo de voz fica ausente até `cron-cost-sync` trazer o que a operadora
    // cobrou. Número errado sobre dinheiro é pior do que número nenhum.
    const b = bancada()
    const resposta = corpo(await finalizar(b))
    expect(b.custos).toEqual([
      { account_id: CONTA, call_id: CHAMADA, component: 'model', amount_cents: 3, currency: 'USD', source: 'call-finalize' },
    ])
    expect(resposta.custos).toBe(1)
    expect(b.custos.some((c) => c.component === 'voice')).toBe(false)
  })

  test('custo parcial: o componente que não veio não vira linha, nem nula nem zero', async () => {
    const b = bancada({ conversa: conversaDoProvedor({ cobranca: { llm_price: 0.02, call_charge: null } }) })
    await finalizar(b)
    expect(b.custos.map((c) => c.component)).toEqual(['model'])
    expect(b.custos.map((c) => String(c.component))).not.toContain('telephony')
  })

  test('sem cobrança nenhuma, a porta de custo nem é tocada', async () => {
    const b = bancada({ conversa: conversaDoProvedor({ cobranca: null }) })
    await finalizar(b)
    expect(b.tocados).not.toContain('gravarCustos')
    expect(b.chamada.finalized_at).toBe(AGORA)
  })
})

describe('a primeira chamada de teste e a classificação', () => {
  test('com transcrição, o RPC do portão é acionado uma vez', async () => {
    const b = bancada()
    const resposta = corpo(await finalizar(b))
    expect(b.portoes).toEqual([CHAMADA])
    expect(resposta.primeiraChamadaDeTeste).toBe('acionado')
  })

  test('sem transcrição, o portão não é acionado: ligação que caiu não prova configuração', async () => {
    const b = bancada({ conversa: conversaDoProvedor({ turnos: [] }) })
    await finalizar(b)
    expect(b.tocados).not.toContain('registrarPrimeiraChamadaDeTeste')
  })

  test('ensaio não abre o portão', async () => {
    const b = bancada({ direcao: 'rehearsal' })
    await finalizar(b)
    expect(b.portoes).toHaveLength(0)
  })

  test('RPC do portão e classificação que falham não derrubam a finalização', async () => {
    const b = bancada({ portaoFalha: true, classificacaoFalha: true })
    const resposta = await finalizar(b)
    expect(resposta.status).toBe(200)
    expect(corpo(resposta)).toMatchObject({ primeiraChamadaDeTeste: 'falhou', classificacao: 'falhou' })
    expect(b.chamada.finalized_at).toBe(AGORA)
  })

  test('call-classify com o modelo fora do ar: a finalização grava finalized_at e a classificação fica pendente', async () => {
    // O `call-classify` de verdade, com a camada de dados em memória e o
    // modelo recusando. O acionamento faz o que `index.ts` faz: status que não
    // é 200 vira exceção.
    const gravadas: string[] = []
    const portaDaClassificacao: PortaDaClassificacao = {
      async lerChamada(id) {
        return {
          id,
          account_id: CONTA,
          purpose: 'discovery',
          lead_id: null,
          direction: 'outbound',
          transcript: b.chamada.desfecho?.transcript ?? {},
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
        return [{ key: 'qualified', label: 'Qualificado', is_won: false, is_lost: false }]
      },
      async reguaDaConta() {
        return REGUA_DE_EXEMPLO
      },
      async modeloDaConta() {
        // A classificação de retaguarda resolve a porta da conta (US-246).
        // Aqui o que se mede é a finalização, então vale o padrão.
        return { porta: 'platform' as const, modelo: 'claude-sonnet-5', escolhidoPelaConta: false }
      },
      async perguntarAoModelo() {
        return { ok: false, status: 529, endpoint: 'v1/messages' }
      },
      async gravarClassificacao(_conta, id) {
        gravadas.push(id)
        return true
      },
      async gravarLead() {},
      async moverEtapa() {},
      async gravarCusto() {},
      async registrarEventoDeIntegracao() {},
      async registrarItemDeFila() {
        return 'criado' as const
      },
    }
    const statusDaClassificacao: number[] = []
    const b = bancada({
      async acionarClassificacao(chamadaId) {
        const resposta = await classificarChamada(
          { metodo: 'POST', chamadaId, segredoInterno: SEGREDO },
          portaDaClassificacao,
          { segredoInterno: SEGREDO },
        )
        statusDaClassificacao.push(resposta.status)
        if (resposta.status !== 200) throw new Error(`call-classify respondeu ${resposta.status}`)
      },
    })

    const resposta = await finalizar(b)

    expect(statusDaClassificacao).toEqual([503])
    expect(gravadas).toEqual([])
    expect(resposta.status).toBe(200)
    expect(corpo(resposta).classificacao).toBe('falhou')
    expect(b.chamada.finalized_at).toBe(AGORA)
  })

  test('classificada por tool-qualify durante a conversa, a de retaguarda é dispensada', async () => {
    const b = bancada({ classificadaPorFerramenta: true })
    const resposta = corpo(await finalizar(b))
    expect(b.classificacoes).toHaveLength(0)
    expect(resposta.classificacao).toBe('dispensado')
  })
})

describe('a retaguarda, primeira via (US-140)', () => {
  test('descoberta atendida sem tool-qualify: aciona call-classify na mesma passagem', async () => {
    const b = bancada()
    const resposta = corpo(await finalizar(b))
    expect(resposta).toMatchObject({ retaguarda: 'faltou_qualificar', classificacao: 'acionado' })
    expect(b.classificacoes).toEqual([CHAMADA])
    // Na mesma passagem: antes de `finalized_at`.
    expect(b.tocados.indexOf('acionarClassificacao')).toBeLessThan(b.tocados.indexOf('concluirFinalizacao'))
  })

  test('tool-qualify gravou durante a conversa: nada', async () => {
    const b = bancada({ invocacoesDaConversa: [{ tool: 'tool-qualify', error: null }] })
    const resposta = corpo(await finalizar(b))
    expect(resposta).toMatchObject({ retaguarda: 'qualificada', classificacao: 'dispensado' })
    expect(b.classificacoes).toEqual([])
  })

  test('tool-qualify que voltou com erro não conta como qualificação', async () => {
    const b = bancada({ invocacoesDaConversa: [{ tool: 'tool-qualify', error: 'banco fora do ar' }] })
    const resposta = corpo(await finalizar(b))
    expect(resposta.retaguarda).toBe('faltou_qualificar')
    expect(b.classificacoes).toEqual([CHAMADA])
  })

  test('fora de descoberta, a fala do lead sem classificação ainda aciona', async () => {
    const b = bancada({ proposito: 'followup' })
    const resposta = corpo(await finalizar(b))
    expect(resposta).toMatchObject({ retaguarda: 'sem_classificacao', classificacao: 'acionado' })
  })

  test('fora de descoberta e sem fala do lead, dispensada', async () => {
    const b = bancada({
      proposito: 'followup',
      conversa: conversaDoProvedor({ turnos: [{ role: 'agent', message: AVISO_DITO, time_in_call_secs: 1 }] }),
    })
    const resposta = corpo(await finalizar(b))
    expect(resposta).toMatchObject({ retaguarda: 'dispensada', classificacao: 'dispensado' })
  })

  test('caixa postal: dispensada, sem nem ler as invocações', async () => {
    const b = bancada({
      conversa: conversaDoProvedor({
        turnos: [
          { role: 'agent', message: AVISO_DITO, time_in_call_secs: 1 },
          { role: 'agent', message: null, time_in_call_secs: 5, tool_calls: [{ tool_name: 'voicemail_detection' }] },
        ],
      }),
    })
    const resposta = corpo(await finalizar(b))
    expect(resposta.retaguarda).toBe('dispensada')
    expect(b.tocados).not.toContain('invocacoesDaChamada')
    expect(b.classificacoes).toEqual([])
  })

  test('a decisão e o acionamento cabem em 50 ms com o modelo e o relógio injetados', async () => {
    // Os "2 minutos" de RF-410 somam rede, runtime Deno, modelo de verdade e
    // Postgres real, e se medem no degrau 3. Aqui, só o que é nosso: a
    // finalização decide, aciona `call-classify` de verdade, e a
    // classificação reivindica com a porta em memória.
    let reivindicada = false
    const portaDaClassificacao: PortaDaClassificacao = {
      async lerChamada(id) {
        return {
          id,
          account_id: CONTA,
          purpose: 'discovery',
          lead_id: null,
          direction: 'outbound',
          transcript: {},
          classification_source: null,
          sentiment: null,
          evaluation_score: null,
        }
      },
      async reivindicar() {
        if (reivindicada) return false
        reivindicada = true
        return true
      },
      async concluirClassificacao() {},
      async liberarReivindicacao() {},
      async criteriosDaConta() {
        return []
      },
      async etapasDaConta() {
        return []
      },
      async reguaDaConta() {
        return REGUA_DE_EXEMPLO
      },
      async modeloDaConta() {
        return { porta: 'platform' as const, modelo: 'claude-sonnet-5', escolhidoPelaConta: false }
      },
      async perguntarAoModelo() {
        return { ok: false, status: 529 }
      },
      async gravarClassificacao() {
        return true
      },
      async gravarLead() {},
      async moverEtapa() {},
      async gravarCusto() {},
      async registrarEventoDeIntegracao() {},
      async registrarItemDeFila() {
        return 'criado' as const
      },
    }
    const b = bancada({
      async acionarClassificacao(chamadaId) {
        await classificarChamada(
          { metodo: 'POST', chamadaId, segredoInterno: SEGREDO },
          portaDaClassificacao,
          { segredoInterno: SEGREDO },
        )
      },
    })
    const inicio = performance.now()
    const resposta = corpo(await finalizar(b))
    expect(performance.now() - inicio).toBeLessThan(50)
    expect(resposta.retaguarda).toBe('faltou_qualificar')
    expect(reivindicada).toBe(true)
  })
})

describe('orçamento do que é nosso', () => {
  // A "ficha em até 60 s" da F2 soma o aviso do provedor, o download do áudio,
  // a classificação e o sentimento (P-03), e se mede no degrau 3. Aqui se mede
  // só o caminho portável, com uma conversa de 400 turnos.
  test('finalizar uma conversa longa leva menos de 200 ms com a porta dublada', async () => {
    const turnos: TurnoCru[] = [{ role: 'agent', message: AVISO_DITO, time_in_call_secs: 1 }]
    for (let i = 1; i < 400; i += 1) {
      turnos.push({ role: i % 2 ? 'user' : 'agent', message: `fala número ${i} da conversa`, time_in_call_secs: i * 1.5 })
    }
    const b = bancada({ conversa: conversaDoProvedor({ turnos, duracao: 590 }) })
    const inicio = performance.now()
    const resposta = await finalizar(b)
    expect(resposta.status).toBe(200)
    expect(performance.now() - inicio).toBeLessThan(200)
    expect(desfecho(b).transcript.turns).toHaveLength(400)
  })
})

/** Uma conversa com um turno de ferramentas no fim, depois de uma troca normal. */
function comFerramentas(
  chamadas: NonNullable<TurnoCru['tool_calls']>,
  resultados: TurnoCru['tool_results'] = [],
  ajustes: { duracao?: number } = {},
) {
  return conversaDoProvedor({
    ...ajustes,
    turnos: [
      { role: 'agent', message: AVISO_DITO, time_in_call_secs: 1 },
      { role: 'user', message: 'Pode falar.', time_in_call_secs: 5 },
      { role: 'agent', message: null, time_in_call_secs: 20, tool_calls: chamadas },
      { role: 'agent', message: 'Certo.', time_in_call_secs: 22, tool_results: resultados },
    ],
  })
}

describe('as ferramentas lidas da transcrição (T-02, T-03, R-02)', () => {

  test('as três de sistema viram linha com o prefixo, os parâmetros e o instante', async () => {
    const b = bancada({
      conversa: comFerramentas([
        { tool_name: 'transfer_to_number', params_as_json: '{"phone_number":"+5511999990000"}', request_id: 'r1' },
        { tool_name: 'voicemail_detection', request_id: 'r2' },
        { tool_name: 'end_call', params_as_json: '{"reason":"fim"}', request_id: 'r3' },
      ]),
    })
    const resposta = corpo(await finalizar(b))
    expect(b.invocacoes.map((i) => i.tool)).toEqual([
      'system:transfer_to_number',
      'system:voicemail_detection',
      'system:end_call',
    ])
    expect(b.invocacoes[0]).toMatchObject({
      request: { phone_number: '+5511999990000' },
      error: null,
      latency_ms: null,
      at: mais(INICIO, 20_000),
    })
    expect(resposta.invocacoes).toBe(3)
  })

  test('end_call decide o fim: completed mesmo no teto de duração', async () => {
    const b = bancada({
      politica: { duracaoMaximaEmSegundos: 60 },
      conversa: comFerramentas([{ tool_name: 'end_call' }], [], { duracao: 60 }),
    })
    await finalizar(b)
    expect(desfecho(b).end_reason).toBe('completed')
  })

  test('sem encerramento, completed com transcrição e no_answer sem ela', async () => {
    const comConversa = bancada({ conversa: comFerramentas([]) })
    await finalizar(comConversa)
    expect(desfecho(comConversa).end_reason).toBe('completed')
    expect(comConversa.invocacoes).toEqual([])

    const semConversa = bancada({ conversa: conversaDoProvedor({ turnos: [] }) })
    await finalizar(semConversa)
    expect(desfecho(semConversa).end_reason).toBe('no_answer')
  })

  test('a caixa postal chega ao dado: machine, voicemail, e o roteiro não segue para classificação nem portão', async () => {
    // A saudação da caixa postal é transcrita como fala do interlocutor.
    const b = bancada({
      conversa: conversaDoProvedor({
        turnos: [
          { role: 'agent', message: AVISO_DITO, time_in_call_secs: 1 },
          { role: 'user', message: 'Deixe seu recado após o sinal.', time_in_call_secs: 3 },
          { role: 'agent', message: null, time_in_call_secs: 6, tool_calls: [{ tool_name: 'voicemail_detection' }] },
        ],
      }),
    })
    const resposta = corpo(await finalizar(b))
    expect(desfecho(b)).toMatchObject({ answered_by: 'machine', end_reason: 'voicemail' })
    expect(resposta.classificacao).toBe('dispensado')
    expect(resposta.primeiraChamadaDeTeste).toBe('dispensado')
    expect(b.classificacoes).toEqual([])
    expect(b.portoes).toEqual([])
  })

  test('transferência que voltou com erro não transferiu ninguém', async () => {
    const b = bancada({
      conversa: comFerramentas(
        [{ tool_name: 'transfer_to_number', request_id: 't1' }],
        [{ request_id: 't1', tool_name: 'transfer_to_number', is_error: true, result_value: 'número ocupado' }],
      ),
    })
    await finalizar(b)
    expect(desfecho(b).end_reason).toBe('completed')
    expect(b.invocacoes[0]).toMatchObject({ tool: 'system:transfer_to_number', error: 'número ocupado' })
  })

  test('ferramenta desconhecida é registrada com o nome que veio, depois do prefixo', async () => {
    const b = bancada({
      conversa: comFerramentas([
        { tool_name: 'skip_turn' },
        { tool_name: 'Tocar Tom #1' },
      ]),
    })
    await finalizar(b)
    expect(b.invocacoes.map((i) => i.tool)).toEqual(['system:skip_turn', 'system:Tocar_Tom__1'])
    expect(b.invocacoes[0]?.response).toEqual({})
    expect(b.invocacoes[1]?.response).toEqual({ nome_recebido: 'Tocar Tom #1' })
    for (const invocacao of b.invocacoes) {
      expect(invocacao.tool.replace(/^system:/, '')).toMatch(NOME_DE_SISTEMA)
    }
  })

  test('ferramenta nossa com erro vira linha com o erro; a que deu certo continua sem linha', async () => {
    const b = bancada({
      conversa: comFerramentas(
        [
          { tool_name: 'tool-dnc', params_as_json: '{"motivo":"pediu"}', request_id: 'd1' },
          { tool_name: 'tool-qualify', request_id: 'q1' },
        ],
        [
          { request_id: 'd1', is_error: true, result_value: 'prazo de resposta estourado' },
          { request_id: 'q1', is_error: false, result_value: '{"ok":true}' },
        ],
      ),
    })
    await finalizar(b)
    expect(b.invocacoes).toHaveLength(1)
    expect(b.invocacoes[0]).toMatchObject({
      tool: 'tool-dnc',
      request: { motivo: 'pediu' },
      error: 'prazo de resposta estourado',
    })
  })

  test('erro sem descrição continua sendo erro, e nunca em branco', async () => {
    const b = bancada({
      conversa: comFerramentas(
        [{ tool_name: 'tool-dnc', request_id: 'd1' }],
        [{ request_id: 'd1', is_error: true, result_value: '   ' }],
      ),
    })
    await finalizar(b)
    expect(b.invocacoes[0]?.error?.trim()).not.toBe('')
  })

  test('o reaplicador é chamado uma vez para a invocação com erro e nenhuma para a que deu certo', async () => {
    const mentira = reaplicadorDeMentira('tool-dnc')
    const b = bancada({
      conversa: comFerramentas(
        [
          { tool_name: 'tool-dnc', params_as_json: '{"motivo":"pediu"}', request_id: 'd1' },
          { tool_name: 'tool-dnc', request_id: 'd2' },
        ],
        [
          { request_id: 'd1', is_error: true, result_value: 'rede' },
          { request_id: 'd2', is_error: false },
        ],
      ),
    })
    const resposta = corpo(await finalizar(b, AGORA, {}, mentira.registro))
    expect(mentira.chamadas).toHaveLength(1)
    expect(mentira.chamadas[0]).toMatchObject({
      account_id: CONTA,
      call_id: CHAMADA,
      lead_id: LEAD,
      tool: 'tool-dnc',
      request: { motivo: 'pediu' },
      error: 'rede',
      at: mais(INICIO, 20_000),
    })
    expect(resposta.reaplicacoes).toEqual({ feitas: 1, falharam: 0 })
  })

  test('a releitura da mesma transcrição não duplica invocação nem reaplica de novo', async () => {
    const mentira = reaplicadorDeMentira('tool-dnc')
    const b = bancada({
      conclusaoFalha: 1,
      conversa: comFerramentas(
        [{ tool_name: 'tool-dnc', request_id: 'd1' }, { tool_name: 'end_call' }],
        [{ request_id: 'd1', is_error: true, result_value: 'rede' }],
      ),
    })
    // A primeira passagem grava tudo e cai antes de `finalized_at`; a
    // varredura volta depois de a reivindicação vencer.
    expect((await finalizar(b, AGORA, {}, mentira.registro)).status).toBe(503)
    const depois = mais(AGORA, VALIDADE_DA_REIVINDICACAO_MS + 1_000)
    const segunda = corpo(await finalizar(b, depois, {}, mentira.registro))

    expect(b.invocacoes.map((i) => i.tool)).toEqual(['tool-dnc', 'system:end_call'])
    expect(mentira.chamadas).toHaveLength(1)
    expect(segunda.reaplicacoes).toEqual({ feitas: 0, falharam: 0 })
  })

  test('reaplicador que falha não derruba a finalização e fica contado', async () => {
    const mentira = reaplicadorDeMentira('tool-dnc', true)
    const b = bancada({
      conversa: comFerramentas(
        [{ tool_name: 'tool-dnc', request_id: 'd1' }],
        [{ request_id: 'd1', is_error: true, result_value: 'rede' }],
      ),
    })
    const resposta = corpo(await finalizar(b, AGORA, {}, mentira.registro))
    expect(resposta.reaplicacoes).toEqual({ feitas: 0, falharam: 1 })
    expect(b.chamada.finalized_at).toBe(AGORA)
  })

  test('o registro da produção continua vazio: tool-dnc tem caminho próprio', () => {
    expect(REAPLICADORES.size).toBe(0)
    expect(REAPLICADORES.has('tool-dnc')).toBe(false)
  })
})

describe('o bloqueio refeito na finalização (US-108)', () => {
  // O banco caiu durante a ligação: o esqueleto respondeu 200 com `ok: false`,
  // e o provedor registrou a invocação como bem-sucedida.
  const naoPerturbe = () =>
    comFerramentas(
      [
        { tool_name: 'tool-dnc', params_as_json: '{"reason":"lead_request"}', request_id: 'd1' },
        { tool_name: 'end_call' },
      ],
      [{ request_id: 'd1', is_error: false, result_value: '{"ok":false}' }],
    )

  test('o tool-dnc que não gravou vira bloqueio e item, com a marca da reaplicação', async () => {
    const b = bancada({ conversa: naoPerturbe() })
    const resposta = corpo(await finalizar(b))

    expect(b.bloqueios).toEqual([
      expect.objectContaining({
        contaId: CONTA,
        telefone: TELEFONE_DO_LEAD,
        origem: 'lead_request',
        notas: NOTA_DA_REAPLICACAO,
        instante: mais(INICIO, 20_000),
      }),
    ])
    expect(b.itensDeBloqueio).toHaveLength(1)
    expect(b.itensDeBloqueio[0]?.contexto).toMatchObject({ reaplicado: true, origem: 'lead_request' })
    // A invocação que o provedor deu por certa continua sem linha.
    expect(b.invocacoes.map((i) => i.tool)).toEqual(['system:end_call'])
    expect(resposta.bloqueios).toMatchObject({ ensaio: false, pedidos: 1, criados: 1 })
  })

  test('a segunda passagem da finalização não cria o segundo bloqueio nem o segundo item', async () => {
    const b = bancada({ conversa: naoPerturbe(), conclusaoFalha: 1 })
    expect((await finalizar(b)).status).toBe(503)
    const segunda = corpo(await finalizar(b, mais(AGORA, VALIDADE_DA_REIVINDICACAO_MS + 1_000)))

    expect(b.bloqueios).toHaveLength(1)
    expect(b.itensDeBloqueio).toHaveLength(1)
    expect(segunda.bloqueios).toMatchObject({ criados: 0, existentes: 1 })
  })

  test('chamada de ensaio com tool-dnc não bloqueia nem toca a escrita', async () => {
    const b = bancada({ conversa: naoPerturbe(), direcao: 'rehearsal' })
    const resposta = corpo(await finalizar(b))

    expect(b.bloqueios).toEqual([])
    expect(b.itensDeBloqueio).toEqual([])
    expect(b.tocados).not.toContain('numerosDaChamada')
    expect(b.tocados).not.toContain('bloquearNumero')
    expect(b.tocados).not.toContain('abrirItemDeBloqueio')
    expect(resposta.bloqueios).toMatchObject({ ensaio: true, criados: 0 })
  })

  test('transcrição sem tool-dnc não toca a escrita do bloqueio', async () => {
    const b = bancada()
    const resposta = corpo(await finalizar(b))
    expect(b.tocados).not.toContain('numerosDaChamada')
    expect(resposta.bloqueios).toMatchObject({ pedidos: 0, criados: 0 })
  })

  test('bloqueio que falha deixa a chamada sem finalized_at, e a varredura cumpre a promessa', async () => {
    const b = bancada({ conversa: naoPerturbe(), bloqueioFalha: 1 })
    expect((await finalizar(b)).status).toBe(503)
    expect(b.chamada.finalized_at).toBeNull()
    expect(b.bloqueios).toEqual([])

    const depois = mais(AGORA, VALIDADE_DA_REIVINDICACAO_MS + 1_000)
    const segunda = corpo(await finalizar(b, depois))
    expect(b.bloqueios).toHaveLength(1)
    expect(b.chamada.finalized_at).toBe(depois)
    expect(segunda.bloqueios).toMatchObject({ criados: 1 })
  })
})

describe('as duas falas da pessoa errada (US-109)', () => {
  const DNC = { tool_name: 'tool-dnc', params_as_json: '{"reason":"wrong_number"}', request_id: 'w1' }
  const FIM = { tool_name: 'end_call', request_id: 'w2' }
  const pessoaErrada = (falasDepois: number) =>
    conversaDoProvedor({
      turnos: [
        { role: 'agent', message: AVISO_DITO, time_in_call_secs: 1 },
        { role: 'user', message: 'Não é o Marcos, não.', time_in_call_secs: 5 },
        {
          role: 'agent',
          message: 'Ah, desculpa o engano.',
          time_in_call_secs: 7,
          tool_calls: falasDepois === 0 ? [DNC, FIM] : [DNC],
        },
        ...Array.from({ length: falasDepois }, (_, i): TurnoCru => ({
          role: 'agent',
          message: i === falasDepois - 1 ? 'Tenha um bom dia!' : 'A Fluxo Cargo ajuda transportadoras.',
          time_in_call_secs: 9 + i * 2,
          ...(i === falasDepois - 1 ? { tool_calls: [FIM] } : {}),
        })),
      ],
    })

  test('na terceira fala, a divergência vai para a avaliação com o número medido', async () => {
    const b = bancada({ conversa: pessoaErrada(2) })
    const resposta = corpo(await finalizar(b))

    expect(b.medicoes).toEqual([
      {
        criterio: 'encerramento_pessoa_errada',
        medicao: { conforme: false, falas: 3, limite: 2, encerrou_com_end_call: true, requisito: 'RF-422' },
      },
    ])
    expect(resposta.encerramentoDaPessoaErrada).toBe('divergente')
    // A divergência não abre item nesta fatia: a fila mínima tem três gêneros.
    expect(b.itensDeBloqueio.every((item) => item.contexto.origem === 'wrong_number')).toBe(true)
  })

  test('em duas falas ou menos é conforme, e nada se escreve', async () => {
    for (const falasDepois of [0, 1]) {
      const b = bancada({ conversa: pessoaErrada(falasDepois) })
      const resposta = corpo(await finalizar(b))
      expect(b.tocados).not.toContain('registrarMedicaoDaAvaliacao')
      expect(resposta.encerramentoDaPessoaErrada).toBe('conforme')
    }
  })

  test('sem tool-dnc com wrong_number não se aplica', async () => {
    const b = bancada()
    const resposta = corpo(await finalizar(b))
    expect(b.tocados).not.toContain('registrarMedicaoDaAvaliacao')
    expect(resposta.encerramentoDaPessoaErrada).toBe('nao_se_aplica')
  })

  test('o ensaio também é medido', async () => {
    const b = bancada({ conversa: pessoaErrada(2), direcao: 'rehearsal' })
    const resposta = corpo(await finalizar(b))
    expect(b.medicoes).toHaveLength(1)
    expect(resposta.encerramentoDaPessoaErrada).toBe('divergente')
  })

  test('gravação da medição que falha não segura a finalização', async () => {
    const b = bancada({ conversa: pessoaErrada(2), medicaoFalha: true })
    const resposta = await finalizar(b)
    expect(resposta.status).toBe(200)
    expect(corpo(resposta).encerramentoDaPessoaErrada).toBe('falhou')
    expect(b.chamada.finalized_at).toBe(AGORA)
  })

  test('a medição é gravada antes de a classificação ser acionada', async () => {
    const b = bancada({ conversa: pessoaErrada(2) })
    await finalizar(b)
    expect(b.tocados.indexOf('registrarMedicaoDaAvaliacao')).toBeLessThan(b.tocados.indexOf('acionarClassificacao'))
    expect(b.tocados.indexOf('registrarMedicaoDaAvaliacao')).toBeGreaterThan(-1)
  })
})

describe('o sentimento e a fila pelos limiares da conta (US-141)', () => {
  const PELA_FERRAMENTA = {
    classification_source: 'tool',
    classification: { stage_key: 'qualificado', sentiment: -0.6 },
  } as const

  test('o sentimento da ferramenta vai para a chamada e o lead, com a fonte', async () => {
    const b = bancada({ resultado: PELA_FERRAMENTA, classificadaPorFerramenta: true })
    const resposta = corpo(await finalizar(b))
    expect(b.sentimentos).toEqual([{ leadId: LEAD, valor: -0.6, fonte: 'tool' }])
    expect(resposta.sentimento).toBe('tool')
  })

  test('o piso vem da conta: -0,6 gera item com -0,5 e não gera com -0,8', async () => {
    const com = bancada({ resultado: PELA_FERRAMENTA, pisoDeSentimento: -0.5 })
    expect(corpo(await finalizar(com)).fila).toEqual({ situacao: 'avaliada', criados: ['sentimento_negativo'], jaAbertos: [] })
    expect(com.itensDeFila[0]?.thresholdSnapshot).toEqual({ sentiment_floor: -0.5 })

    const sem = bancada({ resultado: PELA_FERRAMENTA, pisoDeSentimento: -0.8 })
    expect(corpo(await finalizar(sem)).fila).toEqual({ situacao: 'avaliada', criados: [], jaAbertos: [] })
    expect(sem.itensDeFila).toEqual([])
  })

  test('três falhas seguidas ao número viram item com a chave do número e do dia da conta', async () => {
    const b = bancada({
      conversa: conversaDoProvedor({ turnos: [] }),
      sequencia: { telefone: TELEFONE_DO_LEAD, falhas: 3 },
    })
    await finalizar(b)
    expect(b.itensDeFila.map((i) => i.deduplicacaoKey)).toEqual([`falha:${TELEFONE_DO_LEAD}:2026-03-20`])
  })

  test('o ensaio não toca a porta da fila nem o sentimento', async () => {
    const b = bancada({ direcao: 'rehearsal', resultado: PELA_FERRAMENTA })
    const resposta = corpo(await finalizar(b))
    for (const membro of ['lerResultadoDaChamada', 'gravarSentimento', 'limiaresDaFila', 'falhasConsecutivas', 'registrarItemDeFila']) {
      expect(b.tocados).not.toContain(membro)
    }
    expect(resposta.fila).toEqual({ situacao: 'nao_se_aplica' })
  })

  test('banco fora do ar não segura a finalização', async () => {
    const b = bancada({ sequencia: 'levanta' })
    const resposta = corpo(await finalizar(b))
    expect(resposta.fila).toEqual({ situacao: 'falhou' })
    expect(b.chamada.finalized_at).toBe(AGORA)
  })

  test('lê o resultado depois da retaguarda e antes da conclusão', async () => {
    const b = bancada()
    await finalizar(b)
    const posicao = b.tocados.indexOf('lerResultadoDaChamada')
    expect(posicao).toBeGreaterThan(b.tocados.indexOf('acionarClassificacao'))
    expect(b.tocados.indexOf('falhasConsecutivas')).toBeGreaterThan(b.tocados.indexOf('gravarDesfecho'))
    expect(posicao).toBeLessThan(b.tocados.indexOf('concluirFinalizacao'))
  })
})

// 11. A avaliação automática (US-142) ------------------------------------------------

describe('a avaliação automática ao fim da chamada (US-142)', () => {
  /** O juízo que `call-classify` grava, com o modelo dublado. */
  const JUIZO = {
    evaluation: {
      criterios: {
        nada_fora_da_base: { aprovado: true, justificativa: 'dublado' },
        nunca_afirmar: { aprovado: true, justificativa: 'dublado' },
      },
      modelo: 'dublado',
    },
  }

  test('grava itens e nota pelos critérios da conta, depois da retaguarda e antes da fila', async () => {
    const b = bancada({ resultado: JUIZO })
    const resposta = await finalizar(b)

    expect(corpo(resposta).avaliacao).toMatchObject({ situacao: 'avaliada' })
    expect(b.avaliacoes).toHaveLength(1)
    const chaves = b.avaliacoes[0]!.itens.map((item) => item.criterio)
    for (const linha of LINHAS_DA_SEMENTE) expect(chaves).toContain(linha.key)
    expect(b.avaliacoes[0]!.nota).not.toBeNull()

    const ordem = b.tocados.filter((membro) =>
      ['acionarClassificacao', 'registrarAvaliacaoAutomatica', 'registrarItemDeFila', 'limiaresDaFila'].includes(membro),
    )
    expect(ordem.indexOf('registrarAvaliacaoAutomatica')).toBeGreaterThan(ordem.indexOf('acionarClassificacao'))
    expect(ordem.indexOf('registrarAvaliacaoAutomatica')).toBeLessThan(ordem.indexOf('limiaresDaFila'))
  })

  test('consent_notice_at é o instante do turno do critério de aviso aprovado', async () => {
    const b = bancada({ resultado: JUIZO })
    await finalizar(b)
    const aviso = b.avaliacoes[0]!.itens.find((item) => item.criterio === 'aviso_gravacao')
    expect(aviso?.aprovado).toBe(true)
    expect(desfecho(b).consent_notice_at).toBe(mais(INICIO, 1_000))
  })

  test('o trecho do critério da conta também reconhece o aviso, e o consentimento acha o mesmo turno', async () => {
    const b = bancada({
      resultado: JUIZO,
      criterios: LINHAS_DA_SEMENTE.map((linha) =>
        linha.key === 'aviso_gravacao' ? { ...linha, trechos: ['conversa fica registrada'] } : linha,
      ),
      conversa: conversaDoProvedor({
        turnos: [
          { role: 'agent', message: 'Oi, Marcos! Aqui é a Sarah.', time_in_call_secs: 1 },
          { role: 'agent', message: 'Só pra saber: esta conversa fica registrada, tá?', time_in_call_secs: 2 },
          { role: 'user', message: 'Tá bom.', time_in_call_secs: 4 },
        ],
      }),
    })
    await finalizar(b)
    expect(desfecho(b).consent_notice_at).toBe(mais(INICIO, 2_000))
    expect(b.consentimentos[0]?.granted).toBe(true)
    expect(b.consentimentos[0]?.at).toBe(mais(INICIO, 2_000))
  })

  test('sem o juízo do modelo (via da ferramenta), os itens vão e a nota fica nula', async () => {
    const b = bancada({ classificadaPorFerramenta: true, resultado: { classification_source: 'tool', evaluation: {} } })
    await finalizar(b)
    expect(b.classificacoes).toEqual([])
    expect(b.avaliacoes[0]?.nota).toBeNull()
  })

  test('gravação desligada: o aviso não se aplica e não reprova', async () => {
    const b = bancada({ resultado: JUIZO, politica: { gravacaoLigada: false } })
    await finalizar(b)
    expect(b.avaliacoes[0]!.itens.find((item) => item.criterio === 'aviso_gravacao')).toMatchObject({
      aprovado: null,
      motivo: 'nao_se_aplica',
    })
    expect(desfecho(b).consent_notice_at).toBeNull()
  })

  test('o ensaio não é avaliado', async () => {
    const b = bancada({ resultado: JUIZO, direcao: 'rehearsal' })
    const resposta = await finalizar(b)
    expect(corpo(resposta).avaliacao).toEqual({ situacao: 'nao_se_aplica' })
    expect(b.tocados).not.toContain('registrarAvaliacaoAutomatica')
  })

  test('falha ao gravar a avaliação não segura o desfecho', async () => {
    const b = bancada({ resultado: JUIZO, avaliacaoFalha: true })
    const resposta = await finalizar(b)
    expect(resposta.status).toBe(200)
    expect(corpo(resposta).avaliacao).toEqual({ situacao: 'falhou' })
    expect(b.chamada.finalized_at).toBe(AGORA)
  })
})

// call-review: o ciclo que transforma uma ligação ouvida em melhoria do
// roteiro (US-245).
//
// Cinco passos, um por `acao`, e cada um só acontece na sua vez:
//
//   `analisar`    lê a conversa e devolve o questionário. Abre a revisão.
//   `responder`   grava as respostas e devolve as mudanças propostas.
//   `questionar`  reescreve uma proposta que o dono não aceitou como está.
//   `aplicar`     grava o que foi aceito como rascunho de versão. Encerra.
//   `descartar`   encerra sem aplicar nada.
//
// **O MODELO É `claude-opus-5`.** É a mesma decisão de `playbook-draft` e pela
// mesma razão: aqui se escreve o texto que a Sarah vai falar, a qualidade da
// redação é o produto, e ninguém espera por ela ao vivo — a revisão acontece
// numa ficha, depois da ligação, não durante.
//
// **NUNCA PUBLICA** (RF-307). O que `aplicar` escreve é `playbook_versions` em
// `draft`. Aceitar a proposta é aprovar o texto; pôr no ar continua sendo ato
// explícito de quem administra, pela tela de playbooks. Uma revisão que
// publicasse sozinha poria na boca da Sarah um texto aprovado por resumo.
//
// **UMA VERSÃO, NÃO DUAS.** Roteiro e jeito da casa aceitos na mesma revisão
// vão para a **mesma** linha nova de `playbook_versions`, porque as duas
// camadas moram na mesma linha. Gravar duas versões faria a segunda nascer
// carregando a primeira, e o histórico mostraria dois passos onde houve uma
// decisão. As duas mudanças aceitas apontam para a mesma `applied_version_id`.
//
// **O QUE NÃO SE APLICA, ENCAMINHA.** Troca de voz e falta na base de
// conhecimento não viram texto: viram o endereço exato da tela e a frase do
// que fazer lá. Quem garante que o endereço existe é
// `_shared/agente/revisao-de-chamada.ts`, com a lista fechada de telas; quem
// garante que a proposta não fica sem endereço é o check da tabela.
//
// **A CONVERSA NÃO ENTRA NA OBSERVABILIDADE.** Como em `call-classify`, o que
// vai para `integration_events` é o resumo — modelo, etapa, contagem de turnos,
// tamanhos — e nunca a transcrição nem o roteiro. Conversa mora em `calls`.
//
// Módulo portável: sem Deno, sem rede, sem banco. O modelo e a camada de dados
// entram por `PortaDaRevisao`, implementada em `index.ts`.

import { ferramentasDoProposito } from '../_shared/agente/compilador.ts'
import {
  formaDaPergunta,
  HISTORICO_VAZIO,
  lerAnalise,
  lerMudancas,
  semMudancas,
  lerReescrita,
  montarPedidoDeAnalise,
  montarPedidoDePropostas,
  montarPedidoDeReescrita,
  TIPOS_QUE_SE_APLICAM,
  TELAS_DE_ENCAMINHAMENTO,
  destinoDaMudanca,
  type Analise,
  type ContextoDaRevisao,
  type HistoricoDaConta,
  type LeituraDaConversa,
  type MudancaSugerida,
  type RespostaDoQuestionario,
  type TipoDeMudanca,
  type TurnoDaConversa,
} from '../_shared/agente/revisao-de-chamada.ts'
import type { ModeloResolvido, Tarefa } from '../_shared/modelo/resolucao.ts'
import { escolherVariante, PROPOSITOS, type Proposito, type Variante } from '../_shared/playbook/camada-um.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'

import { CAMINHO_DA_RECUSA, MENSAGENS, notaDaVersao, STATUS, type MotivoDaRevisao } from './respostas.ts'

/**
 * A tarefa desta função na tabela de `_shared/modelo/resolucao.ts`. O modelo em
 * si não mora mais aqui: ele é da conta (US-246), e o padrão de quem não
 * escolheu é o daquela tabela — opus, pela decisão da seção 10 do PRD.
 */
export const TAREFA_DA_REVISAO: Tarefa = 'review'

/** Como o modelo aparece em `integration_events.provider`, o mesmo das outras. */
export const PROVEDOR_DO_MODELO = 'modelo'

/** Quem revisa. A mesma hierarquia de `playbook-draft`: roteiro é configuração. */
export const PAPEIS_QUE_REVISAM: ReadonlySet<string> = new Set(['owner', 'admin'])

/** Os cinco passos do ciclo. */
export const ACOES = ['analisar', 'responder', 'questionar', 'aplicar', 'descartar'] as const
export type AcaoDaRevisao = (typeof ACOES)[number]

/** Os dois estados de chamada em que revisar faz sentido: a ligação acabou. */
export const ESTADOS_REVISAVEIS: ReadonlySet<string> = new Set(['ended', 'failed'])

/**
 * O menor questionamento aceito. Abaixo disso ("não gostei") o modelo reescreve
 * no escuro e devolve outra coisa qualquer, e a pessoa questiona de novo.
 */
export const TAMANHO_MINIMO_DO_QUESTIONAMENTO = 10

/** O maior texto de resposta do questionário aceito por pergunta. */
export const TAMANHO_MAXIMO_DA_RESPOSTA = 4_000

export interface UsuarioDaSessao {
  readonly id: string
}

/** A chamada a revisar, com o roteiro que a produziu. */
export interface ChamadaParaRevisar {
  readonly id: string
  readonly account_id: string
  readonly purpose: string
  readonly status: string
  readonly transcript: unknown
  readonly end_reason: string | null
  readonly duration_sec: number | null
  readonly playbook_version_id: string | null
  /** `body_script` da versão com que a Sarah falou, ou da vigente quando não há. */
  readonly body_script: string
  readonly body_house: string
}

export interface PerguntaGravada {
  readonly id: string
  readonly position: number
  readonly question: string
  readonly why: string
  readonly kind: 'text' | 'choice'
  readonly options: readonly string[]
  readonly answer: string | null
}

export interface MudancaGravada {
  readonly id: string
  readonly position: number
  readonly kind: TipoDeMudanca
  readonly title: string
  readonly rationale: string
  readonly body: string | null
  readonly path: string | null
  readonly path_action: string | null
  readonly decision: string
  readonly revisions: number
}

/** A revisão como a borda precisa dela: a linha, as perguntas e as propostas. */
export interface RevisaoCompleta {
  readonly id: string
  readonly account_id: string
  readonly call_id: string
  readonly status: string
  readonly purpose: string
  readonly analysis: unknown
  readonly perguntas: readonly PerguntaGravada[]
  readonly mudancas: readonly MudancaGravada[]
}

export interface PlaybookDoProposito {
  readonly id: string
  /** `body_script` e `body_house` da versão vigente: o que a nova carrega. */
  readonly body_script: string
  readonly body_house: string
}

export interface PedidoAoModelo {
  /** Já resolvido pela conta: o adaptador só o repassa ao provedor da porta. */
  readonly modelo: string
  /** Por qual porta falar. Viaja no pedido para o adaptador não resolver de novo. */
  readonly porta: string
  /** De quem é a credencial, quando a porta é a da conta. */
  readonly contaId: string
  readonly sistema: string
  readonly mensagem: string
  readonly esquema: Readonly<Record<string, unknown>>
}

export interface RespostaDoModelo extends EnvelopeDoProvedor {
  readonly texto?: string | null
  readonly tokensDeEntrada?: number | null
  readonly tokensDeSaida?: number | null
}

/** A linha de `call_reviews` que `analisar` grava. */
export interface LinhaDaRevisao {
  readonly account_id: string
  readonly call_id: string
  readonly status: 'questions'
  readonly purpose: string
  readonly playbook_version_id: string | null
  readonly analysis: Readonly<Record<string, unknown>>
  readonly created_by: string
}

/** Uma linha de `call_review_questions`. */
export interface LinhaDaPergunta {
  readonly account_id: string
  readonly review_id: string
  readonly position: number
  readonly question: string
  readonly why: string
  readonly kind: 'text' | 'choice'
  readonly options: readonly string[]
}

/** Uma linha de `call_review_changes`. */
export interface LinhaDaMudanca {
  readonly account_id: string
  readonly review_id: string
  readonly position: number
  readonly kind: TipoDeMudanca
  readonly title: string
  readonly rationale: string
  readonly body: string | null
  readonly path: string | null
  readonly path_action: string | null
}

/** O que `questionar` escreve por cima da proposta, sem mudar o tipo dela. */
export interface ReescritaDaMudanca {
  readonly title: string
  readonly rationale: string
  readonly body: string | null
  readonly path: string | null
  readonly path_action: string | null
  readonly owner_note: string
}

/** A decisão que a tela manda por proposta ao aplicar. */
export interface DecisaoDaMudanca {
  readonly id: string
  readonly aceita: boolean
}

export interface VersaoGravada {
  readonly id: string
  readonly version: number
}

export interface EventoDeIntegracao {
  readonly account_id: string
  readonly direction: 'outbound'
  readonly provider: string
  readonly endpoint: string
  readonly request: Readonly<Record<string, unknown>>
  readonly response: Readonly<Record<string, unknown>>
  readonly status_code: number | null
  readonly latency_ms: number | null
  /** A chamada revisada: é por ela que a ida ao modelo se liga à ligação. */
  readonly correlation_id: string
}

/**
 * A camada de dados e o modelo. `index.ts` a implementa; o teste a dubla.
 * Não há método que publique versão nem que altere versão existente.
 */
export interface PortaDaRevisao {
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  lerChamada(contaId: string, chamadaId: string): Promise<ChamadaParaRevisar | null>
  lerRevisao(contaId: string, revisaoId: string): Promise<RevisaoCompleta | null>
  /** Levanta quando já existe revisão aberta: o único parcial é quem recusa. */
  criarRevisao(linha: LinhaDaRevisao): Promise<{ id: string }>
  gravarPerguntas(linhas: readonly LinhaDaPergunta[]): Promise<void>
  gravarRespostas(revisaoId: string, respostas: readonly { id: string; answer: string }[]): Promise<void>
  gravarMudancas(linhas: readonly LinhaDaMudanca[]): Promise<void>
  substituirMudanca(mudancaId: string, reescrita: ReescritaDaMudanca): Promise<void>
  decidirMudancas(revisaoId: string, decisoes: readonly DecisaoDaMudanca[]): Promise<void>
  playbookDoProposito(contaId: string, proposito: Proposito): Promise<PlaybookDoProposito | null>
  /**
   * A camada 2 e a 3 como estão agora no propósito: a versão mais nova,
   * rascunho ou publicada. Nula quando o propósito não tem versão.
   */
  configuracaoAtual(
    contaId: string,
    proposito: Proposito,
  ): Promise<{ roteiro: string; jeitoDaCasa: string } | null>
  /**
   * O que **esta conta** já respondeu e aceitou em revisões anteriores, as mais
   * recentes primeiro, sem a revisão em curso. Sempre filtrado pela conta: é o
   * que o modelo lê como verdade do negócio, e resposta de outra conta aqui
   * seria o negócio de outra pessoa dentro das perguntas desta.
   */
  historicoDaConta(contaId: string, excetoRevisaoId: string | null): Promise<HistoricoDaConta>
  gravarRascunho(linha: {
    account_id: string
    playbook_id: string
    status: 'draft'
    body_script: string
    body_house: string
    change_note: string
    author_id: string
  }): Promise<VersaoGravada>
  marcarMudancasAplicadas(ids: readonly string[], versaoId: string): Promise<void>
  encerrarRevisao(revisaoId: string, status: 'applied' | 'discarded'): Promise<void>
  /**
   * De qual modelo esta conta fala, e por qual porta (US-246). Resolvido a
   * cada passo, e não uma vez por revisão: um ciclo dura o tempo de alguém
   * responder um questionário, e a conta pode trocar de provedor no meio.
   */
  modeloDaConta(contaId: string): Promise<ModeloResolvido>
  /** Nunca levanta: falha de rede e recusa chegam como `ok: false`. */
  perguntarAoModelo(pedido: PedidoAoModelo): Promise<RespostaDoModelo>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly autorizacao: string | null
  readonly contaId: unknown
  readonly acao: unknown
  readonly chamadaId: unknown
  readonly revisaoId: unknown
  readonly respostas: unknown
  readonly mudancaId: unknown
  readonly questionamento: unknown
  readonly decisoes: unknown
}

/** Uma pergunta como a tela a recebe. */
export interface PerguntaNaTela {
  readonly id: string
  readonly posicao: number
  readonly pergunta: string
  readonly porque: string
  readonly tipo: 'text' | 'choice'
  readonly opcoes: readonly string[]
}

/** Uma proposta como a tela a recebe, já com o destino resolvido. */
export interface MudancaNaTela {
  readonly id: string
  readonly posicao: number
  readonly tipo: TipoDeMudanca
  readonly titulo: string
  readonly razao: string
  readonly corpo: string | null
  readonly caminho: string | null
  readonly acaoNoCaminho: string | null
  /** A tela do caminho já existe. Falso manda a interface mostrar sem link. */
  readonly caminhoDisponivel: boolean
  readonly seAplicaSozinha: boolean
  readonly revisoes: number
}

export type CorpoDaRevisao =
  | { ok: true; passo: 'questionario'; revisaoId: string; leitura: LeituraDaConversa; perguntas: readonly PerguntaNaTela[]; semRegistro: boolean }
  | { ok: true; passo: 'propostas'; revisaoId: string; mudancas: readonly MudancaNaTela[]; semRegistro: boolean }
  | { ok: true; passo: 'reescrita'; revisaoId: string; mudanca: MudancaNaTela; semRegistro: boolean }
  | { ok: true; passo: 'aplicada'; revisaoId: string; versaoId: string | null; versao: number | null; aplicadas: number; encaminhamentos: readonly MudancaNaTela[] }
  | { ok: true; passo: 'descartada'; revisaoId: string }
  /**
   * A conversa não pediu pergunta nem mudança: a configuração atual já cobre o
   * que ela mostrou. A revisão fecha sozinha, sem gravar nada.
   */
  | { ok: true; passo: 'sem_mudancas'; revisaoId: string; leitura: LeituraDaConversa; semRegistro: boolean }

export interface RecusaDaRevisao {
  readonly ok: false
  readonly motivo: MotivoDaRevisao
  readonly mensagem: string
  /** Para onde a tela manda quem pode resolver isto, quando há para onde. */
  readonly caminho?: string
}

export interface RespostaDaRevisao {
  readonly status: number
  readonly corpo: CorpoDaRevisao | RecusaDaRevisao
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** Conduz um passo do ciclo. Nunca levanta: exceção da porta vira `falha_interna`. */
export async function atenderRevisao(
  pedido: PedidoDaBorda,
  porta: PortaDaRevisao,
): Promise<RespostaDaRevisao> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = texto(pedido.contaId)
  if (!contaId) return recusa('conta_ausente')

  const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? '')?.[1]?.trim()
  if (!jwt) return recusa('sem_sessao')

  const acao = lerAcao(pedido.acao)
  if (!acao) return recusa('acao_invalida')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (!PAPEIS_QUE_REVISAM.has(papel)) return recusa('papel_insuficiente')

    if (acao === 'analisar') return await analisar(pedido, contaId, usuario.id, porta)
    return await continuar(acao, pedido, contaId, usuario.id, porta)
  } catch {
    return recusa('falha_interna')
  }
}

function lerAcao(valor: unknown): AcaoDaRevisao | null {
  return typeof valor === 'string' && (ACOES as readonly string[]).includes(valor)
    ? (valor as AcaoDaRevisao)
    : null
}

// analisar -------------------------------------------------------------------------

async function analisar(
  pedido: PedidoDaBorda,
  contaId: string,
  autorId: string,
  porta: PortaDaRevisao,
): Promise<RespostaDaRevisao> {
  const chamadaId = texto(pedido.chamadaId)
  if (!chamadaId) return recusa('chamada_ausente')

  const chamada = await porta.lerChamada(contaId, chamadaId)
  if (!chamada) return recusa('chamada_inexistente')
  if (!ESTADOS_REVISAVEIS.has(chamada.status)) return recusa('chamada_em_andamento')

  const proposito = lerProposito(chamada.purpose)
  if (!proposito) return recusa('falha_interna')

  const turnos = lerTurnos(chamada.transcript)
  // Sem fala do interlocutor não houve conversa, e um questionário sobre o
  // silêncio perguntaria o que ninguém sabe responder.
  if (!turnos.some((turno) => turno.quem === 'lead')) return recusa('sem_conversa')

  const contexto = await montarContexto(chamada, proposito, turnos, contaId, null, porta)
  const textoDoPedido = montarPedidoDeAnalise(contexto)
  const { resposta, registrado } = await perguntar(porta, contaId, chamadaId, 'analise', textoDoPedido, {
    turnos: turnos.length,
    proposito,
    respondidas_antes: contexto.historico?.respondidas.length ?? 0,
  })

  if (!resposta.ok || typeof resposta.texto !== 'string') return recusa(motivoDoModelo(resposta))
  const lida = lerAnalise(resposta.texto)
  if (!lida) return recusa('resposta_ilegivel')
  const analise = semRepeticao(lida, contexto.historico ?? HISTORICO_VAZIO)

  const criada = await criarComQuestionario(contaId, chamada, autorId, analise, porta)
  if (!criada) return recusa('ja_existe_revisao')

  // Nada que só a conta saiba responder: sem questionário na tela, a revisão
  // vai direto às propostas, com as respostas vazias gravadas como dadas.
  if (criada.perguntas.length === 0) {
    await porta.gravarRespostas(criada.revisaoId, [])
    return await propor(criada.revisaoId, chamada.id, contexto, analise.leitura, [], contaId, porta)
  }

  return {
    status: 201,
    corpo: {
      ok: true,
      passo: 'questionario',
      revisaoId: criada.revisaoId,
      leitura: analise.leitura,
      perguntas: criada.perguntas,
      semRegistro: !registrado,
    },
  }
}

/**
 * Cria a revisão e o questionário, ou devolve nulo quando já havia uma aberta.
 * O único parcial `call_reviews_uma_aberta` é quem decide: duas telas abertas
 * na mesma chamada não abrem dois questionários concorrentes.
 */
async function criarComQuestionario(
  contaId: string,
  chamada: ChamadaParaRevisar,
  autorId: string,
  analise: Analise,
  porta: PortaDaRevisao,
): Promise<{ revisaoId: string; perguntas: PerguntaNaTela[] } | null> {
  let revisaoId: string
  try {
    const criada = await porta.criarRevisao({
      account_id: contaId,
      call_id: chamada.id,
      status: 'questions',
      purpose: chamada.purpose,
      playbook_version_id: chamada.playbook_version_id,
      analysis: {
        resumo: analise.leitura.resumo,
        tropecos: analise.leitura.tropecos,
        sem_resposta: analise.leitura.semResposta,
      },
      created_by: autorId,
    })
    revisaoId = criada.id
  } catch {
    return null
  }

  const linhas = analise.perguntas.map((pergunta, indice) => ({
    account_id: contaId,
    review_id: revisaoId,
    position: indice + 1,
    question: pergunta.pergunta,
    why: pergunta.porque,
    kind: pergunta.tipo,
    options: pergunta.opcoes,
  }))
  await porta.gravarPerguntas(linhas)

  // A revisão recém-criada é relida para as perguntas saírem com o id que o
  // banco deu — é por ele que a tela devolve as respostas. Tudo o mais vem da
  // linha relida, e não da resposta do modelo: recarregar a ficha mais tarde
  // precisa dar exatamente este mesmo questionário.
  const relida = await porta.lerRevisao(contaId, revisaoId)

  return { revisaoId, perguntas: (relida?.perguntas ?? []).map(perguntaParaTela) }
}

// Os quatro passos sobre uma revisão aberta ----------------------------------------

async function continuar(
  acao: Exclude<AcaoDaRevisao, 'analisar'>,
  pedido: PedidoDaBorda,
  contaId: string,
  autorId: string,
  porta: PortaDaRevisao,
): Promise<RespostaDaRevisao> {
  const revisaoId = texto(pedido.revisaoId)
  if (!revisaoId) return recusa('revisao_ausente')

  const revisao = await porta.lerRevisao(contaId, revisaoId)
  if (!revisao) return recusa('revisao_inexistente')
  if (revisao.status === 'applied' || revisao.status === 'discarded') return recusa('revisao_encerrada')

  if (acao === 'descartar') {
    await porta.encerrarRevisao(revisaoId, 'discarded')
    return { status: 200, corpo: { ok: true, passo: 'descartada', revisaoId } }
  }

  const chamada = await porta.lerChamada(contaId, revisao.call_id)
  if (!chamada) return recusa('chamada_inexistente')
  const proposito = lerProposito(revisao.purpose)
  if (!proposito) return recusa('falha_interna')
  const contexto = await montarContexto(
    chamada,
    proposito,
    lerTurnos(chamada.transcript),
    contaId,
    revisao.id,
    porta,
  )

  if (acao === 'responder') return await responder(pedido, revisao, contexto, contaId, porta)
  if (acao === 'questionar') return await questionar(pedido, revisao, contexto, contaId, porta)
  return await aplicar(pedido, revisao, contaId, autorId, proposito, porta)
}

async function responder(
  pedido: PedidoDaBorda,
  revisao: RevisaoCompleta,
  contexto: ContextoDaRevisao,
  contaId: string,
  porta: PortaDaRevisao,
): Promise<RespostaDaRevisao> {
  if (revisao.status !== 'questions') return recusa('etapa_errada')

  const enviadas = lerRespostasEnviadas(pedido.respostas)
  // Todas, e não algumas: o modelo escreve a proposta com o que o dono contou,
  // e pergunta sem resposta vira proposta escrita no escuro sobre aquele ponto.
  const respostas: { id: string; answer: string }[] = []
  for (const pergunta of revisao.perguntas) {
    const dita = enviadas.get(pergunta.id)?.trim() ?? ''
    if (dita === '') return recusa('respostas_incompletas')
    respostas.push({ id: pergunta.id, answer: dita.slice(0, TAMANHO_MAXIMO_DA_RESPOSTA) })
  }
  if (respostas.length === 0) return recusa('respostas_incompletas')

  await porta.gravarRespostas(revisao.id, respostas)

  const doQuestionario: RespostaDoQuestionario[] = revisao.perguntas.map((pergunta, indice) => ({
    pergunta: pergunta.question,
    resposta: respostas[indice]?.answer ?? '',
  }))

  return await propor(revisao.id, revisao.call_id, contexto, leituraDaRevisao(revisao), doQuestionario, contaId, porta)
}

/**
 * Pede as propostas e as grava. Lista vazia do modelo fecha a revisão como
 * `sem_mudancas`: não há o que aceitar, e deixá-la aberta travaria a próxima
 * análise da mesma chamada no único de revisão aberta.
 */
async function propor(
  revisaoId: string,
  chamadaId: string,
  contexto: ContextoDaRevisao,
  leitura: LeituraDaConversa,
  doQuestionario: readonly RespostaDoQuestionario[],
  contaId: string,
  porta: PortaDaRevisao,
): Promise<RespostaDaRevisao> {
  const textoDoPedido = montarPedidoDePropostas(contexto, leitura, doQuestionario)
  const { resposta, registrado } = await perguntar(porta, contaId, chamadaId, 'propostas', textoDoPedido, {
    perguntas: doQuestionario.length,
    proposito: contexto.proposito,
  })

  if (!resposta.ok || typeof resposta.texto !== 'string') return recusa(motivoDoModelo(resposta))
  if (semMudancas(resposta.texto)) {
    await porta.encerrarRevisao(revisaoId, 'discarded')
    return {
      status: 200,
      corpo: { ok: true, passo: 'sem_mudancas', revisaoId, leitura, semRegistro: !registrado },
    }
  }
  const sugeridas = lerMudancas(resposta.texto, contexto.variante)
  if (!sugeridas) return recusa('resposta_ilegivel')

  await porta.gravarMudancas(sugeridas.map((mudanca, indice) => linhaDaMudanca(mudanca, contaId, revisaoId, indice + 1)))

  const relida = await porta.lerRevisao(contaId, revisaoId)
  return {
    status: 200,
    corpo: {
      ok: true,
      passo: 'propostas',
      revisaoId,
      mudancas: (relida?.mudancas ?? []).map(paraTela),
      semRegistro: !registrado,
    },
  }
}

/**
 * Tira do questionário a pergunta que o histórico já respondeu. O pedido ao
 * modelo já proíbe a repetição; isto é a conferência, porque instrução ao
 * modelo é pedido e não garantia.
 */
function semRepeticao(analise: Analise, historico: HistoricoDaConta): Analise {
  const ja = new Set(historico.respondidas.map((item) => formaDaPergunta(item.pergunta)))
  const vistas = new Set<string>()
  const perguntas = analise.perguntas.filter((pergunta) => {
    const forma = formaDaPergunta(pergunta.pergunta)
    if (ja.has(forma) || vistas.has(forma)) return false
    vistas.add(forma)
    return true
  })
  return { ...analise, perguntas }
}

async function questionar(
  pedido: PedidoDaBorda,
  revisao: RevisaoCompleta,
  contexto: ContextoDaRevisao,
  contaId: string,
  porta: PortaDaRevisao,
): Promise<RespostaDaRevisao> {
  if (revisao.status !== 'proposed') return recusa('etapa_errada')

  const mudancaId = texto(pedido.mudancaId)
  if (!mudancaId) return recusa('mudanca_inexistente')
  const alvo = revisao.mudancas.find((mudanca) => mudanca.id === mudancaId)
  if (!alvo) return recusa('mudanca_inexistente')

  const questionamento = texto(pedido.questionamento) ?? ''
  if (questionamento.length < TAMANHO_MINIMO_DO_QUESTIONAMENTO) return recusa('questionamento_curto')

  const textoDoPedido = montarPedidoDeReescrita(contexto, daTela(alvo), questionamento)
  const { resposta, registrado } = await perguntar(porta, contaId, revisao.call_id, 'reescrita', textoDoPedido, {
    tipo: alvo.kind,
    revisoes: alvo.revisions,
  })

  if (!resposta.ok || typeof resposta.texto !== 'string') return recusa(motivoDoModelo(resposta))
  const reescrita = lerReescrita(resposta.texto, alvo.kind, contexto.variante)
  if (!reescrita) return recusa('resposta_ilegivel')

  const destino = reescrita.tela ? destinoDaMudanca(reescrita.tela) : null
  await porta.substituirMudanca(mudancaId, {
    title: reescrita.titulo,
    rationale: reescrita.razao,
    body: reescrita.corpo,
    path: destino?.caminho ?? null,
    path_action: reescrita.acao,
    owner_note: questionamento,
  })

  const relida = await porta.lerRevisao(contaId, revisao.id)
  const atualizada = relida?.mudancas.find((mudanca) => mudanca.id === mudancaId)
  if (!atualizada) return recusa('falha_interna')

  return {
    status: 200,
    corpo: { ok: true, passo: 'reescrita', revisaoId: revisao.id, mudanca: paraTela(atualizada), semRegistro: !registrado },
  }
}

async function aplicar(
  pedido: PedidoDaBorda,
  revisao: RevisaoCompleta,
  contaId: string,
  autorId: string,
  proposito: Proposito,
  porta: PortaDaRevisao,
): Promise<RespostaDaRevisao> {
  if (revisao.status !== 'proposed') return recusa('etapa_errada')

  const decisoes = lerDecisoes(pedido.decisoes, revisao.mudancas)
  if (!decisoes) return recusa('mudanca_inexistente')
  const aceitas = revisao.mudancas.filter((mudanca) => decisoes.get(mudanca.id) === true)
  if (aceitas.length === 0) return recusa('nada_aceito')

  await porta.decidirMudancas(
    revisao.id,
    revisao.mudancas.map((mudanca) => ({ id: mudanca.id, aceita: decisoes.get(mudanca.id) === true })),
  )

  // Uma versão, não duas: as duas camadas moram na mesma linha. Ver o cabeçalho.
  const doRoteiro = aceitas.filter((mudanca) => TIPOS_QUE_SE_APLICAM.has(mudanca.kind))
  let versao: VersaoGravada | null = null

  if (doRoteiro.length > 0) {
    const playbook = await porta.playbookDoProposito(contaId, proposito)
    // `criar_playbooks_para` cria os quatro junto com a conta: ausente é defeito
    // da instalação, não estado que a tela resolva.
    if (!playbook) return recusa('falha_interna')

    const script = doRoteiro.find((mudanca) => mudanca.kind === 'script')
    const house = doRoteiro.find((mudanca) => mudanca.kind === 'house')

    versao = await porta.gravarRascunho({
      account_id: contaId,
      playbook_id: playbook.id,
      status: 'draft',
      // A camada que ninguém mudou vem da vigente, sem uma letra a menos:
      // versão nova com a outra camada em branco a apagaria na publicação.
      body_script: script?.body ?? playbook.body_script,
      body_house: house?.body ?? playbook.body_house,
      change_note: notaDaVersao(doRoteiro.map((mudanca) => mudanca.title).join('; ')),
      author_id: autorId,
    })

    await porta.marcarMudancasAplicadas(doRoteiro.map((mudanca) => mudanca.id), versao.id)
  }

  await porta.encerrarRevisao(revisao.id, 'applied')

  return {
    status: 200,
    corpo: {
      ok: true,
      passo: 'aplicada',
      revisaoId: revisao.id,
      versaoId: versao?.id ?? null,
      versao: versao?.version ?? null,
      aplicadas: doRoteiro.length,
      // O que foi aceito e o ciclo não executa volta para a tela mostrar: é o
      // caminho de onde a pessoa mexe, e some se ninguém o devolver.
      encaminhamentos: aceitas.filter((mudanca) => !TIPOS_QUE_SE_APLICAM.has(mudanca.kind)).map(paraTela),
    },
  }
}

// Leitura do pedido ----------------------------------------------------------------

function lerRespostasEnviadas(valor: unknown): Map<string, string> {
  const mapa = new Map<string, string>()
  if (!Array.isArray(valor)) return mapa
  for (const item of valor) {
    if (!item || typeof item !== 'object') continue
    const { id, resposta } = item as Record<string, unknown>
    if (typeof id === 'string' && typeof resposta === 'string') mapa.set(id, resposta)
  }
  return mapa
}

/**
 * As decisões, ou nulo quando alguma não pertence à revisão. Recusar o pedido
 * inteiro é o certo: decisão de id desconhecido é tela desatualizada, e aplicar
 * "o que deu para casar" gravaria uma versão que ninguém aprovou.
 */
function lerDecisoes(
  valor: unknown,
  mudancas: readonly MudancaGravada[],
): Map<string, boolean> | null {
  const mapa = new Map<string, boolean>()
  if (!Array.isArray(valor)) return mapa
  const conhecidas = new Set(mudancas.map((mudanca) => mudanca.id))
  for (const item of valor) {
    if (!item || typeof item !== 'object') continue
    const { id, aceita } = item as Record<string, unknown>
    if (typeof id !== 'string' || typeof aceita !== 'boolean') continue
    if (!conhecidas.has(id)) return null
    mapa.set(id, aceita)
  }
  return mapa
}

// Tradução -------------------------------------------------------------------------

function linhaDaMudanca(
  mudanca: MudancaSugerida,
  contaId: string,
  revisaoId: string,
  posicao: number,
): LinhaDaMudanca {
  const destino = mudanca.tela ? destinoDaMudanca(mudanca.tela) : null
  return {
    account_id: contaId,
    review_id: revisaoId,
    position: posicao,
    kind: mudanca.tipo,
    title: mudanca.titulo,
    rationale: mudanca.razao,
    body: mudanca.corpo,
    path: destino?.caminho ?? null,
    path_action: mudanca.acao,
  }
}

/** A pergunta gravada, como a tela a lê. */
export function perguntaParaTela(pergunta: PerguntaGravada): PerguntaNaTela {
  return {
    id: pergunta.id,
    posicao: pergunta.position,
    pergunta: pergunta.question,
    porque: pergunta.why,
    tipo: pergunta.kind,
    opcoes: pergunta.options,
  }
}

/** A proposta gravada, como a tela a lê. O destino se resolve aqui, não no banco. */
export function paraTela(mudanca: MudancaGravada): MudancaNaTela {
  const seAplica = TIPOS_QUE_SE_APLICAM.has(mudanca.kind)
  return {
    id: mudanca.id,
    posicao: mudanca.position,
    tipo: mudanca.kind,
    titulo: mudanca.title,
    razao: mudanca.rationale,
    corpo: mudanca.body,
    caminho: mudanca.path,
    acaoNoCaminho: mudanca.path_action,
    // A tela de conhecimento é US-085 e ainda não existe: o caminho aparece
    // como texto, e não como link que morre.
    caminhoDisponivel: mudanca.path !== null && telaDisponivel(mudanca.path),
    seAplicaSozinha: seAplica,
    revisoes: mudanca.revisions,
  }
}

/** A proposta gravada, na forma que o pedido de reescrita conhece. */
function daTela(mudanca: MudancaGravada): MudancaSugerida {
  return {
    tipo: mudanca.kind,
    titulo: mudanca.title,
    razao: mudanca.rationale,
    corpo: mudanca.body,
    tela: null,
    acao: mudanca.path_action,
  }
}

function telaDisponivel(caminho: string): boolean {
  for (const tela of Object.values(TELAS_DE_ENCAMINHAMENTO)) {
    if (tela.caminho === caminho) return tela.disponivel
  }
  return false
}

function leituraDaRevisao(revisao: RevisaoCompleta): LeituraDaConversa {
  const dado = revisao.analysis
  if (!dado || typeof dado !== 'object' || Array.isArray(dado)) {
    return { resumo: '', tropecos: [], semResposta: [] }
  }
  const { resumo, tropecos, sem_resposta: semResposta } = dado as Record<string, unknown>
  return {
    resumo: typeof resumo === 'string' ? resumo : '',
    tropecos: Array.isArray(tropecos) ? tropecos.filter((item): item is string => typeof item === 'string') : [],
    semResposta: Array.isArray(semResposta) ? semResposta.filter((item): item is string => typeof item === 'string') : [],
  }
}

/**
 * O contexto das três conversas com o modelo: a transcrição e o roteiro com
 * que a Sarah falou, **mais** a configuração de agora e o que esta conta já
 * respondeu e aceitou. Sem os dois últimos, cada revisão lia o mesmo roteiro
 * publicado (o rascunho aplicado ainda não vai ao ar) sem saber de nenhuma
 * resposta anterior, e fazia as mesmas perguntas toda vez.
 */
async function montarContexto(
  chamada: ChamadaParaRevisar,
  proposito: Proposito,
  turnos: readonly TurnoDaConversa[],
  contaId: string,
  revisaoEmCurso: string | null,
  porta: PortaDaRevisao,
): Promise<ContextoDaRevisao> {
  const [atual, historico] = await Promise.all([
    porta.configuracaoAtual(contaId, proposito),
    porta.historicoDaConta(contaId, revisaoEmCurso),
  ])
  return {
    proposito,
    variante: varianteDoProposito(proposito),
    turnos,
    roteiro: chamada.body_script,
    jeitoDaCasa: chamada.body_house,
    motivoDoFim: chamada.end_reason,
    duracaoSeg: chamada.duration_sec,
    roteiroAtual: atual?.roteiro ?? null,
    jeitoDaCasaAtual: atual?.jeitoDaCasa ?? null,
    historico,
  }
}

/** A variante do propósito, pelo conjunto de ferramentas que a publicação leva. */
export function varianteDoProposito(proposito: Proposito): Variante {
  return escolherVariante(ferramentasDoProposito(proposito))
}

function lerProposito(valor: unknown): Proposito | null {
  return typeof valor === 'string' && (PROPOSITOS as readonly string[]).includes(valor)
    ? (valor as Proposito)
    : null
}

/** `calls.transcript` no formato de `call-finalize`, lido sem confiar na forma. */
export function lerTurnos(transcricao: unknown): TurnoDaConversa[] {
  if (!transcricao || typeof transcricao !== 'object') return []
  const lista = (transcricao as { turns?: unknown }).turns
  if (!Array.isArray(lista)) return []
  const turnos: TurnoDaConversa[] = []
  for (const item of lista) {
    if (!item || typeof item !== 'object') continue
    const { role, text } = item as { role?: unknown; text?: unknown }
    if ((role !== 'agent' && role !== 'lead') || typeof text !== 'string' || text.trim() === '') continue
    turnos.push({ quem: role, texto: text.trim() })
  }
  return turnos
}

// O modelo -------------------------------------------------------------------------

/**
 * Pergunta e registra a ida numa linha só. O que vai para a observabilidade é
 * o resumo: a conversa e o roteiro ficam em `calls` e em `playbook_versions`.
 */
async function perguntar(
  porta: PortaDaRevisao,
  contaId: string,
  chamadaId: string,
  etapa: string,
  texto: { sistema: string; mensagem: string; esquema: Readonly<Record<string, unknown>> },
  resumo: Readonly<Record<string, unknown>>,
): Promise<{ resposta: RespostaDoModelo; registrado: boolean }> {
  const resolvido = await porta.modeloDaConta(contaId)
  const pedido: PedidoAoModelo = {
    modelo: resolvido.modelo,
    porta: resolvido.porta,
    contaId,
    ...texto,
  }
  const resposta = await porta.perguntarAoModelo(pedido)

  let registrado = true
  try {
    await porta.registrarEventoDeIntegracao({
      account_id: contaId,
      direction: 'outbound',
      provider: PROVEDOR_DO_MODELO,
      endpoint: resposta.endpoint ?? 'v1/messages',
      request: {
        model: pedido.modelo,
        // A porta e a origem da escolha entram no registro: meses depois, "por
        // que esta conta gastou no OpenRouter?" se responde aqui, e não
        // cruzando a fatura com a tabela de configuração daquele dia.
        porta: resolvido.porta,
        modelo_da_conta: resolvido.escolhidoPelaConta,
        etapa,
        caracteres_do_pedido: pedido.mensagem.length,
        ...resumo,
      },
      response: {
        ok: resposta.ok,
        entrada: resposta.tokensDeEntrada ?? null,
        saida: resposta.tokensDeSaida ?? null,
        caracteres_da_resposta: resposta.texto?.length ?? null,
      },
      status_code: resposta.status ?? null,
      latency_ms: resposta.latenciaMs ?? null,
      correlation_id: chamadaId,
    })
  } catch {
    // Observabilidade perdida não derruba o passo; o corpo diz que faltou.
    registrado = false
  }

  return { resposta, registrado }
}

/**
 * Por que o modelo não respondeu. Credencial ausente não é indisponibilidade:
 * é configuração que falta, tem conserto numa tela, e dizer "tente de novo em
 * alguns minutos" mandaria a pessoa esperar por algo que nunca vai acontecer
 * sozinho.
 */
export function motivoDoModelo(resposta: RespostaDoModelo): MotivoDaRevisao {
  return resposta.codigo === 'sem_credencial' ? 'modelo_nao_conectado' : 'modelo_indisponivel'
}

function texto(valor: unknown): string | null {
  const limpo = typeof valor === 'string' ? valor.trim() : ''
  return limpo === '' ? null : limpo
}

function recusa(motivo: MotivoDaRevisao): RespostaDaRevisao {
  const caminho = CAMINHO_DA_RECUSA[motivo]
  return {
    status: STATUS[motivo],
    corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo], ...(caminho ? { caminho } : {}) },
  }
}

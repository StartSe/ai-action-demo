// call-diagnose: por que esta ligação terminou como terminou.
//
// O dono faz uma ligação de teste, a Sarah fala a primeira fala, ele responde
// "pode sim" e a ligação cai. O que explica isso mora na ElevenLabs da conta —
// o motivo do fim, o erro, as ferramentas chamadas, a configuração viva do
// agente — e ninguém lê lá. Esta borda lê, cruza com o que está gravado aqui e
// devolve três coisas: os achados das verificações determinísticas
// (`regras.ts`), a explicação do modelo da conta e propostas de correção em
// qualquer nível do agente (`propostas.ts`).
//
// **UMA AÇÃO SÓ, E ELA NÃO MUDA CONFIGURAÇÃO NENHUMA.** O que esta borda grava
// é `call_diagnoses`. Aplicar uma proposta é outro caminho, o RPC
// `aplicar_proposta_do_diagnostico`, chamado pela tela com a sessão de quem
// aprovou: é ele que grava pelo mesmo caminho da tela daquele nível e deixa o
// autor na trilha. E **nunca publica**: publicar continua sendo o botão de
// quem administra, oferecido depois de aplicar.
//
// **SEM MODELO, O DIAGNÓSTICO SAI MESMO ASSIM.** Os achados das regras e os
// registros da ElevenLabs são o que o dono mais precisa, e nenhum depende de
// modelo. Conta sem modelo conectado, modelo fora do ar ou resposta ilegível
// gravam o diagnóstico com `model_status` dizendo por que falta o texto — ao
// contrário de `call-review`, em que o modelo é o trabalho inteiro.
//
// **A CHAVE DA ELEVENLABS NUNCA SAI.** Ela é resolvida pela cascata de
// `_shared/secrets.ts`, usada nas três leituras e procurada no corpo
// serializado antes de responder (`conferirQueNaoVazou`). O que vai para
// `integration_events` é o resumo de cada ida — caminho, status, tempo —, e o
// texto mandado ao modelo vai sob `prompt`, que o gatilho de redação esconde.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import type { ModeloResolvido, Tarefa } from '../_shared/modelo/resolucao.ts'
import type { RespostaDoModelo } from '../_shared/modelo/pergunta.ts'
import { PROPOSITOS, type Proposito } from '../_shared/playbook/camada-um.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'

import {
  CAMINHO_DA_CONFIGURACAO_DAS_CONVERSAS,
  caminhoDaConversa,
  caminhoDoAgente,
  lerAgenteDoProvedor,
  lerConfiguracaoDasConversas,
  lerConversaDoProvedor,
  type AgenteLido,
  type ConfiguracaoDasConversasLida,
  type ConversaLida,
} from './formato-do-provedor.ts'
import { lerRespostaDoModelo, montarPedidoDoDiagnostico } from './pedido-ao-modelo.ts'
import { validarPropostas, type EstadoAtual, type Proposta, type ValorDoAlvo } from './propostas.ts'
import { verificar, type Achado, type FalhaDaLeitura, type FatosDoDiagnostico } from './regras.ts'
import {
  AVISOS_DO_MODELO,
  CAMINHO_DO_AVISO,
  MENSAGENS,
  PROPOSTA_DE_REPUBLICAR,
  STATUS,
  type EstadoDoModelo,
  type MotivoDoDiagnostico,
} from './respostas.ts'

/** A tarefa na tabela de `_shared/modelo/resolucao.ts`: ler conversa é revisão. */
export const TAREFA_DO_DIAGNOSTICO: Tarefa = 'review'

/** Como cada provedor aparece em `integration_events.provider`. */
export const PROVEDOR_DA_VOZ = 'voz'
export const PROVEDOR_DO_MODELO = 'modelo'

/** O provedor e a chave da ElevenLabs no cofre da conta. */
export const CREDENCIAL_DA_VOZ = { provedor: 'voz', chave: 'api_key' } as const

/** Quem pede o diagnóstico: o mesmo de `call-review`, porque ele propõe configuração. */
export const PAPEIS_QUE_DIAGNOSTICAM: ReadonlySet<string> = new Set(['owner', 'admin'])

export interface ChamadaParaDiagnosticar {
  readonly id: string
  readonly status: string
  readonly end_reason: string | null
  readonly direction: string
  readonly duration_sec: number | null
  readonly purpose: string
  readonly provider_conversation_id: string | null
}

export interface PublicacaoDoProposito {
  readonly provider_agent_id: string | null
  readonly status: string | null
}

/** O que está gravado aqui, para as propostas e para a divergência. */
export interface ConfiguracaoGravada {
  readonly estado: EstadoAtual
  readonly vozId: string | null
}

/** O que uma ida ao provedor de voz devolveu. Nunca levanta. */
export interface RespostaDaVoz {
  readonly ok: boolean
  readonly status: number | null
  readonly latenciaMs: number | null
  readonly corpo: unknown
}

export interface PedidoAoModelo {
  readonly modelo: string
  readonly porta: string
  readonly contaId: string
  readonly sistema: string
  readonly mensagem: string
  readonly esquema: Readonly<Record<string, unknown>>
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
  readonly correlation_id: string
}

/** Uma proposta como a coluna `call_diagnoses.proposals` a guarda. */
export interface PropostaGravada {
  readonly id: string
  readonly alvo: string
  readonly titulo: string
  readonly razao: string
  readonly antes: ValorDoAlvo
  readonly depois: ValorDoAlvo
  readonly origem: string
  readonly estado: 'pendente' | 'aplicada' | 'descartada'
  readonly decidida_por?: string | null
  readonly decidida_em?: string | null
  readonly versao_id?: string | null
}

/** O resumo do que a ElevenLabs disse, para a ficha mostrar sem reler o provedor. */
export interface ResumoDoProvedor {
  readonly conversa_id: string | null
  readonly agente_id: string | null
  readonly estado_da_conversa: string | null
  readonly motivo_do_fim: string | null
  readonly duracao_seg: number | null
  readonly idioma: string | null
  readonly llm: string | null
}

/** A linha de `call_diagnoses` que esta borda grava. */
export interface LinhaDoDiagnostico {
  readonly account_id: string
  readonly call_id: string
  readonly purpose: Proposito
  readonly findings: readonly Achado[]
  readonly cause: string | null
  readonly diagnosis: string | null
  readonly model_status: EstadoDoModelo
  readonly proposals: readonly PropostaGravada[]
  readonly provider_summary: ResumoDoProvedor
  readonly created_by: string
}

/** A linha relida, como a tela a recebe do banco. */
export interface DiagnosticoGravado extends LinhaDoDiagnostico {
  readonly id: string
  readonly created_at: string
}

export interface PortaDoDiagnostico {
  usuarioDaSessao(jwt: string): Promise<{ id: string } | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  lerChamada(contaId: string, chamadaId: string): Promise<ChamadaParaDiagnosticar | null>
  lerPublicacao(contaId: string, proposito: Proposito): Promise<PublicacaoDoProposito | null>
  lerConfiguracaoGravada(contaId: string): Promise<ConfiguracaoGravada>
  credencialDaVoz(contaId: string): Promise<ResolucaoDeSegredo>
  /** `GET` num caminho relativo a `/v1` do provedor de voz. Nunca levanta. */
  consultarVoz(caminho: string, chave: string): Promise<RespostaDaVoz>
  modeloDaConta(contaId: string): Promise<ModeloResolvido>
  /** Nunca levanta: falha de rede e recusa chegam como `ok: false`. */
  perguntarAoModelo(pedido: PedidoAoModelo): Promise<RespostaDoModelo>
  gravarDiagnostico(linha: LinhaDoDiagnostico): Promise<{ id: string; created_at: string }>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly autorizacao: string | null
  readonly contaId: unknown
  readonly chamadaId: unknown
}

/** Um achado como a tela o recebe. */
export type AchadoNaTela = Achado

/** Uma proposta como a tela a recebe. */
export interface PropostaNaTela {
  readonly id: string
  readonly alvo: string
  readonly titulo: string
  readonly razao: string
  readonly antes: ValorDoAlvo
  readonly depois: ValorDoAlvo
  readonly origem: string
  readonly estado: 'pendente' | 'aplicada' | 'descartada'
  readonly decididaEm: string | null
  readonly versaoId: string | null
}

export interface DiagnosticoNaTela {
  readonly id: string
  readonly chamadaId: string
  readonly proposito: string
  readonly criadoEm: string
  readonly achados: readonly AchadoNaTela[]
  readonly causaProvavel: string | null
  readonly diagnostico: string | null
  readonly estadoDoModelo: EstadoDoModelo
  /** A frase de por que o texto do modelo falta. Nula quando ele veio. */
  readonly avisoDoModelo: string | null
  readonly caminhoDoAviso: string | null
  readonly propostas: readonly PropostaNaTela[]
  readonly resumo: ResumoDoProvedor
}

export type CorpoDoDiagnostico =
  | { readonly ok: true; readonly diagnostico: DiagnosticoNaTela; readonly semRegistro: boolean }
  | { readonly ok: false; readonly motivo: MotivoDoDiagnostico; readonly mensagem: string }

export interface RespostaDoDiagnostico {
  readonly status: number
  readonly corpo: CorpoDoDiagnostico
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** Conduz o diagnóstico. Nunca levanta: exceção da porta vira `falha_interna`. */
export async function atenderDiagnostico(
  pedido: PedidoDaBorda,
  porta: PortaDoDiagnostico,
): Promise<RespostaDoDiagnostico> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = texto(pedido.contaId)
  if (!contaId) return recusa('conta_ausente')

  const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? '')?.[1]?.trim()
  if (!jwt) return recusa('sem_sessao')

  const chamadaId = texto(pedido.chamadaId)
  if (!chamadaId) return recusa('chamada_ausente')

  const segredos: string[] = []
  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')
    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (!PAPEIS_QUE_DIAGNOSTICAM.has(papel)) return recusa('papel_insuficiente')

    const chamada = await porta.lerChamada(contaId, chamadaId)
    if (!chamada) return recusa('chamada_inexistente')
    const proposito = lerProposito(chamada.purpose)
    if (!proposito) return recusa('falha_interna')

    const [publicacao, gravada] = await Promise.all([
      porta.lerPublicacao(contaId, proposito),
      porta.lerConfiguracaoGravada(contaId),
    ])

    const coleta = await coletarDoProvedor(porta, contaId, chamada, publicacao, segredos)
    const fatos: FatosDoDiagnostico = {
      chamada: {
        id: chamada.id,
        status: chamada.status,
        motivoDoFim: chamada.end_reason,
        direcao: chamada.direction,
        duracaoSeg: chamada.duration_sec,
        proposito,
      },
      publicacao: publicacao
        ? { agenteNoProvedor: publicacao.provider_agent_id, status: publicacao.status }
        : null,
      ...coleta,
      esperado: {
        vozId: gravada.vozId,
        duracaoMaximaSeg: gravada.estado.politica?.duracao_maxima ?? null,
      },
    }

    const achados = verificar(fatos)
    const modelo = await consultarModelo(porta, contaId, chamada.id, fatos, achados, gravada.estado)
    const propostas = [...modelo.propostas]
    const recusadas = modelo.recusadas.map(
      (recusada): Achado => ({
        codigo: 'proposta_recusada',
        severidade: 'info',
        titulo: `Uma sugestão do modelo ficou de fora${recusada.titulo ? `: ${recusada.titulo}` : '.'}`,
        evidencia: recusada.motivo,
        sugestao: 'Nada a fazer. A sugestão não passou pela conferência e não será aplicada.',
        alvo: null,
      }),
    )

    // As regras propõem sozinhas o que sabem corrigir sem texto novo: uma
    // publicação. O modelo pode já ter proposto; aí fica a dele.
    const pedemPublicacao = achados.filter((achado) => achado.alvo === 'republicar' && achado.severidade !== 'info')
    if (pedemPublicacao.length > 0 && !propostas.some((proposta) => proposta.alvo === 'republicar')) {
      propostas.push({
        id: `p${propostas.length + 1}`,
        alvo: 'republicar',
        titulo: PROPOSTA_DE_REPUBLICAR.titulo,
        razao: PROPOSTA_DE_REPUBLICAR.razao(pedemPublicacao.map((achado) => achado.titulo)),
        antes: null,
        depois: null,
        origem: 'regra',
      })
    }

    const linha: LinhaDoDiagnostico = {
      account_id: contaId,
      call_id: chamada.id,
      purpose: proposito,
      findings: [...achados, ...recusadas],
      cause: modelo.leitura?.causaProvavel ?? null,
      diagnosis: modelo.leitura?.diagnostico ?? null,
      model_status: modelo.estado,
      proposals: propostas.map(paraGravar),
      provider_summary: {
        conversa_id: chamada.provider_conversation_id,
        agente_id: coleta.conversa?.agenteId ?? publicacao?.provider_agent_id ?? null,
        estado_da_conversa: coleta.conversa?.status ?? null,
        motivo_do_fim: coleta.conversa?.motivoDoFim ?? null,
        duracao_seg: coleta.conversa?.duracaoSeg ?? null,
        idioma: coleta.agente?.idioma ?? null,
        llm: coleta.agente?.llm ?? null,
      },
      created_by: usuario.id,
    }

    // Conferido antes do banco também: a linha é lida por todo membro, e um
    // motivo de fim que ecoasse a chave a guardaria para sempre.
    conferirQueNaoVazou(linha, segredos, 'call-diagnose: a chave da conta apareceu no diagnóstico')
    const gravado = await porta.gravarDiagnostico(linha)
    const corpo: CorpoDoDiagnostico = {
      ok: true,
      diagnostico: paraTela({ ...linha, ...gravado }),
      semRegistro: !modelo.registrado || coleta.semRegistro,
    }
    conferirQueNaoVazou(corpo, segredos, 'call-diagnose: a chave da conta apareceu no corpo da resposta')
    return { status: 201, corpo }
  } catch {
    return recusa('falha_interna')
  }
}

// A coleta no provedor --------------------------------------------------------------

interface Coleta {
  readonly conversa: ConversaLida | null
  readonly falhaDaConversa: FalhaDaLeitura | null
  readonly agente: AgenteLido | null
  readonly falhaDoAgente: FalhaDaLeitura | null
  readonly configuracaoDasConversas: ConfiguracaoDasConversasLida | null
  readonly semRegistro: boolean
}

async function coletarDoProvedor(
  porta: PortaDoDiagnostico,
  contaId: string,
  chamada: ChamadaParaDiagnosticar,
  publicacao: PublicacaoDoProposito | null,
  segredos: string[],
): Promise<Coleta> {
  const credencial = await porta.credencialDaVoz(contaId)
  if (!credencial.ok) {
    return {
      conversa: null,
      falhaDaConversa: chamada.provider_conversation_id ? 'sem_chave' : 'sem_identificador',
      agente: null,
      falhaDoAgente: 'sem_chave',
      configuracaoDasConversas: null,
      semRegistro: false,
    }
  }
  const chave = credencial.valor
  segredos.push(chave)
  let semRegistro = false

  async function consultar(caminho: string, etapa: string): Promise<RespostaDaVoz> {
    const resposta = await porta.consultarVoz(caminho, chave)
    try {
      await porta.registrarEventoDeIntegracao({
        account_id: contaId,
        direction: 'outbound',
        provider: PROVEDOR_DA_VOZ,
        endpoint: caminho,
        request: { etapa, metodo: 'GET' },
        response: { ok: resposta.ok },
        status_code: resposta.status,
        latency_ms: resposta.latenciaMs,
        correlation_id: chamada.id,
      })
    } catch {
      semRegistro = true
    }
    return resposta
  }

  let conversa: ConversaLida | null = null
  let falhaDaConversa: FalhaDaLeitura | null = 'sem_identificador'
  if (chamada.provider_conversation_id) {
    const resposta = await consultar(caminhoDaConversa(chamada.provider_conversation_id), 'conversa')
    conversa = resposta.ok ? lerConversaDoProvedor(resposta.corpo) : null
    falhaDaConversa = conversa ? null : falhaDe(resposta)
  }

  // O agente que atendeu é o que a conversa diz, e não o que a publicação diz
  // hoje: se alguém republicou depois, a publicação aponta para outro.
  const agenteId = conversa?.agenteId ?? publicacao?.provider_agent_id ?? null
  let agente: AgenteLido | null = null
  let falhaDoAgente: FalhaDaLeitura | null = 'sem_identificador'
  if (agenteId) {
    const resposta = await consultar(caminhoDoAgente(agenteId), 'agente')
    agente = resposta.ok ? lerAgenteDoProvedor(resposta.corpo) : null
    falhaDoAgente = agente ? null : falhaDe(resposta)
  }

  const respostaDaConfiguracao = await consultar(CAMINHO_DA_CONFIGURACAO_DAS_CONVERSAS, 'configuracao_das_conversas')
  const configuracaoDasConversas = respostaDaConfiguracao.ok
    ? lerConfiguracaoDasConversas(respostaDaConfiguracao.corpo)
    : null

  return { conversa, falhaDaConversa, agente, falhaDoAgente, configuracaoDasConversas, semRegistro }
}

function falhaDe(resposta: RespostaDaVoz): FalhaDaLeitura {
  if (resposta.status === 404) return 'nao_encontrada'
  if (resposta.status === 401 || resposta.status === 403) return 'recusada'
  return 'indisponivel'
}

// O modelo -------------------------------------------------------------------------

interface ConsultaAoModelo {
  readonly estado: EstadoDoModelo
  readonly leitura: { causaProvavel: string; diagnostico: string } | null
  readonly propostas: readonly Proposta[]
  readonly recusadas: readonly { alvo: string; titulo: string; motivo: string }[]
  readonly registrado: boolean
}

async function consultarModelo(
  porta: PortaDoDiagnostico,
  contaId: string,
  chamadaId: string,
  fatos: FatosDoDiagnostico,
  achados: readonly Achado[],
  estado: EstadoAtual,
): Promise<ConsultaAoModelo> {
  const resolvido = await porta.modeloDaConta(contaId)
  const texto = montarPedidoDoDiagnostico(fatos, achados, estado)
  const pedido: PedidoAoModelo = { modelo: resolvido.modelo, porta: resolvido.porta, contaId, ...texto }
  const resposta = await porta.perguntarAoModelo(pedido)

  let registrado = true
  try {
    await porta.registrarEventoDeIntegracao({
      account_id: contaId,
      direction: 'outbound',
      provider: PROVEDOR_DO_MODELO,
      endpoint: resposta.endpoint ?? 'api/v1/chat/completions',
      request: {
        model: pedido.modelo,
        porta: resolvido.porta,
        modelo_da_conta: resolvido.escolhidoPelaConta,
        etapa: 'diagnostico',
        // O pedido inteiro, com a transcrição, só sob `prompt`: é a chave que
        // o gatilho de redação troca por `[redigido]`.
        prompt: pedido.mensagem,
        achados: achados.length,
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
    registrado = false
  }

  if (!resposta.ok || typeof resposta.texto !== 'string') {
    return {
      estado: resposta.codigo === 'sem_credencial' ? 'nao_conectado' : 'indisponivel',
      leitura: null,
      propostas: [],
      recusadas: [],
      registrado,
    }
  }
  const leitura = lerRespostaDoModelo(resposta.texto)
  if (!leitura) return { estado: 'ilegivel', leitura: null, propostas: [], recusadas: [], registrado }

  const { aceitas, recusadas } = validarPropostas(leitura.propostas, estado)
  return {
    estado: 'ok',
    leitura: { causaProvavel: leitura.causaProvavel, diagnostico: leitura.diagnostico },
    propostas: aceitas,
    recusadas,
    registrado,
  }
}

// Tradução -------------------------------------------------------------------------

function paraGravar(proposta: Proposta): PropostaGravada {
  return {
    id: proposta.id,
    alvo: proposta.alvo,
    titulo: proposta.titulo,
    razao: proposta.razao,
    antes: proposta.antes,
    depois: proposta.depois,
    origem: proposta.origem,
    estado: 'pendente',
  }
}

/**
 * A linha gravada, como a tela a lê. Exportada porque a interface lê a mesma
 * linha do banco depois, e ler de dois jeitos faria a ficha recarregada
 * mostrar outra coisa.
 */
export function paraTela(linha: {
  readonly id: string
  readonly call_id: string
  readonly purpose: string
  readonly created_at: string
  readonly findings: unknown
  readonly cause: string | null
  readonly diagnosis: string | null
  readonly model_status: string
  readonly proposals: unknown
  readonly provider_summary: unknown
}): DiagnosticoNaTela {
  const estado = lerEstadoDoModelo(linha.model_status)
  return {
    id: linha.id,
    chamadaId: linha.call_id,
    proposito: linha.purpose,
    criadoEm: linha.created_at,
    achados: Array.isArray(linha.findings) ? (linha.findings as AchadoNaTela[]) : [],
    causaProvavel: linha.cause,
    diagnostico: linha.diagnosis,
    estadoDoModelo: estado,
    avisoDoModelo: estado === 'ok' ? null : AVISOS_DO_MODELO[estado],
    caminhoDoAviso: CAMINHO_DO_AVISO[estado] ?? null,
    propostas: Array.isArray(linha.proposals)
      ? (linha.proposals as PropostaGravada[]).map((proposta) => ({
          id: proposta.id,
          alvo: proposta.alvo,
          titulo: proposta.titulo,
          razao: proposta.razao,
          antes: proposta.antes ?? null,
          depois: proposta.depois ?? null,
          origem: proposta.origem,
          estado: proposta.estado,
          decididaEm: proposta.decidida_em ?? null,
          versaoId: proposta.versao_id ?? null,
        }))
      : [],
    resumo: lerResumo(linha.provider_summary),
  }
}

function lerEstadoDoModelo(valor: string): EstadoDoModelo {
  return valor === 'ok' || valor === 'nao_conectado' || valor === 'indisponivel' || valor === 'ilegivel'
    ? valor
    : 'indisponivel'
}

function lerResumo(valor: unknown): ResumoDoProvedor {
  const cru = (typeof valor === 'object' && valor !== null ? valor : {}) as Record<string, unknown>
  const textoOuNulo = (item: unknown) => (typeof item === 'string' ? item : null)
  return {
    conversa_id: textoOuNulo(cru.conversa_id),
    agente_id: textoOuNulo(cru.agente_id),
    estado_da_conversa: textoOuNulo(cru.estado_da_conversa),
    motivo_do_fim: textoOuNulo(cru.motivo_do_fim),
    duracao_seg: typeof cru.duracao_seg === 'number' ? cru.duracao_seg : null,
    idioma: textoOuNulo(cru.idioma),
    llm: textoOuNulo(cru.llm),
  }
}

function lerProposito(valor: unknown): Proposito | null {
  return typeof valor === 'string' && (PROPOSITOS as readonly string[]).includes(valor)
    ? (valor as Proposito)
    : null
}

function texto(valor: unknown): string | null {
  const limpo = typeof valor === 'string' ? valor.trim() : ''
  return limpo === '' ? null : limpo
}

function recusa(motivo: MotivoDoDiagnostico): RespostaDoDiagnostico {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}

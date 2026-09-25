// onboarding-suggest: as primeiras sugestões da configuração, a partir do
// contexto do negócio.
//
// No assistente de abertura, depois de conectar modelo, voz e telefonia, a
// pessoa conta o negócio em três respostas curtas. Esta função pede ao modelo,
// para cada etapa seguinte da configuração, os valores sugeridos dos campos e
// as perguntas que ainda faltam para preencher bem cada uma. A tela mostra as
// duas coisas para revisão.
//
// **NÃO GRAVA NADA.** A resposta vai para a tela e só. Quem aplica uma sugestão
// é a pessoa, pela tela da etapa, com o mesmo serviço de sempre: texto que a
// Sarah vai falar não entra na conta sem alguém ter lido (RF-307).
//
// **O QUE VOLTA É CONFERIDO ITEM A ITEM.** Etapa desconhecida some, campo
// desconhecido some, texto acima do teto some, e a primeira fala com marcador
// que o compilador não conhece perde o campo. Um item torto não derruba os
// outros; resposta sem nenhum item aproveitável é `resposta_ilegivel`. O
// roteiro passa pelo crivo de promessa de horário (O-06): enquanto a descoberta
// não tiver agenda, sugestão que oferece horário é descartada.
//
// **O CONTEXTO NÃO FICA EM CLARO NA OBSERVABILIDADE.** Como em `playbook-draft`,
// o texto enviado viaja sob a chave `prompt`, que o gatilho de
// `integration_events` troca por `[redigido]`.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { MARCADORES_DA_PRIMEIRA_FALA } from '../_shared/agente/primeira-fala.ts'
import { prometeHorario } from '../_shared/agente/rascunho-de-roteiro.ts'
import type { ModeloResolvido, Tarefa } from '../_shared/modelo/resolucao.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'

import { MENSAGENS, STATUS, type MotivoDaSugestao } from './respostas.ts'

/** Escrever sugestão é redação, como o roteiro: a tarefa `draft` da conta. */
export const TAREFA_DA_SUGESTAO: Tarefa = 'draft'

export const PROVEDOR_DO_MODELO = 'modelo'

export const PAPEIS_QUE_CONFIGURAM: ReadonlySet<string> = new Set(['owner', 'admin'])

/**
 * As três respostas do contexto e o tamanho aceito de cada uma. A descrição é
 * a única obrigatória com mínimo: sem ela o modelo inventa o negócio.
 */
export const LIMITES_DO_CONTEXTO = {
  empresa: { minimo: 2, maximo: 120 },
  descricao: { minimo: 40, maximo: 2_000 },
  bomCliente: { minimo: 0, maximo: 1_000 },
} as const

/**
 * As etapas que recebem sugestão, com os campos que cada uma aceita. É a
 * lista fechada: o que o modelo devolver fora dela não chega à tela.
 */
export const CAMPOS_DAS_ETAPAS = {
  // A empresa vem primeiro: sem ela a Sarah não se grava, e pela conversa é
  // daqui que ela sai, porque não há formulário.
  identidade: ['empresa', 'nome_do_agente', 'oferta', 'primeira_fala', 'nunca_afirmar'],
  roteiro: ['roteiro_de_descoberta'],
  especialista: ['modalidade', 'duracao_em_minutos'],
  // A lista de leads é da empresa: não há o que sugerir sobre de onde vêm.
  leads: ['perfil_do_lead'],
} as const

export type Etapa = keyof typeof CAMPOS_DAS_ETAPAS
export const ETAPAS = Object.keys(CAMPOS_DAS_ETAPAS) as Etapa[]

/** Teto de cada valor sugerido, em caracteres. O roteiro é o maior. */
const TETO_DO_VALOR: Record<string, number> = { roteiro_de_descoberta: 6_000 }
const TETO_PADRAO = 600
const TETO_DA_PERGUNTA = 240
const PERGUNTAS_POR_ETAPA = 4

export interface ContextoDoNegocio {
  readonly empresa: string
  readonly descricao: string
  readonly bomCliente: string
}

export interface CampoSugerido {
  readonly campo: string
  readonly valor: string
  /** Uma linha dizendo por que este valor, para quem revisa. */
  readonly porque: string
}

export interface PerguntaDaEtapa {
  readonly pergunta: string
  /** Um exemplo de resposta, que a tela mostra como marcador do campo. */
  readonly exemplo: string
}

export interface SugestaoDaEtapa {
  readonly etapa: Etapa
  readonly campos: readonly CampoSugerido[]
  readonly perguntas: readonly PerguntaDaEtapa[]
}

export interface PedidoAoModelo {
  readonly modelo: string
  readonly porta: string
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

export interface EventoDeIntegracao {
  readonly account_id: string
  readonly direction: 'outbound'
  readonly provider: string
  readonly endpoint: string
  readonly request: Readonly<Record<string, unknown>>
  readonly response: Readonly<Record<string, unknown>>
  readonly status_code: number | null
  readonly latency_ms: number | null
  readonly correlation_id: null
}

/** A camada de dados e o modelo. Não há método que grave configuração. */
export interface PortaDaSugestao {
  usuarioDaSessao(jwt: string): Promise<{ readonly id: string } | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  modeloDaConta(contaId: string): Promise<ModeloResolvido>
  /** Nunca levanta: falha de rede e recusa chegam como `ok: false`. */
  perguntarAoModelo(pedido: PedidoAoModelo): Promise<RespostaDoModelo>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
  /**
   * O nome que a conta deu à assistente (`agents.name`), ou nulo antes de
   * escolhido. É a primeira pergunta do tutorial: com ele gravado, a sugestão
   * não propõe outro.
   */
  nomeDoAgente(contaId: string): Promise<string | null>
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly autorizacao: string | null
  readonly contaId: unknown
  readonly contexto: unknown
}

export type RespostaDaSugestao = {
  readonly status: number
  readonly corpo:
    | {
        readonly ok: true
        readonly etapas: readonly SugestaoDaEtapa[]
        readonly semRegistro: boolean
      }
    | { readonly ok: false; readonly motivo: MotivoDaSugestao; readonly mensagem: string }
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

export async function atenderSugestao(
  pedido: PedidoDaBorda,
  porta: PortaDaSugestao,
): Promise<RespostaDaSugestao> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = typeof pedido.contaId === 'string' ? pedido.contaId.trim() : ''
  if (!contaId) return recusa('conta_ausente')

  const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? '')?.[1]?.trim()
  if (!jwt) return recusa('sem_sessao')

  const contexto = lerContexto(pedido.contexto)
  if (typeof contexto === 'string') return recusa(contexto)

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (!PAPEIS_QUE_CONFIGURAM.has(papel)) return recusa('papel_insuficiente')

    return await sugerir(contaId, contexto, porta)
  } catch {
    return recusa('falha_interna')
  }
}

/** O contexto conferido, ou o motivo da recusa. */
export function lerContexto(valor: unknown): ContextoDoNegocio | MotivoDaSugestao {
  const dado = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {}
  const texto = (chave: string) =>
    typeof dado[chave] === 'string' ? (dado[chave] as string).trim() : ''

  const contexto = {
    empresa: texto('empresa'),
    descricao: texto('descricao'),
    bomCliente: texto('bomCliente'),
  }
  for (const [chave, limite] of Object.entries(LIMITES_DO_CONTEXTO)) {
    const tamanho = contexto[chave as keyof ContextoDoNegocio].length
    if (tamanho < limite.minimo) return 'contexto_curto'
    if (tamanho > limite.maximo) return 'contexto_longo'
  }
  return contexto
}

/** O JSON Schema que o modelo segue. */
export const ESQUEMA_DAS_SUGESTOES: Readonly<Record<string, unknown>> = {
  type: 'object',
  additionalProperties: false,
  required: ['etapas'],
  properties: {
    etapas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['etapa', 'campos', 'perguntas'],
        properties: {
          etapa: { type: 'string', enum: ETAPAS },
          campos: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['campo', 'valor', 'porque'],
              properties: {
                campo: { type: 'string' },
                valor: { type: 'string' },
                porque: { type: 'string' },
              },
            },
          },
          perguntas: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['pergunta', 'exemplo'],
              properties: {
                pergunta: { type: 'string' },
                exemplo: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
}

/** O pedido ao modelo: o sistema fixa as regras, a mensagem traz o negócio. */
export function montarPedido(
  contexto: ContextoDoNegocio,
  nomeDoAgente: string | null = null,
): {
  sistema: string
  mensagem: string
} {
  const mensagem = [
    `Empresa: ${contexto.empresa}`,
    `O que vende e para quem: ${contexto.descricao}`,
    contexto.bomCliente ? `O que faz alguém ser um bom cliente: ${contexto.bomCliente}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return { sistema: sistemaDasSugestoes(nomeDoAgente), mensagem }
}

/**
 * O nome gravado, pronto para entrar no pedido: uma linha só e curto. É texto
 * que a própria conta escreveu, e o teto impede que ele vire instrução.
 */
export function nomeParaOPedido(nome: string | null | undefined): string | null {
  const limpo = nome?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? ''
  return limpo === '' ? null : limpo
}

/** Os campos que o modelo sugere: sem o nome quando a conta já o escolheu. */
export function camposPedidos(etapa: Etapa, nomeDoAgente: string | null): readonly string[] {
  const campos: readonly string[] = CAMPOS_DAS_ETAPAS[etapa]
  return nomeParaOPedido(nomeDoAgente) ? campos.filter((campo) => campo !== 'nome_do_agente') : campos
}

/** As regras do pedido, que valem para o negócio escrito e para a conversa. */
export function sistemaDasSugestoes(nomeDoAgente: string | null = null): string {
  const nome = nomeParaOPedido(nomeDoAgente)
  const campos = ETAPAS.map(
    (etapa) => `- ${etapa}: ${camposPedidos(etapa, nome).join(', ')}`,
  ).join('\n')

  return [
    nome
      ? `Você ajuda a configurar a assistente virtual com IA que liga para leads, qualifica e marca reunião com um especialista humano. O nome dela já foi escolhido pela empresa: ${nome}. Não sugira outro nome.`
      : 'Você ajuda a configurar a assistente virtual com IA que liga para leads, qualifica e marca reunião com um especialista humano.',
    'Escreva em português do Brasil, com acentuação correta.',
    'Para cada etapa abaixo, sugira o valor de cada campo e escreva de duas a quatro perguntas curtas que a pessoa precisa responder para a etapa ficar boa, cada uma com um exemplo de resposta.',
    `Etapas e campos:\n${campos}`,
    `Na primeira_fala, a assistente se apresenta como assistente virtual da empresa e pode usar só estes marcadores entre chaves: ${MARCADORES_DA_PRIMEIRA_FALA.map((m) => `{${m}}`).join(', ')}. O nome dela entra por {nome_do_agente}, nunca escrito por extenso.`,
    'O roteiro_de_descoberta é o que a assistente segue na ligação: perguntas de qualificação em ordem, como tratar objeções comuns e quando encerrar. Ele não pode oferecer nem combinar horário de reunião: a assistente ainda não tem acesso à agenda.',
    'empresa é o nome da empresa como o cliente a conhece, e é obrigatório: se ninguém disse, use o nome que aparecer no texto e transforme a dúvida numa pergunta.',
    'nunca_afirmar lista, separado por vírgula, o que a assistente não pode prometer.',
    'Em cada campo, porque diz em uma frase por que aquele valor serve a este negócio.',
    'Não invente fato sobre a empresa que o texto não diga; quando faltar informação, transforme a lacuna numa pergunta.',
    'A lista de leads é entregue pela empresa, já escolhida: a assistente não seleciona nem filtra contatos. Nenhuma pergunta pode ser sobre que tipo de empresa ou de pessoa evitar, como escolher para quem ligar ou de onde vêm os contatos. Em leads, pergunte só o que ajuda a assistente a conversar com eles, como o cargo de quem atende ou o momento em que o contato chega.',
  ].join('\n\n')
}

async function sugerir(
  contaId: string,
  contexto: ContextoDoNegocio,
  porta: PortaDaSugestao,
): Promise<RespostaDaSugestao> {
  const nome = nomeParaOPedido(await porta.nomeDoAgente(contaId))
  return await sugerirAPartirDe(
    contaId,
    montarPedido(contexto, nome),
    porta,
    {
      finalidade: 'sugestoes_iniciais',
      caracteres_do_contexto: contexto.descricao.length + contexto.bomCliente.length,
    },
    nome,
  )
}

/**
 * Pede ao modelo e confere a resposta. É a metade comum a quem traz o negócio
 * escrito (`montarPedido`) e a quem o traz numa conversa com a assistente
 * (`onboarding-interview`): muda o texto do pedido, e o resto é o mesmo.
 * `resumo` entra no rastro ao lado do modelo, e nunca carrega o texto em si.
 */
export async function sugerirAPartirDe(
  contaId: string,
  texto: { sistema: string; mensagem: string },
  porta: Pick<PortaDaSugestao, 'modeloDaConta' | 'perguntarAoModelo' | 'registrarEventoDeIntegracao'>,
  resumo: Readonly<Record<string, string | number>>,
  /** O nome já gravado: a sugestão de nome que o modelo mandar mesmo assim sai. */
  nomeDoAgente: string | null = null,
): Promise<RespostaDaSugestao> {
  const resolvido = await porta.modeloDaConta(contaId)
  const pedido: PedidoAoModelo = {
    modelo: resolvido.modelo,
    porta: resolvido.porta,
    contaId,
    ...texto,
    esquema: ESQUEMA_DAS_SUGESTOES,
  }

  const resposta = await porta.perguntarAoModelo(pedido)
  const lidas = resposta.ok && typeof resposta.texto === 'string' ? lerSugestoes(resposta.texto) : null
  const etapas = lidas && nomeParaOPedido(nomeDoAgente) ? semNomeDoAgente(lidas) : lidas

  const registrado = await rastrear(porta, {
    account_id: contaId,
    direction: 'outbound',
    provider: PROVEDOR_DO_MODELO,
    endpoint: resposta.endpoint ?? 'v1/messages',
    request: {
      model: pedido.modelo,
      porta: resolvido.porta,
      modelo_da_conta: resolvido.escolhidoPelaConta,
      ...resumo,
      // Redigido pelo gatilho de `integration_events`: o nome da chave é o que
      // o casa.
      prompt: pedido.mensagem,
    },
    response: {
      ok: resposta.ok,
      entrada: resposta.tokensDeEntrada ?? null,
      saida: resposta.tokensDeSaida ?? null,
      etapas: etapas?.length ?? null,
    },
    status_code: resposta.status ?? null,
    latency_ms: resposta.latenciaMs ?? null,
    correlation_id: null,
  })

  if (!resposta.ok || typeof resposta.texto !== 'string') {
    return recusa(
      resposta.codigo === 'sem_credencial' ? 'modelo_nao_conectado' : 'modelo_indisponivel',
    )
  }
  if (!etapas || etapas.length === 0) return recusa('resposta_ilegivel')

  return { status: 200, corpo: { ok: true, etapas, semRegistro: !registrado } }
}

/**
 * As sugestões conferidas, na ordem de `ETAPAS`, ou nulo quando o texto não é
 * o JSON combinado. Item torto some sozinho; os outros ficam.
 */
export function lerSugestoes(texto: string): SugestaoDaEtapa[] | null {
  let dado: unknown
  try {
    dado = JSON.parse(texto)
  } catch {
    return null
  }
  const lista = (dado as { etapas?: unknown } | null)?.etapas
  if (!Array.isArray(lista)) return null

  const porEtapa = new Map<Etapa, SugestaoDaEtapa>()
  for (const item of lista) {
    const lida = lerEtapa(item)
    // A primeira de cada etapa vale: a repetida é o modelo se contradizendo.
    if (lida && !porEtapa.has(lida.etapa)) porEtapa.set(lida.etapa, lida)
  }
  return ETAPAS.flatMap((etapa) => porEtapa.get(etapa) ?? [])
}

function lerEtapa(item: unknown): SugestaoDaEtapa | null {
  if (!item || typeof item !== 'object') return null
  const { etapa, campos, perguntas } = item as Record<string, unknown>
  if (typeof etapa !== 'string' || !(etapa in CAMPOS_DAS_ETAPAS)) return null
  const chave = etapa as Etapa
  const aceitos: readonly string[] = CAMPOS_DAS_ETAPAS[chave]

  const camposLidos: CampoSugerido[] = []
  for (const campo of Array.isArray(campos) ? campos : []) {
    const lido = lerCampo(campo, aceitos)
    if (lido && !camposLidos.some((outro) => outro.campo === lido.campo)) camposLidos.push(lido)
  }

  const perguntasLidas: PerguntaDaEtapa[] = []
  for (const pergunta of Array.isArray(perguntas) ? perguntas : []) {
    if (perguntasLidas.length === PERGUNTAS_POR_ETAPA) break
    const lida = lerPergunta(pergunta)
    if (lida) perguntasLidas.push(lida)
  }

  if (camposLidos.length === 0 && perguntasLidas.length === 0) return null
  return { etapa: chave, campos: camposLidos, perguntas: perguntasLidas }
}

function lerCampo(item: unknown, aceitos: readonly string[]): CampoSugerido | null {
  if (!item || typeof item !== 'object') return null
  const { campo, valor, porque } = item as Record<string, unknown>
  if (typeof campo !== 'string' || !aceitos.includes(campo)) return null
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  if (limpo === '' || limpo.length > (TETO_DO_VALOR[campo] ?? TETO_PADRAO)) return null

  if (campo === 'primeira_fala' && !marcadoresConhecidos(limpo)) return null
  if (campo === 'roteiro_de_descoberta' && prometeHorario(limpo)) return null

  return {
    campo,
    valor: limpo,
    porque: typeof porque === 'string' ? porque.trim().slice(0, TETO_PADRAO) : '',
  }
}

function lerPergunta(item: unknown): PerguntaDaEtapa | null {
  if (!item || typeof item !== 'object') return null
  const { pergunta, exemplo } = item as Record<string, unknown>
  if (typeof pergunta !== 'string') return null
  const limpa = pergunta.trim()
  if (limpa === '' || limpa.length > TETO_DA_PERGUNTA) return null
  return {
    pergunta: limpa,
    exemplo: typeof exemplo === 'string' ? exemplo.trim().slice(0, TETO_DA_PERGUNTA) : '',
  }
}

/**
 * As sugestões sem o campo do nome. A conta escolheu o nome na primeira
 * pergunta do tutorial, e a revisão mostraria o palpite do modelo por cima da
 * escolha dela. Etapa que fica vazia sai.
 */
export function semNomeDoAgente(etapas: readonly SugestaoDaEtapa[]): SugestaoDaEtapa[] {
  return etapas.flatMap((etapa) => {
    const campos = etapa.campos.filter((campo) => campo.campo !== 'nome_do_agente')
    return campos.length === 0 && etapa.perguntas.length === 0 ? [] : [{ ...etapa, campos }]
  })
}

/** Todo `{marcador}` do texto é um que a primeira fala aceita. */
export function marcadoresConhecidos(texto: string): boolean {
  return [...texto.matchAll(/\{([^{}]*)\}/g)].every((casada) =>
    MARCADORES_DA_PRIMEIRA_FALA.includes(casada[1] ?? ''),
  )
}

async function rastrear(
  porta: Pick<PortaDaSugestao, 'registrarEventoDeIntegracao'>,
  evento: EventoDeIntegracao,
): Promise<boolean> {
  try {
    await porta.registrarEventoDeIntegracao(evento)
    return true
  } catch {
    return false
  }
}

function recusa(motivo: MotivoDaSugestao): RespostaDaSugestao {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}

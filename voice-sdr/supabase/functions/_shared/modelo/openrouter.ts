// O contrato do OpenRouter (US-246), na parte que independe de plataforma.
//
// Duas conversas com o provedor moram aqui: o OAuth, que troca um código por
// uma chave de conta, e a conversa com o modelo, que é o formato de chat da
// OpenAI. Nenhuma das duas faz rede: o que este módulo produz é a URL, o corpo
// e o leitor da resposta, e quem busca é o adaptador.
//
// **O ESTADO VIAJA POR DOIS CAMINHOS, E ISSO É DE PROPÓSITO.** O provedor
// documenta `callback_url`, `code_challenge` e `code_challenge_method`, e não
// documenta `state`; um anúncio dele diz que `state` passou a ser aceito. Diante
// da dúvida, a ida manda o estado como `state` **e** embutido na query do
// próprio `callback_url`, e a volta aceita o que chegar. Apostar num só deixaria
// o fluxo quebrado em metade dos mundos possíveis, e o erro apareceria só em
// ambiente real — que é justamente onde a escada não olha.
//
// **A VOLTA SEM ESTADO É RECUSADA.** Sem ele não há como saber de qual conta é
// aquele código, e adivinhar pela sessão do navegador seria aceitar que outra
// aba, de outra conta, complete a autorização desta.
//
// **O `max_tokens` DO PEDIDO É O TETO DE SAÍDA, NÃO O DA JANELA.** Modelo que
// devolve menos do que o esquema pede vira resposta ilegível, e é o crivo de
// quem chamou que a recusa — não este módulo.
//
// Módulo portável: sem `Deno`, sem import de rede.

/** Como o provedor aparece no cofre (`account_secrets.provider`) e nos eventos. */
export const PROVEDOR = 'openrouter'

/** A chave no cofre. A conta tem uma só: a que o OAuth produziu. */
export const CHAVE_NO_COFRE = 'api_key'

export const URL_DE_AUTORIZACAO = 'https://openrouter.ai/auth'
export const URL_DA_TROCA = 'https://openrouter.ai/api/v1/auth/keys'
export const URL_DA_CONVERSA = 'https://openrouter.ai/api/v1/chat/completions'
export const URL_DOS_MODELOS = 'https://openrouter.ai/api/v1/models'

/** O nome do parâmetro do estado, na query do retorno e na ida. */
export const PARAMETRO_DO_ESTADO = 'state'

export interface PedidoDeAutorizacao {
  /** Para onde o provedor devolve, sem query nenhuma. */
  readonly callbackUrl: string
  readonly desafio: string
  readonly metodoDoDesafio: string
  readonly estado: string
  /** O rótulo que a chave recebe no painel do provedor. */
  readonly rotuloDaChave: string
}

/**
 * A URL para onde mandar quem autoriza. O estado entra duas vezes: ver o
 * cabeçalho.
 */
export function montarUrlDeAutorizacao(pedido: PedidoDeAutorizacao): string {
  const retorno = new URL(pedido.callbackUrl)
  retorno.searchParams.set(PARAMETRO_DO_ESTADO, pedido.estado)

  const url = new URL(URL_DE_AUTORIZACAO)
  url.searchParams.set('callback_url', retorno.toString())
  url.searchParams.set('code_challenge', pedido.desafio)
  url.searchParams.set('code_challenge_method', pedido.metodoDoDesafio)
  url.searchParams.set('key_label', pedido.rotuloDaChave)
  url.searchParams.set(PARAMETRO_DO_ESTADO, pedido.estado)
  return url.toString()
}

/** O estado da volta, venha ele como `state` ou na query do retorno. */
export function lerEstadoDaVolta(parametros: {
  readonly state?: unknown
  readonly callbackQuery?: unknown
}): string | null {
  const direto = typeof parametros.state === 'string' ? parametros.state.trim() : ''
  if (direto !== '') return direto
  const daQuery = typeof parametros.callbackQuery === 'string' ? parametros.callbackQuery.trim() : ''
  return daQuery === '' ? null : daQuery
}

/** O corpo da troca do código por chave. */
export function corpoDaTroca(codigo: string, verifier: string, metodo: string) {
  return { code: codigo, code_verifier: verifier, code_challenge_method: metodo }
}

/**
 * A chave que a troca devolveu, ou nula quando o corpo não é o combinado. O
 * provedor responde `{ "key": "..." }`; qualquer outra coisa é recusa, e
 * inventar uma chave a partir de um corpo estranho gravaria lixo no Vault.
 */
export function lerChaveDaTroca(dado: unknown): string | null {
  if (!dado || typeof dado !== 'object' || Array.isArray(dado)) return null
  const chave = (dado as { key?: unknown }).key
  if (typeof chave !== 'string') return null
  const limpa = chave.trim()
  return limpa === '' ? null : limpa
}

/** O que dá para mostrar na tela sobre a chave, sem mostrar a chave. */
export function resumoDaChave(chave: string): Record<string, unknown> {
  return {
    // Os últimos quatro, como o cofre já faz com as outras credenciais. O
    // suficiente para alguém reconhecer qual chave é, e insuficiente para usá-la.
    final: chave.slice(-4),
    caracteres: chave.length,
  }
}

// A conversa com o modelo ------------------------------------------------------------

export interface PedidoDeConversa {
  readonly modelo: string
  readonly sistema: string
  readonly mensagem: string
  readonly esquema: Readonly<Record<string, unknown>>
  readonly maxTokens: number
  /** Como a aplicação se identifica no painel do provedor. */
  readonly aplicacao?: { readonly url?: string; readonly nome?: string }
}

/**
 * O corpo do chat, no formato da OpenAI que o provedor normaliza. O esquema vai
 * em `response_format` com `strict`, que é o que faz o modelo devolver
 * exatamente a forma pedida em vez de JSON parecido.
 */
export function corpoDaConversa(pedido: PedidoDeConversa): Record<string, unknown> {
  return {
    model: pedido.modelo,
    max_tokens: pedido.maxTokens,
    messages: [
      { role: 'system', content: pedido.sistema },
      { role: 'user', content: pedido.mensagem },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'resposta', strict: true, schema: pedido.esquema },
    },
  }
}

/** Os cabeçalhos da conversa. A identificação da aplicação é opcional. */
export function cabecalhosDaConversa(
  chave: string,
  aplicacao?: { readonly url?: string; readonly nome?: string },
): Record<string, string> {
  const cabecalhos: Record<string, string> = {
    authorization: `Bearer ${chave}`,
    'content-type': 'application/json',
  }
  if (aplicacao?.url) cabecalhos['http-referer'] = aplicacao.url
  if (aplicacao?.nome) cabecalhos['x-title'] = aplicacao.nome
  return cabecalhos
}

export interface LeituraDaConversa {
  readonly texto: string | null
  readonly tokensDeEntrada: number | null
  readonly tokensDeSaida: number | null
  /** `stop`, `length`, `content_filter`, `error` ou `tool_calls`. */
  readonly motivoDoFim: string | null
  /** O modelo que de fato atendeu, que pode não ser o pedido. */
  readonly modelo: string | null
}

/**
 * O que a conversa devolveu, lido sem confiar na forma.
 *
 * `motivoDoFim` importa tanto quanto o texto: `length` quer dizer que a
 * resposta foi cortada no meio, e um JSON cortado não faz o parse — quem chama
 * recusa por resposta ilegível, que é a verdade.
 */
export function lerConversa(dado: unknown): LeituraDaConversa {
  const vazia: LeituraDaConversa = {
    texto: null,
    tokensDeEntrada: null,
    tokensDeSaida: null,
    motivoDoFim: null,
    modelo: null,
  }
  if (!dado || typeof dado !== 'object' || Array.isArray(dado)) return vazia

  const corpo = dado as Record<string, unknown>
  const escolhas = Array.isArray(corpo.choices) ? corpo.choices : []
  const primeira = escolhas[0]
  const mensagem =
    primeira && typeof primeira === 'object'
      ? (primeira as { message?: unknown }).message
      : null
  const conteudo =
    mensagem && typeof mensagem === 'object'
      ? (mensagem as { content?: unknown }).content
      : null

  const uso = corpo.usage && typeof corpo.usage === 'object' ? (corpo.usage as Record<string, unknown>) : {}

  return {
    texto: typeof conteudo === 'string' && conteudo.trim() !== '' ? conteudo : null,
    tokensDeEntrada: numero(uso.prompt_tokens),
    tokensDeSaida: numero(uso.completion_tokens),
    motivoDoFim:
      primeira && typeof primeira === 'object'
        ? textoOuNulo((primeira as { finish_reason?: unknown }).finish_reason)
        : null,
    modelo: textoOuNulo(corpo.model),
  }
}

/** Um modelo do catálogo, na parte que a tela de escolha usa. */
export interface ModeloDoCatalogo {
  readonly id: string
  readonly nome: string
  /** Quantos tokens cabem na janela, quando o provedor diz. */
  readonly contexto: number | null
  /** Preço por milhão de tokens, em dólares, como texto do provedor. */
  readonly precoDeEntrada: string | null
  readonly precoDeSaida: string | null
  /**
   * `architecture.input_modalities`: o que o modelo aceita na entrada (`text`,
   * `image`, `audio`, `file`, `video`). Nulo quando o provedor não disse.
   */
  readonly entradas: readonly string[] | null
}

/**
 * O catálogo, lido sem confiar na forma. Modelo sem `id` não entra: é por ele
 * que a escolha é gravada, e um item sem id seria uma linha da lista que não
 * dá para escolher.
 */
export function lerCatalogo(dado: unknown): ModeloDoCatalogo[] {
  const lista =
    dado && typeof dado === 'object' && Array.isArray((dado as { data?: unknown }).data)
      ? ((dado as { data: unknown[] }).data)
      : []

  const modelos: ModeloDoCatalogo[] = []
  for (const item of lista) {
    if (!item || typeof item !== 'object') continue
    const { id, name, context_length: contexto, pricing, architecture } = item as Record<string, unknown>
    if (typeof id !== 'string' || id.trim() === '') continue
    const precos = pricing && typeof pricing === 'object' ? (pricing as Record<string, unknown>) : {}
    modelos.push({
      id: id.trim(),
      nome: typeof name === 'string' && name.trim() !== '' ? name.trim() : id.trim(),
      contexto: numero(contexto),
      precoDeEntrada: textoOuNulo(precos.prompt),
      precoDeSaida: textoOuNulo(precos.completion),
      entradas: lerEntradas(architecture),
    })
  }
  return modelos
}

function lerEntradas(arquitetura: unknown): readonly string[] | null {
  if (!arquitetura || typeof arquitetura !== 'object') return null
  const lista = (arquitetura as { input_modalities?: unknown }).input_modalities
  if (!Array.isArray(lista)) return null
  return lista.filter((item): item is string => typeof item === 'string').map((item) => item.trim().toLowerCase())
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}

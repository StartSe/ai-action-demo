// A conversa como o provedor de voz a devolve depois do fim, lida para o que
// `finalizacao.ts` grava. É o único arquivo de `call-finalize` com os nomes do
// provedor, pela razão de `agent-publish/formato-do-provedor.ts`: trocar de
// versão da API dele é trocar este arquivo, e não a regra da finalização.
//
// **O formato é suposição declarada**, lida da documentação pública e não
// conferida contra o provedor: `GET convai/conversations/{id}` devolve
// `status`, `transcript` (turnos com `role`, `message`, `time_in_call_secs` e
// `tool_calls`), `metadata` (`start_time_unix_secs`, `call_duration_secs`,
// `termination_reason`, `charging`) e `has_audio`. As invocações vêm em
// `tool_calls` (`request_id`, `tool_name`, `params_as_json`) e o que cada uma
// devolveu, em `tool_results` (`request_id`, `tool_name`, `result_value`,
// `is_error`), no mesmo turno ou num turno seguinte. A conferência é do degrau 3,
// com uma conversa real; até lá, o que não vier na forma esperada é lido como
// ausente, e ausente nunca vira zero.
//
// **Leitura defensiva por campo.** Turno sem texto sai da transcrição, turno de
// papel desconhecido também, e as outras linhas continuam: uma ligação que
// aconteceu vale mais do que um campo torto dentro dela.

/** As três ferramentas de sistema do provedor (T-02, T-03), com o nome da coluna. */
export const FERRAMENTAS_DE_SISTEMA = {
  end_call: 'system:end_call',
  transfer_to_number: 'system:transfer_to_number',
  voicemail_detection: 'system:voicemail_detection',
} as const

export type FerramentaDeSistema = (typeof FERRAMENTAS_DE_SISTEMA)[keyof typeof FERRAMENTAS_DE_SISTEMA]

/**
 * Quem falou (RF-412). `lead` e não `user`: a transcrição é lida pela ficha da
 * chamada, e o interlocutor é o lead mesmo quando ainda não há cadastro.
 */
export type QuemFalou = 'agent' | 'lead'

export interface TurnoDaConversa {
  readonly quem: QuemFalou
  readonly texto: string
  /** Segundos desde o início da conversa. */
  readonly segundo: number
}

/**
 * Uma invocação lida da transcrição, **de qualquer ferramenta**: as três de
 * sistema, as nossas e as que ainda não sabemos ler. Quem decide o que vira
 * linha é `finalizacao.ts`; este arquivo só lê.
 */
export interface InvocacaoLida {
  /** O nome como o provedor o escreveu, aparado. Sem prefixo nenhum. */
  readonly nome: string
  readonly segundo: number
  readonly parametros: Readonly<Record<string, unknown>>
  /**
   * O erro que o provedor registrou para a invocação (`is_error`). Nulo quando
   * deu certo **e** quando o resultado não veio: invocação sem resultado não é
   * falha provada, e reaplicar o que talvez tenha dado certo duplica o efeito.
   */
  readonly erro: string | null
}

/** Um componente de custo que o provedor já devolveu, em dólares. */
export interface CustoDoProvedor {
  readonly componente: 'voice' | 'model'
  readonly valorEmDolares: number
}

export interface ConversaDoProvedor {
  /** `done` é a conversa pronta; o resto pede nova tentativa. */
  readonly pronta: boolean
  readonly falhou: boolean
  readonly turnos: readonly TurnoDaConversa[]
  readonly invocacoes: readonly InvocacaoLida[]
  /** Início da conversa, em segundos Unix. Nulo quando não veio. */
  readonly inicioEmSegundos: number | null
  readonly duracaoEmSegundos: number | null
  readonly motivoDoProvedor: string | null
  readonly temAudio: boolean
  readonly custos: readonly CustoDoProvedor[]
}

/**
 * O formato da conversa que a finalização lê hoje. Cada formato tem um
 * adaptador em `ADAPTADORES_DE_CONVERSA`, e cada fixture de
 * `transcricoes-de-exemplo.ts` declara o formato em que foi escrita: trocar de
 * versão da API do provedor é acrescentar o formato novo, o adaptador dele e as
 * fixtures dele, e mudar esta constante — sem tocar em
 * `leitura-da-transcricao.ts`.
 */
export const FORMATO_DA_CONVERSA = 'elevenlabs.convai.conversation.v1'

export type FormatoDaConversa = typeof FORMATO_DA_CONVERSA

export type AdaptadorDeConversa = (corpo: unknown) => ConversaDoProvedor | null

/** Por formato. `Map`, e não objeto literal: o formato vem de fora na fixture. */
export const ADAPTADORES_DE_CONVERSA: ReadonlyMap<string, AdaptadorDeConversa> = new Map<string, AdaptadorDeConversa>([
  [FORMATO_DA_CONVERSA, (corpo) => lerConversaDoProvedor(corpo)],
])

/** Lê a conversa pelo adaptador do formato. Formato sem adaptador levanta. */
export function lerConversa(corpo: unknown, formato: string = FORMATO_DA_CONVERSA): ConversaDoProvedor | null {
  const adaptador = ADAPTADORES_DE_CONVERSA.get(formato)
  if (!adaptador) throw new Error(`formato de conversa sem adaptador: ${formato}`)
  return adaptador(corpo)
}

/** O caminho da conversa e o do áudio, para o `index.ts` e para o rastro. */
export function caminhoDaConversa(conversaId: string): string {
  return `convai/conversations/${encodeURIComponent(conversaId)}`
}

export function caminhoDoAudio(conversaId: string): string {
  return `${caminhoDaConversa(conversaId)}/audio`
}

/**
 * O adaptador de `elevenlabs.convai.conversation.v1`. Devolve nulo quando o
 * corpo nem é um objeto.
 */
export function lerConversaDoProvedor(corpo: unknown): ConversaDoProvedor | null {
  const raiz = objeto(corpo)
  if (!raiz) return null

  const situacao = texto(raiz.status)
  const metadados = objeto(raiz.metadata) ?? {}
  const turnosCrus = Array.isArray(raiz.transcript) ? raiz.transcript : []

  const turnos: TurnoDaConversa[] = []
  const invocacoes: InvocacaoLida[] = []
  const resultados = lerResultados(turnosCrus)

  for (const cru of turnosCrus) {
    const turno = objeto(cru)
    if (!turno) continue
    const segundo = numero(turno.time_in_call_secs) ?? 0

    const quem = lerQuemFalou(turno.role)
    const fala = texto(turno.message)?.trim()
    if (quem && fala) turnos.push({ quem, texto: fala, segundo })

    const chamadas = Array.isArray(turno.tool_calls) ? turno.tool_calls : []
    for (const chamadaCrua of chamadas) {
      const chamada = objeto(chamadaCrua)
      if (!chamada) continue
      const nome = texto(chamada.tool_name)?.trim()
      if (!nome) continue
      const pedido = texto(chamada.request_id)
      const resultado = (pedido ? resultados.porPedido.get(pedido) : undefined)
        ?? resultados.porTurno.get(turno)?.get(nome)
      invocacoes.push({
        nome,
        segundo,
        parametros: lerParametros(chamada.params_as_json),
        erro: resultado?.erro ?? null,
      })
    }
  }

  return {
    pronta: situacao === 'done' || situacao === 'failed',
    falhou: situacao === 'failed',
    turnos,
    invocacoes,
    inicioEmSegundos: numero(metadados.start_time_unix_secs),
    duracaoEmSegundos: numero(metadados.call_duration_secs),
    motivoDoProvedor: texto(metadados.termination_reason),
    temAudio: raiz.has_audio === true,
    custos: lerCustos(objeto(metadados.charging)),
  }
}

interface ResultadoLido {
  readonly erro: string | null
}

/**
 * O que cada invocação devolveu, por `request_id` e, na falta dele, pelo nome
 * dentro do mesmo turno. O resultado pode chegar num turno depois do pedido,
 * e por isso a leitura percorre a transcrição inteira antes.
 */
function lerResultados(turnosCrus: readonly unknown[]): {
  porPedido: Map<string, ResultadoLido>
  porTurno: Map<Record<string, unknown>, Map<string, ResultadoLido>>
} {
  const porPedido = new Map<string, ResultadoLido>()
  const porTurno = new Map<Record<string, unknown>, Map<string, ResultadoLido>>()
  for (const cru of turnosCrus) {
    const turno = objeto(cru)
    if (!turno || !Array.isArray(turno.tool_results)) continue
    const doTurno = new Map<string, ResultadoLido>()
    for (const resultadoCru of turno.tool_results) {
      const resultado = objeto(resultadoCru)
      if (!resultado) continue
      const lido: ResultadoLido = {
        erro: resultado.is_error === true ? descreverErro(resultado.result_value) : null,
      }
      const pedido = texto(resultado.request_id)
      if (pedido) porPedido.set(pedido, lido)
      const nome = texto(resultado.tool_name)?.trim()
      if (nome) doTurno.set(nome, lido)
    }
    porTurno.set(turno, doTurno)
  }
  return { porPedido, porTurno }
}

/** Tamanho máximo do erro guardado: é diagnóstico, não cópia da resposta. */
export const TAMANHO_MAXIMO_DO_ERRO = 500

/**
 * O erro em texto nunca vazio: `call_tool_invocations.error` recusa branco, e
 * erro que existe sem dizer qual continua sendo erro.
 */
function descreverErro(valor: unknown): string {
  const bruto = typeof valor === 'string' ? valor.trim() : valor === undefined || valor === null ? '' : JSON.stringify(valor)
  const descricao = bruto === '' ? 'o provedor registrou erro sem descrição' : bruto
  return descricao.slice(0, TAMANHO_MAXIMO_DO_ERRO)
}

/**
 * Os componentes que o provedor de voz informa. A telefonia **nunca** vem daqui
 * — é da operadora, chega minutos depois e é de `cron-cost-sync` (T-20, P-07).
 *
 * **`call_charge` não é dinheiro, é crédito**, e por isso não vira custo aqui.
 * O provedor cobra por caractere sintetizado, e a conversão de crédito para
 * moeda depende do plano da conta — o mesmo número de créditos custa valores
 * diferentes em planos diferentes, e pode custar zero dentro da franquia.
 *
 * A primeira ligação de verdade mostrou o tamanho do engano: 2.719 créditos em
 * 163 segundos viraram US$ 2.719,00 na tela. Número errado sobre dinheiro é
 * pior do que número nenhum — ele passa por verdade, e quem o lê decide com
 * ele. Enquanto não houver o preço do plano para converter, o custo de voz fica
 * ausente, e quem o preenche é `cron-cost-sync` com o que a operadora cobrou de
 * fato.
 *
 * `llm_price`, ao contrário, é moeda: é o que o provedor pagou ao modelo.
 */
function lerCustos(cobranca: Record<string, unknown> | null): CustoDoProvedor[] {
  if (!cobranca) return []
  const custos: CustoDoProvedor[] = []
  const modelo = numero(cobranca.llm_price)
  if (modelo !== null && modelo >= 0) custos.push({ componente: 'model', valorEmDolares: modelo })
  return custos
}

function lerQuemFalou(valor: unknown): QuemFalou | null {
  if (valor === 'agent') return 'agent'
  if (valor === 'user') return 'lead'
  return null
}

/** `params_as_json` é texto com JSON dentro; ilegível vira objeto vazio. */
function lerParametros(valor: unknown): Record<string, unknown> {
  if (typeof valor !== 'string') return objeto(valor) ?? {}
  try {
    return objeto(JSON.parse(valor)) ?? {}
  } catch {
    return {}
  }
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

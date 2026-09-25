// O que a ElevenLabs da conta sabe de uma ligação, lido para o diagnóstico.
//
// É o único arquivo de `call-diagnose` com os nomes do provedor, pela razão de
// `agent-publish/formato-do-provedor.ts`: trocar de versão da API dele é trocar
// este arquivo, e não as regras do diagnóstico.
//
// **TRÊS LEITURAS, TODAS SUPOSIÇÃO DECLARADA.** Os corpos abaixo vêm da
// documentação pública do provedor e de `call-finalize/formato-do-provedor.ts`,
// e não foram conferidos contra uma conversa real deste produto. A conferência
// é do degrau 3; até lá, campo que não vier na forma esperada é lido como
// ausente, e ausente nunca vira valor. Cada suposição tem número, para o
// relatório do degrau 3 poder dizer qual caiu:
//
// C1. `GET convai/conversations/{id}` devolve `status` (`initiated`,
//     `in-progress`, `processing`, `done`, `failed`), `agent_id`, `transcript`
//     (turnos com `role` `agent`|`user`, `message`, `time_in_call_secs`,
//     `tool_calls` e `tool_results`), `metadata` e `analysis`.
// C2. `tool_calls[]` traz `request_id`, `tool_name` e `params_as_json` (texto
//     com JSON dentro); `tool_results[]` traz `request_id`, `tool_name`,
//     `result_value` e `is_error`, no mesmo turno ou num seguinte.
// C3. `metadata.termination_reason` é **texto livre** do provedor, e não uma
//     lista fechada: já se viu "end_call tool was called.", "Client
//     disconnected: 1000", "Call ended by remote party", "Max duration
//     exceeded". Por isso as regras casam por expressão
//     (`PADROES_DO_MOTIVO`, abaixo), e o texto cru vai inteiro na evidência.
// C4. `metadata.error` é `{ code, reason }` quando a conversa caiu por erro do
//     lado do provedor (modelo, síntese, início), e nulo ou ausente quando não.
// C5. `metadata.phone_call` traz `direction`, `external_number` e `call_sid`
//     na ligação por telefone; ausente no ensaio pelo navegador.
// C6. `conversation_initiation_client_data` guarda o que o início da conversa
//     recebeu: `dynamic_variables` (as `system__*` do provedor e as que o
//     webhook de início devolveu — `call-init` devolve `call_id`) e
//     `conversation_config_override.agent.first_message`, quando o webhook
//     sobrepôs a primeira fala. Bloco ausente é "o provedor não disse", e não
//     "o webhook não respondeu" — a regra do webhook só conclui com o bloco
//     presente.
// C7. `analysis.call_successful` (`success`|`failure`|`unknown`) e
//     `analysis.transcript_summary` são a leitura do próprio provedor.
//
// A1. `GET convai/agents/{id}` devolve `name`, `conversation_config` e
//     `platform_settings`. Dentro de `conversation_config`: `agent` com
//     `first_message`, `language`, `dynamic_variables.dynamic_variable_placeholders`
//     e `prompt` (`prompt`, `llm`, `tools[]`, `tool_ids[]`, `built_in_tools`);
//     `tts` com `voice_id`, `model_id` e os ajustes (`stability`,
//     `similarity_boost`, `speed`) no próprio `tts` **ou** em
//     `tts.voice_settings` — a publicação manda no segundo, e a documentação
//     mostra no primeiro; lemos os dois, o primeiro vence; `turn` com
//     `turn_timeout` e `silence_end_call_timeout` (em segundos, `-1` é
//     desligado); `conversation.max_duration_seconds`.
// A2. As ferramentas aparecem por nome em `prompt.tools[].name` e, as de
//     sistema, também como chave de `prompt.built_in_tools` com valor não
//     nulo. Ferramenta cadastrada à parte chega só por `prompt.tool_ids`, sem
//     nome: quando há `tool_ids` que não conseguimos nomear, a regra de
//     "ferramenta inexistente" não conclui nada (ver `ferramentasPorReferencia`).
// A3. `platform_settings.overrides.enable_conversation_initiation_client_data_from_webhook`
//     liga o webhook de início, e
//     `platform_settings.overrides.conversation_config_override.agent.first_message`
//     libera a sobreposição da primeira fala — os nomes que a publicação
//     escreve (suposição 4 de `agent-publish/formato-do-provedor.ts`).
//
// W1. `GET convai/settings` devolve `conversation_initiation_client_data_webhook`
//     (`url`, `request_headers`) e `webhooks.post_call_webhook_id`, os dois
//     avisos da conta que `agent-publish` cadastra (suposição 5 de lá).
//
// Módulo portável: sem Deno, sem rede, sem banco.

/** Os caminhos, relativos a `/v1`, que o `index.ts` chama e o rastro registra. */
export function caminhoDaConversa(conversaId: string): string {
  return `convai/conversations/${encodeURIComponent(conversaId)}`
}

export function caminhoDoAgente(agenteId: string): string {
  return `convai/agents/${encodeURIComponent(agenteId)}`
}

export const CAMINHO_DA_CONFIGURACAO_DAS_CONVERSAS = 'convai/settings'

/** Quem falou. `lead` e não `user`, como em `call-finalize`. */
export type QuemFalou = 'agent' | 'lead'

export interface TurnoLido {
  readonly quem: QuemFalou
  readonly texto: string
  readonly segundo: number
}

/** Uma invocação de ferramenta lida da conversa, com o que ela devolveu. */
export interface InvocacaoLida {
  readonly nome: string
  readonly segundo: number
  readonly parametros: Readonly<Record<string, unknown>>
  /** O que a ferramenta devolveu, aparado. Nulo quando o resultado não veio. */
  readonly resultado: string | null
  /** `is_error` do provedor. Falso também quando o resultado não veio. */
  readonly comErro: boolean
  readonly semResultado: boolean
}

export interface ErroDoProvedor {
  readonly codigo: string | null
  readonly razao: string | null
}

export interface ConversaLida {
  readonly status: string | null
  readonly agenteId: string | null
  readonly turnos: readonly TurnoLido[]
  readonly invocacoes: readonly InvocacaoLida[]
  /** `metadata.termination_reason`, cru (C3). */
  readonly motivoDoFim: string | null
  readonly erro: ErroDoProvedor | null
  readonly duracaoSeg: number | null
  readonly telefone: {
    readonly direcao: string | null
    readonly numeroExterno: string | null
    readonly callSid: string | null
  } | null
  /**
   * As variáveis que a conversa recebeu no início (C6). Nulo quando o bloco
   * não veio, que é diferente de objeto vazio.
   */
  readonly variaveis: Readonly<Record<string, string>> | null
  readonly primeiraFalaSobreposta: string | null
  readonly sucessoSegundoOProvedor: string | null
  readonly resumoDoProvedor: string | null
}

export interface AgenteLido {
  readonly nome: string | null
  readonly primeiraFala: string | null
  readonly prompt: string | null
  readonly llm: string | null
  readonly idioma: string | null
  readonly vozId: string | null
  readonly modeloDeVoz: string | null
  /** Os ajustes na forma do provedor (`stability`, `similarity_boost`, `speed`). */
  readonly ajustesDeVoz: Readonly<Record<string, number>>
  readonly tempoDeTurnoSeg: number | null
  /** `silence_end_call_timeout`. `-1` é desligado, e chega assim. */
  readonly silencioParaEncerrarSeg: number | null
  readonly duracaoMaximaSeg: number | null
  /** Os nomes das ferramentas que conseguimos ler (A2), sem repetir. */
  readonly ferramentas: readonly string[]
  /** Quantas ferramentas chegaram só por `tool_ids`, sem nome. */
  readonly ferramentasPorReferencia: number
  readonly placeholders: Readonly<Record<string, string>>
  readonly webhookDeInicioLigado: boolean | null
  readonly primeiraFalaSobreponivel: boolean | null
}

export interface ConfiguracaoDasConversasLida {
  readonly inicioUrl: string | null
  readonly posChamadaId: string | null
}

/** Tamanho máximo de um resultado de ferramenta guardado: é evidência, não cópia. */
export const TAMANHO_MAXIMO_DO_RESULTADO = 300

/** Lê a conversa (C1 a C7). Nulo quando o corpo nem é um objeto. */
export function lerConversaDoProvedor(corpo: unknown): ConversaLida | null {
  const raiz = objeto(corpo)
  if (!raiz) return null

  const metadados = objeto(raiz.metadata) ?? {}
  const turnosCrus = Array.isArray(raiz.transcript) ? raiz.transcript : []
  const resultados = lerResultados(turnosCrus)

  const turnos: TurnoLido[] = []
  const invocacoes: InvocacaoLida[] = []

  for (const cru of turnosCrus) {
    const turno = objeto(cru)
    if (!turno) continue
    const segundo = numero(turno.time_in_call_secs) ?? 0
    const quem = turno.role === 'agent' ? 'agent' : turno.role === 'user' ? 'lead' : null
    const fala = texto(turno.message)
    if (quem && fala) turnos.push({ quem, texto: fala, segundo })

    const chamadas = Array.isArray(turno.tool_calls) ? turno.tool_calls : []
    for (const chamadaCrua of chamadas) {
      const chamada = objeto(chamadaCrua)
      const nome = texto(chamada?.tool_name)
      if (!chamada || !nome) continue
      const pedido = texto(chamada.request_id)
      const resultado = (pedido ? resultados.porPedido.get(pedido) : undefined) ?? resultados.porNome.get(nome)
      invocacoes.push({
        nome,
        segundo,
        parametros: lerParametros(chamada.params_as_json),
        resultado: resultado?.texto ?? null,
        comErro: resultado?.comErro ?? false,
        semResultado: resultado === undefined,
      })
    }
  }

  const erroCru = objeto(metadados.error)
  const erro =
    erroCru && (erroCru.code !== undefined || erroCru.reason !== undefined)
      ? { codigo: textoOuNumero(erroCru.code), razao: texto(erroCru.reason) }
      : null
  const telefoneCru = objeto(metadados.phone_call)
  const inicio = objeto(raiz.conversation_initiation_client_data)
  const sobreposicao = objeto(objeto(inicio?.conversation_config_override)?.agent)
  const analise = objeto(raiz.analysis)

  return {
    status: texto(raiz.status),
    agenteId: texto(raiz.agent_id),
    turnos,
    invocacoes,
    motivoDoFim: texto(metadados.termination_reason),
    erro: erro && (erro.codigo !== null || erro.razao !== null) ? erro : null,
    duracaoSeg: numero(metadados.call_duration_secs),
    telefone: telefoneCru
      ? {
          direcao: texto(telefoneCru.direction),
          numeroExterno: texto(telefoneCru.external_number),
          callSid: texto(telefoneCru.call_sid),
        }
      : null,
    variaveis: inicio ? textosDoObjeto(inicio.dynamic_variables) : null,
    primeiraFalaSobreposta: texto(sobreposicao?.first_message),
    sucessoSegundoOProvedor: texto(analise?.call_successful),
    resumoDoProvedor: texto(analise?.transcript_summary),
  }
}

/** Lê o agente vivo (A1 a A3). Nulo quando o corpo nem é um objeto. */
export function lerAgenteDoProvedor(corpo: unknown): AgenteLido | null {
  const raiz = objeto(corpo)
  if (!raiz) return null

  const conversa = objeto(raiz.conversation_config) ?? {}
  const agente = objeto(conversa.agent) ?? {}
  const prompt = objeto(agente.prompt) ?? {}
  const tts = objeto(conversa.tts) ?? {}
  const turno = objeto(conversa.turn) ?? {}
  const duracao = objeto(conversa.conversation) ?? {}
  const variaveis = objeto(agente.dynamic_variables) ?? {}
  const plataforma = objeto(raiz.platform_settings) ?? {}
  const sobreposicoes = objeto(plataforma.overrides)
  const sobreposicaoDoAgente = objeto(objeto(sobreposicoes?.conversation_config_override)?.agent)

  const nomes = new Set<string>()
  if (Array.isArray(prompt.tools)) {
    for (const item of prompt.tools) {
      const nome = texto(objeto(item)?.name)
      if (nome) nomes.add(nome)
    }
  }
  const embutidas = objeto(prompt.built_in_tools)
  if (embutidas) {
    for (const [chave, valor] of Object.entries(embutidas)) {
      if (valor === null || valor === undefined || valor === false) continue
      nomes.add(texto(objeto(valor)?.name) ?? chave)
    }
  }
  const referencias = Array.isArray(prompt.tool_ids) ? prompt.tool_ids.filter((id) => texto(id)).length : 0

  return {
    nome: texto(raiz.name),
    primeiraFala: texto(agente.first_message),
    prompt: texto(prompt.prompt),
    llm: texto(prompt.llm),
    idioma: texto(agente.language),
    vozId: texto(tts.voice_id),
    modeloDeVoz: texto(tts.model_id),
    ajustesDeVoz: lerAjustesDaVoz(tts),
    tempoDeTurnoSeg: numero(turno.turn_timeout),
    silencioParaEncerrarSeg: numero(turno.silence_end_call_timeout),
    duracaoMaximaSeg: numero(duracao.max_duration_seconds),
    ferramentas: [...nomes],
    // Referência que já tem nome lido não conta: só a que ficou sem nome
    // impede a conclusão da regra de ferramenta inexistente.
    ferramentasPorReferencia: Math.max(0, referencias - (Array.isArray(prompt.tools) ? prompt.tools.length : 0)),
    placeholders: textosDoObjeto(variaveis.dynamic_variable_placeholders) ?? {},
    webhookDeInicioLigado: booleano(sobreposicoes?.enable_conversation_initiation_client_data_from_webhook),
    primeiraFalaSobreponivel: booleano(sobreposicaoDoAgente?.first_message),
  }
}

/** Lê a configuração de conversas do workspace (W1). */
export function lerConfiguracaoDasConversas(corpo: unknown): ConfiguracaoDasConversasLida | null {
  const raiz = objeto(corpo)
  if (!raiz) return null
  return {
    inicioUrl: texto(objeto(raiz.conversation_initiation_client_data_webhook)?.url),
    posChamadaId: texto(objeto(raiz.webhooks)?.post_call_webhook_id),
  }
}

/**
 * O que o motivo de fim do provedor quer dizer, por expressão (C3). A ordem
 * importa: a primeira que casar vence, e erro vem antes de desligamento,
 * porque "LLM error, client disconnected" é erro.
 */
export const PADROES_DO_MOTIVO = {
  erro_do_modelo: /\b(llm|language model|model (error|failed|timeout)|openai|anthropic|gemini|rate.?limit|quota)\b/i,
  webhook_de_inicio: /(initiation|client.?data|conversation.?init|webhook)/i,
  end_call: /end_call|end call tool/i,
  silencio: /(silence|inactiv|no (user )?(input|response)|turn.?timeout|idle)/i,
  duracao_maxima: /(max(imum)?.?(call.?)?duration|duration (limit|exceeded)|time.?limit)/i,
  desligado_pelo_lead: /(remote party|hung ?up|hangup|client disconnected|user ended|caller ended)/i,
} as const satisfies Readonly<Record<string, RegExp>>

export type SentidoDoMotivo = keyof typeof PADROES_DO_MOTIVO

/** O sentido do motivo de fim, ou nulo quando nenhum padrão casou. */
export function sentidoDoMotivo(motivo: string | null): SentidoDoMotivo | null {
  if (!motivo) return null
  for (const [sentido, padrao] of Object.entries(PADROES_DO_MOTIVO) as [SentidoDoMotivo, RegExp][]) {
    if (padrao.test(motivo)) return sentido
  }
  return null
}

// Leitura miúda -----------------------------------------------------------------------

interface ResultadoCru {
  readonly texto: string | null
  readonly comErro: boolean
}

function lerResultados(turnosCrus: readonly unknown[]) {
  const porPedido = new Map<string, ResultadoCru>()
  const porNome = new Map<string, ResultadoCru>()
  for (const cru of turnosCrus) {
    const turno = objeto(cru)
    if (!turno || !Array.isArray(turno.tool_results)) continue
    for (const itemCru of turno.tool_results) {
      const item = objeto(itemCru)
      if (!item) continue
      const lido: ResultadoCru = { texto: descrever(item.result_value), comErro: item.is_error === true }
      const pedido = texto(item.request_id)
      if (pedido) porPedido.set(pedido, lido)
      const nome = texto(item.tool_name)
      if (nome && !porNome.has(nome)) porNome.set(nome, lido)
    }
  }
  return { porPedido, porNome }
}

function descrever(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null
  const bruto = typeof valor === 'string' ? valor.trim() : JSON.stringify(valor)
  return bruto === '' ? null : bruto.slice(0, TAMANHO_MAXIMO_DO_RESULTADO)
}

function lerAjustesDaVoz(tts: Record<string, unknown>): Record<string, number> {
  const aninhado = objeto(tts.voice_settings) ?? {}
  const lidos: Record<string, number> = {}
  for (const campo of ['stability', 'similarity_boost', 'speed']) {
    const valor = numero(tts[campo]) ?? numero(aninhado[campo])
    if (valor !== null) lidos[campo] = valor
  }
  return lidos
}

function lerParametros(valor: unknown): Record<string, unknown> {
  if (typeof valor !== 'string') return objeto(valor) ?? {}
  try {
    return objeto(JSON.parse(valor)) ?? {}
  } catch {
    return {}
  }
}

function textosDoObjeto(valor: unknown): Record<string, string> | null {
  const cru = objeto(valor)
  if (!cru) return null
  const lidos: Record<string, string> = {}
  for (const [chave, item] of Object.entries(cru)) {
    if (typeof item === 'string') lidos[chave] = item
    else if (typeof item === 'number' || typeof item === 'boolean') lidos[chave] = String(item)
  }
  return lidos
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

function textoOuNumero(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  return texto(valor)
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

function booleano(valor: unknown): boolean | null {
  return typeof valor === 'boolean' ? valor : null
}

// Uma rodada de conversa com o modelo da conta, com ferramentas (function
// calling do OpenRouter, no formato de chat da OpenAI).
//
// `pergunta.ts` pede uma resposta em JSON com esquema estrito, que é o que a
// classificação e a redação precisam. A conversa por WhatsApp precisa de outra
// coisa: histórico de mensagens, ferramentas declaradas e a volta do modelo
// pedindo uma delas (`tool_calls`). O laço (executar a ferramenta e devolver o
// resultado) é de quem chama; aqui mora só o formato de uma ida e a leitura da
// volta, e a mesma regra de `pergunta.ts`: o modelo é o da conta, e conta sem
// modelo conectado recebe `sem_credencial` **sem ir à rede**.
//
// Módulo portável: sem `Deno`, sem import de rede. `fetch` é global.

import type { EnvelopeDoProvedor } from '../provedor/resposta.ts'

import { cabecalhosDaConversa, URL_DA_CONVERSA } from './openrouter.ts'
import type { Aplicacao, PortaDaPergunta } from './pergunta.ts'
import type { ModeloResolvido } from './resolucao.ts'

/** Uma mensagem da conversa, no formato que o provedor normaliza. */
export type MensagemDoModelo =
  | { readonly role: 'system' | 'user'; readonly content: string }
  | {
      readonly role: 'assistant'
      readonly content: string | null
      readonly tool_calls?: readonly ChamadaDeFerramenta[]
    }
  | { readonly role: 'tool'; readonly tool_call_id: string; readonly content: string }

/** Um pedido de ferramenta que o modelo fez. `arguments` é JSON em texto. */
export interface ChamadaDeFerramenta {
  readonly id: string
  readonly type: 'function'
  readonly function: { readonly name: string; readonly arguments: string }
}

/** Uma ferramenta declarada ao modelo. */
export interface FerramentaDoModelo {
  readonly nome: string
  readonly descricao: string
  /** JSON Schema do objeto de argumentos. */
  readonly parametros: Readonly<Record<string, unknown>>
}

export interface PedidoDaRodada {
  readonly modelo: string
  readonly mensagens: readonly MensagemDoModelo[]
  readonly ferramentas: readonly FerramentaDoModelo[]
  readonly maxTokens: number
}

export interface RespostaDaRodada extends EnvelopeDoProvedor {
  readonly texto?: string | null
  readonly chamadas?: readonly ChamadaDeFerramenta[]
  readonly tokensDeEntrada?: number | null
  readonly tokensDeSaida?: number | null
}

const ENDPOINT = 'api/v1/chat/completions'

/** O corpo da ida. Sem ferramentas, o campo `tools` não vai. */
export function corpoDaRodada(pedido: PedidoDaRodada): Record<string, unknown> {
  return {
    model: pedido.modelo,
    max_tokens: pedido.maxTokens,
    messages: pedido.mensagens,
    ...(pedido.ferramentas.length === 0
      ? {}
      : {
          tool_choice: 'auto',
          tools: pedido.ferramentas.map((ferramenta) => ({
            type: 'function',
            function: {
              name: ferramenta.nome,
              description: ferramenta.descricao,
              parameters: ferramenta.parametros,
            },
          })),
        }),
  }
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

export interface LeituraDaRodada {
  readonly texto: string | null
  readonly chamadas: readonly ChamadaDeFerramenta[]
  readonly motivoDoFim: string | null
  readonly tokensDeEntrada: number | null
  readonly tokensDeSaida: number | null
}

/** A volta lida sem confiar na forma. Chamada sem nome é descartada. */
export function lerRodada(dado: unknown): LeituraDaRodada {
  const corpo = objeto(dado) ?? {}
  const primeira = objeto(Array.isArray(corpo.choices) ? corpo.choices[0] : null) ?? {}
  const mensagem = objeto(primeira.message) ?? {}
  const conteudo = typeof mensagem.content === 'string' && mensagem.content.trim() !== '' ? mensagem.content : null
  const chamadas: ChamadaDeFerramenta[] = []
  for (const [indice, bruta] of (Array.isArray(mensagem.tool_calls) ? mensagem.tool_calls : []).entries()) {
    const chamada = objeto(bruta)
    const funcao = objeto(chamada?.function)
    const nome = typeof funcao?.name === 'string' ? funcao.name.trim() : ''
    if (nome === '') continue
    const argumentos = funcao?.arguments
    chamadas.push({
      id: typeof chamada?.id === 'string' && chamada.id !== '' ? chamada.id : `chamada_${indice}`,
      type: 'function',
      function: {
        name: nome,
        arguments: typeof argumentos === 'string' ? argumentos : JSON.stringify(argumentos ?? {}),
      },
    })
  }
  const uso = objeto(corpo.usage) ?? {}
  return {
    texto: conteudo,
    chamadas,
    motivoDoFim: typeof primeira.finish_reason === 'string' ? primeira.finish_reason : null,
    tokensDeEntrada: numero(uso.prompt_tokens),
    tokensDeSaida: numero(uso.completion_tokens),
  }
}

/**
 * Uma ida ao modelo da conta. Nunca levanta: sem modelo conectado,
 * `sem_credencial` sem rede; falha de rede e recusa chegam como `ok: false`.
 * `length` não é sucesso, como em `pergunta.ts`.
 */
export async function conversarComFerramentas(
  contaId: string,
  resolvido: ModeloResolvido,
  pedido: PedidoDaRodada,
  porta: PortaDaPergunta,
  aplicacao: Aplicacao = {},
  limiteMs = 30_000,
): Promise<RespostaDaRodada> {
  const endpoint = ENDPOINT
  if (resolvido.porta !== 'openrouter') return { ok: false, codigo: 'sem_credencial', status: null, endpoint }
  const chave = await porta.chaveDoOpenRouter(contaId)
  if (!chave) return { ok: false, codigo: 'sem_credencial', status: null, endpoint }

  const inicio = Date.now()
  try {
    const resposta = await fetch(URL_DA_CONVERSA, {
      method: 'POST',
      headers: cabecalhosDaConversa(chave, aplicacao),
      body: JSON.stringify(corpoDaRodada(pedido)),
      signal: AbortSignal.timeout(limiteMs),
    })
    let corpo: unknown = null
    try {
      corpo = await resposta.json()
    } catch {
      // Corpo que não é JSON vira leitura vazia.
    }
    const lida = lerRodada(corpo)
    return {
      ok: resposta.ok && (lida.texto !== null || lida.chamadas.length > 0) && lida.motivoDoFim !== 'length',
      codigo: lida.motivoDoFim ?? (resposta.ok ? null : String(resposta.status)),
      status: resposta.status,
      latenciaMs: Date.now() - inicio,
      endpoint,
      texto: lida.texto,
      chamadas: lida.chamadas,
      tokensDeEntrada: lida.tokensDeEntrada,
      tokensDeSaida: lida.tokensDeSaida,
    }
  } catch (erro) {
    return {
      ok: false,
      codigo: erro instanceof Error ? erro.name : 'fetch_failed',
      status: null,
      latenciaMs: Date.now() - inicio,
      endpoint,
    }
  }
}

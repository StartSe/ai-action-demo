// Uma leitura de mídia pelo modelo da conta: ouvir um áudio ou ver uma imagem,
// e devolver texto. É o que o canal de WhatsApp usa para a nota de voz e a foto
// que o lead manda (`_shared/whatsapp/midia.ts`).
//
// **Resposta em texto livre, sem esquema.** A transcrição e a descrição são o
// texto inteiro da volta; um `response_format` estrito seria mais uma coisa que
// modelo multimodal barato pode não suportar, e nada aqui precisa de campos.
// Quando o áudio não dá para entender, a instrução pede a marca
// `MARCA_DE_INAUDIVEL` em vez de um palpite, e quem chama trata a marca como
// falha.
//
// **As mesmas regras de `pergunta.ts`:** o modelo é o da conta, conta sem
// modelo conectado recebe `sem_credencial` sem ir à rede, nunca levanta, e
// `length` não é sucesso.
//
// **O que é suposição** está em `SUPOSICOES_DA_LEITURA_DE_MIDIA`, com as
// fixtures em `openrouter-exemplos.ts`. A conferência contra o provedor de
// verdade é do degrau 3.
//
// Módulo portável: sem `Deno`, sem import de rede. `fetch` entra por parâmetro.

import { cabecalhosDaConversa, lerConversa, URL_DA_CONVERSA } from './openrouter.ts'
import type { Aplicacao, PortaDaPergunta, RespostaDoModelo } from './pergunta.ts'
import type { ModeloResolvido } from './resolucao.ts'

export const SUPOSICOES_DA_LEITURA_DE_MIDIA = [
  'M1: imagem vai no chat como parte { type: "image_url", image_url: { url } }, e url pode ser data URI base64 (data:image/jpeg;base64,...).',
  'M2: áudio vai como parte { type: "input_audio", input_audio: { data, format } }, só em base64 (URL de áudio não é aceita). Formatos documentados: wav, mp3, aiff, aac, ogg, flac, m4a, pcm16, pcm24; cada provedor aceita uma parte deles.',
  'M3: o Gemini pelo OpenRouter aceita format "ogg" com o áudio ogg/opus da nota de voz do WhatsApp, sem conversão. Modelo que não aceite ogg recusa o pedido, e a leitura vira falhou (a assistente pede para escrever).',
  'M4: architecture.input_modalities do catálogo (GET /api/v1/models) lista "image" e "audio" nos modelos que aceitam essas entradas.',
] as const

/** O que o modelo escreve quando não entendeu o áudio. */
export const MARCA_DE_INAUDIVEL = '[inaudivel]'

export type ConteudoDaMidia =
  | { readonly tipo: 'imagem'; readonly dataUri: string }
  | { readonly tipo: 'audio'; readonly base64: string; readonly formato: string }

export interface PedidoDeLeitura {
  readonly modelo: string
  /** A instrução ao modelo (`_shared/speech/whatsapp.ts`). */
  readonly instrucao: string
  readonly conteudo: ConteudoDaMidia
  readonly maxTokens: number
}

export type Buscar = (url: string, init: RequestInit) => Promise<Response>

const ENDPOINT = 'api/v1/chat/completions'

/** O corpo do chat: a instrução no sistema, a mídia como parte da mensagem do usuário. */
export function corpoDaLeitura(pedido: PedidoDeLeitura): Record<string, unknown> {
  const parte =
    pedido.conteudo.tipo === 'imagem'
      ? { type: 'image_url', image_url: { url: pedido.conteudo.dataUri } }
      : { type: 'input_audio', input_audio: { data: pedido.conteudo.base64, format: pedido.conteudo.formato } }
  return {
    model: pedido.modelo,
    max_tokens: pedido.maxTokens,
    messages: [
      { role: 'system', content: pedido.instrucao },
      { role: 'user', content: [parte] },
    ],
  }
}

/**
 * Lê a mídia pelo modelo resolvido. Nunca levanta: falha de rede e recusa do
 * provedor chegam como `ok: false`.
 */
export async function lerMidiaComModelo(
  contaId: string,
  resolvido: ModeloResolvido,
  pedido: PedidoDeLeitura,
  porta: PortaDaPergunta,
  opcoes: { readonly aplicacao?: Aplicacao; readonly limiteMs?: number; readonly buscar?: Buscar } = {},
): Promise<RespostaDoModelo> {
  const endpoint = ENDPOINT
  if (resolvido.porta !== 'openrouter') return { ok: false, codigo: 'sem_credencial', status: null, endpoint }
  const chave = await porta.chaveDoOpenRouter(contaId)
  if (!chave) return { ok: false, codigo: 'sem_credencial', status: null, endpoint }

  const buscar = opcoes.buscar ?? ((url, init) => fetch(url, init))
  const inicio = Date.now()
  try {
    const resposta = await buscar(URL_DA_CONVERSA, {
      method: 'POST',
      headers: cabecalhosDaConversa(chave, opcoes.aplicacao),
      body: JSON.stringify(corpoDaLeitura(pedido)),
      signal: AbortSignal.timeout(opcoes.limiteMs ?? 60_000),
    })
    let corpo: unknown = null
    try {
      corpo = await resposta.json()
    } catch {
      // Corpo que não é JSON vira leitura vazia.
    }
    const lida = lerConversa(corpo)
    return {
      ok: resposta.ok && lida.texto !== null && lida.motivoDoFim !== 'length',
      codigo: lida.motivoDoFim ?? (resposta.ok ? null : String(resposta.status)),
      status: resposta.status,
      latenciaMs: Date.now() - inicio,
      endpoint,
      texto: lida.texto,
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

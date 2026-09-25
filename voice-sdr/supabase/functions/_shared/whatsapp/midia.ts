// Áudio e imagem que o lead manda pelo WhatsApp, lidos pelo modelo da conta.
//
// **O desenho.** O webhook grava a mensagem com `media_status = 'pendente'` e
// devolve o 200; a leitura corre em `depois`, antes da resposta:
//
// 1. Baixa o arquivo pela URL da Z-API (suposição Z9), só `https`, com teto de
//    tamanho (`LIMITE_DA_MIDIA_BYTES`) e de tempo (`LIMITE_DO_DOWNLOAD_MS`).
//    Passou do teto: falha, sem ler o resto.
// 2. Manda ao modelo da tarefa (`audio` transcreve, `imagem` descreve), pela
//    porta de `_shared/modelo/leitura-de-midia.ts`.
// 3. Grava o texto derivado em `media_text` com `media_status = 'lida'`, ou
//    `falhou`. A mídia não é guardada em lugar nenhum: os bytes vivem só na
//    memória desta execução.
// 4. Registra a ida ao modelo em `integration_events`, com a instrução sob a
//    chave `prompt` (o gatilho a redige) e sem a mídia nem o texto derivado.
//
// Enquanto a leitura corre, a resposta da assistente espera (`resposta.ts`,
// desfecho `midia_pendente`); leitura pendente há mais de
// `VALIDADE_DA_LEITURA_PENDENTE_MS` é execução que morreu, e conta como falha.
//
// **Vídeo, documento e figurinha** não vão ao modelo: recebem o pedido de texto,
// como antes.
//
// Módulo portável: sem Deno, sem rede. O `fetch` e o modelo entram pela porta.

import { MARCA_DE_INAUDIVEL, type ConteudoDaMidia } from '../modelo/leitura-de-midia.ts'
import type { RespostaDoModelo } from '../modelo/pergunta.ts'
import { INSTRUCAO_DA_DESCRICAO, INSTRUCAO_DA_TRANSCRICAO } from '../speech/whatsapp.ts'

import type { AnexoRecebido, TipoDeMidia } from './zapi.ts'

/** O maior arquivo que a borda baixa: 10 MB, folga para nota de voz longa e foto. */
export const LIMITE_DA_MIDIA_BYTES = 10 * 1024 * 1024

/** Quanto o download pode levar. */
export const LIMITE_DO_DOWNLOAD_MS = 15_000

/** Leitura pendente mais velha que isto conta como falha (a execução morreu). */
export const VALIDADE_DA_LEITURA_PENDENTE_MS = 2 * 60 * 1000

/** O maior texto derivado que se grava (o check de `media_text` é 4096). */
export const TAMANHO_MAXIMO_DA_LEITURA = 4000

/** O teto de saída do modelo, em tokens. */
export const TOKENS_DA_LEITURA = 1200

export type MidiaLida = 'audio' | 'imagem'
export type EstadoDaLeitura = 'pendente' | 'lida' | 'falhou'

/** As mídias que o modelo lê. As outras recebem o pedido de texto. */
export function eMidiaLida(midia: TipoDeMidia | string | null): midia is MidiaLida {
  return midia === 'audio' || midia === 'imagem'
}

export type Buscar = (url: string, init: RequestInit) => Promise<Response>

export type Download =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly mime: string | null }
  | { readonly ok: false; readonly motivo: 'endereco_invalido' | 'grande_demais' | 'falha_no_download' }

/**
 * Baixa o arquivo, com teto de tamanho. O `content-length` recusa antes de
 * baixar; sem ele, a leitura para no primeiro pedaço que passa do teto.
 */
export async function baixarMidia(url: string, buscar: Buscar, limiteBytes = LIMITE_DA_MIDIA_BYTES): Promise<Download> {
  let endereco: URL
  try {
    endereco = new URL(url)
  } catch {
    return { ok: false, motivo: 'endereco_invalido' }
  }
  if (endereco.protocol !== 'https:') return { ok: false, motivo: 'endereco_invalido' }

  let resposta: Response
  try {
    resposta = await buscar(endereco.toString(), { method: 'GET' })
  } catch {
    return { ok: false, motivo: 'falha_no_download' }
  }
  if (!resposta.ok) return { ok: false, motivo: 'falha_no_download' }
  const declarado = Number(resposta.headers.get('content-length') ?? '')
  if (Number.isFinite(declarado) && declarado > limiteBytes) {
    await resposta.body?.cancel().catch(() => {})
    return { ok: false, motivo: 'grande_demais' }
  }
  const mime = resposta.headers.get('content-type')

  try {
    if (!resposta.body) {
      const bytes = new Uint8Array(await resposta.arrayBuffer())
      return bytes.byteLength > limiteBytes ? { ok: false, motivo: 'grande_demais' } : { ok: true, bytes, mime }
    }
    const leitor = resposta.body.getReader()
    const pedacos: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      total += value.byteLength
      if (total > limiteBytes) {
        await leitor.cancel().catch(() => {})
        return { ok: false, motivo: 'grande_demais' }
      }
      pedacos.push(value)
    }
    const bytes = new Uint8Array(total)
    let posicao = 0
    for (const pedaco of pedacos) {
      bytes.set(pedaco, posicao)
      posicao += pedaco.byteLength
    }
    return { ok: true, bytes, mime }
  } catch {
    return { ok: false, motivo: 'falha_no_download' }
  }
}

/** Base64 sem `Buffer`, que não existe no Deno sem compatibilidade de Node. */
export function paraBase64(bytes: Uint8Array): string {
  let binario = ''
  const PEDACO = 0x8000
  for (let indice = 0; indice < bytes.length; indice += PEDACO) {
    binario += String.fromCharCode(...bytes.subarray(indice, indice + PEDACO))
  }
  return btoa(binario)
}

function tipoBase(mime: string | null): string {
  return (mime ?? '').split(';')[0]!.trim().toLowerCase()
}

/**
 * O `format` do `input_audio` pelo tipo do arquivo (suposição M2). A nota de
 * voz do WhatsApp é `audio/ogg; codecs=opus`, que vai como `ogg` (M3). Tipo
 * desconhecido é nulo, e a leitura falha sem ir ao modelo.
 */
export function formatoDoAudio(mime: string | null): string | null {
  const base = tipoBase(mime)
  const formatos: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
    'audio/flac': 'flac',
    'audio/aiff': 'aiff',
    'audio/x-aiff': 'aiff',
  }
  return formatos[base] ?? null
}

const IMAGENS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** O tipo da imagem para o data URI, ou nulo quando não é imagem que o modelo lê. */
export function tipoDaImagem(mime: string | null): string | null {
  const base = tipoBase(mime)
  return IMAGENS.has(base) ? base : null
}

/** Uma linha de `integration_events`, com as chaves da tabela. */
export interface EventoDaLeitura {
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

/** Como o modelo aparece em `integration_events.provider`, o mesmo de `call-classify`. */
export const PROVEDOR_DO_MODELO = 'modelo'

export interface PortaDaMidia {
  readonly buscar: Buscar
  /**
   * Uma leitura pelo modelo da tarefa, já resolvido pela conta. Devolve também
   * o identificador do modelo, para o registro.
   */
  lerComModelo(
    contaId: string,
    tarefa: MidiaLida,
    pedido: { readonly instrucao: string; readonly conteudo: ConteudoDaMidia; readonly maxTokens: number },
  ): Promise<RespostaDoModelo & { readonly modelo: string }>
  gravarLeitura(contaId: string, mensagemId: string, estado: 'lida' | 'falhou', texto: string | null): Promise<void>
  registrarEvento(evento: EventoDaLeitura): Promise<void>
}

export interface PedidoDaLeitura {
  readonly contaId: string
  readonly mensagemId: string
  readonly midia: MidiaLida
  readonly anexo: AnexoRecebido | null
}

export type DesfechoDaLeitura =
  | 'lida'
  | 'sem_anexo'
  | 'endereco_invalido'
  | 'grande_demais'
  | 'falha_no_download'
  | 'formato_nao_lido'
  | 'modelo_falhou'
  | 'nao_entendeu'

/** O texto do modelo, limpo, ou nulo quando é a marca de inaudível ou vazio. */
export function leituraAproveitavel(texto: string | null | undefined): string | null {
  const limpo = (texto ?? '').trim()
  if (limpo === '' || limpo.toLowerCase().replace(/[\s.]/g, '') === MARCA_DE_INAUDIVEL) return null
  return limpo.slice(0, TAMANHO_MAXIMO_DA_LEITURA)
}

/**
 * Lê a mídia de uma mensagem e grava o resultado. Nunca levanta por falha de
 * download ou de modelo: o que dá errado vira `falhou` e a assistente pede para
 * repetir. Levanta só se a gravação falhar, e aí a leitura pendente vence pela
 * validade.
 */
export async function lerMidiaDaMensagem(pedido: PedidoDaLeitura, porta: PortaDaMidia): Promise<DesfechoDaLeitura> {
  const falhar = async (desfecho: DesfechoDaLeitura): Promise<DesfechoDaLeitura> => {
    await porta.gravarLeitura(pedido.contaId, pedido.mensagemId, 'falhou', null)
    return desfecho
  }
  if (pedido.anexo === null) return await falhar('sem_anexo')

  const download = await baixarMidia(pedido.anexo.url, porta.buscar)
  if (!download.ok) return await falhar(download.motivo)

  // O tipo que a Z-API declarou vale mais que o do armazenamento, que às vezes
  // responde `application/octet-stream`.
  const mime = pedido.anexo.mime ?? download.mime
  let conteudo: ConteudoDaMidia
  if (pedido.midia === 'audio') {
    const formato = formatoDoAudio(mime)
    if (formato === null) return await falhar('formato_nao_lido')
    conteudo = { tipo: 'audio', base64: paraBase64(download.bytes), formato }
  } else {
    const tipo = tipoDaImagem(mime)
    if (tipo === null) return await falhar('formato_nao_lido')
    conteudo = { tipo: 'imagem', dataUri: `data:${tipo};base64,${paraBase64(download.bytes)}` }
  }

  const instrucao = pedido.midia === 'audio' ? INSTRUCAO_DA_TRANSCRICAO : INSTRUCAO_DA_DESCRICAO
  let resposta: RespostaDoModelo & { readonly modelo: string }
  try {
    resposta = await porta.lerComModelo(pedido.contaId, pedido.midia, { instrucao, conteudo, maxTokens: TOKENS_DA_LEITURA })
  } catch {
    // A resolução do modelo falhou no banco: é falha da leitura, e a resposta
    // segue pedindo para repetir em vez de ficar pendente.
    return await falhar('modelo_falhou')
  }

  try {
    await porta.registrarEvento({
      account_id: pedido.contaId,
      direction: 'outbound',
      provider: PROVEDOR_DO_MODELO,
      endpoint: resposta.endpoint ?? 'api/v1/chat/completions',
      // A instrução sob `prompt`, que o gatilho redige. Nem a mídia nem o
      // texto derivado entram: o registro diz quanto custou, não o que foi dito.
      request: {
        model: resposta.modelo,
        tarefa: pedido.midia,
        mime: tipoBase(mime) || null,
        bytes: download.bytes.byteLength,
        prompt: instrucao,
      },
      response: {
        ok: resposta.ok,
        codigo: resposta.codigo ?? null,
        tokens_de_entrada: resposta.tokensDeEntrada ?? null,
        tokens_de_saida: resposta.tokensDeSaida ?? null,
      },
      status_code: resposta.status ?? null,
      latency_ms: resposta.latenciaMs ?? null,
      correlation_id: `whatsapp:${pedido.mensagemId}`,
    })
  } catch {
    // Observabilidade perdida não derruba a leitura.
  }

  if (!resposta.ok) return await falhar('modelo_falhou')
  const texto = leituraAproveitavel(resposta.texto)
  if (texto === null) return await falhar('nao_entendeu')
  await porta.gravarLeitura(pedido.contaId, pedido.mensagemId, 'lida', texto)
  return 'lida'
}

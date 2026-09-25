// O dialeto da Z-API, num arquivo só.
//
// É o único lugar do produto com os nomes da Z-API: endereço da instância,
// cabeçalho de segurança, corpo do envio, forma do webhook de recebidas e do
// de status, e a leitura do estado da instância. O resto do canal (motor,
// bordas) fala em português e recebe daqui a mensagem já lida. Trocar de
// provedor de WhatsApp é trocar este arquivo e as fixtures dele.
//
// **O que é suposição.** A Z-API documenta o formato em
// developer.z-api.io, e o que este módulo lê está listado em
// `SUPOSICOES_DA_ZAPI` com a razão. As fixtures de `zapi-exemplos.ts` são os
// exemplos daquela documentação, e a conferência contra uma instância de
// verdade é do degrau 3: nenhum teste do laço chama a rede.
//
// **Credencial da conta, nunca da instalação.** A instância, o token dela e o
// token de segurança (`Client-Token`) vêm do cofre da conta
// (`whatsapp` / `instance_id`, `token`, `client_token`).
//
// Módulo portável: sem Deno, sem rede. Quem busca é o adaptador.

import type { EnvelopeDoProvedor } from '../provedor/resposta.ts'
import { normalizarTelefone } from '../telefone.ts'

/** O id do provedor no catálogo e no cofre. */
export const PROVEDOR_DO_WHATSAPP = 'whatsapp'

/** As três chaves do cofre. */
export const CHAVES_DA_ZAPI = ['instance_id', 'token', 'client_token'] as const
export type ChaveDaZapi = (typeof CHAVES_DA_ZAPI)[number]

export type CredenciaisDaZapi = Readonly<Record<ChaveDaZapi, string>>

export const URL_DA_ZAPI = 'https://api.z-api.io'

/** O que este módulo assume da Z-API, para conferir no degrau 3. */
export const SUPOSICOES_DA_ZAPI = [
  'Z1: base https://api.z-api.io/instances/{instancia}/token/{token}/ e cabeçalho Client-Token com o token de segurança da conta.',
  'Z2: POST send-text com { phone, message }, phone só com dígitos e o código do país; a resposta traz zaapId e messageId.',
  'Z3: o webhook de recebidas manda type ReceivedCallback com phone, fromMe, isGroup, messageId, momment (ms), senderName e text.message; mídia chega em audio, image, video, document, sticker, location ou contact.',
  'Z4: o webhook não é assinado e não aceita cabeçalho próprio: a autenticação é pelo endereço cadastrado.',
  'Z5: PUT update-webhook-received e PUT update-webhook-message-status com { value: endereço } cadastram os dois webhooks.',
  'Z6: o status chega como type MessageStatusCallback com status SENT, RECEIVED, READ ou PLAYED e ids com os messageId.',
  'Z7: GET status devolve { connected, smartphoneConnected, error }; connected falso é instância sem sessão, que se resolve lendo o QR code.',
  'Z8: phone de grupo termina em -group e isGroup vem verdadeiro; isNewsletter e broadcast também não são conversa com lead.',
  'Z9: a mídia recebida traz o arquivo por URL e o tipo em mimeType: audio { audioUrl, mimeType "audio/ogg; codecs=opus", ptt, seconds }, image { imageUrl, mimeType, caption }, video { videoUrl, caption, mimeType }, document { documentUrl, fileName, mimeType }, sticker { stickerUrl, mimeType }. A URL é baixável sem cabeçalho nosso e vale por 30 dias no armazenamento da Z-API.',
] as const

export interface PedidoHttp {
  readonly url: string
  readonly init: RequestInit
  /** O caminho sem a base nem as credenciais, para o registro de integração. */
  readonly endpoint: string
}

function base(credenciais: CredenciaisDaZapi): string {
  return `${URL_DA_ZAPI}/instances/${encodeURIComponent(credenciais.instance_id.trim())}/token/${encodeURIComponent(credenciais.token.trim())}`
}

function cabecalhos(credenciais: CredenciaisDaZapi): Record<string, string> {
  return { 'client-token': credenciais.client_token.trim(), 'content-type': 'application/json' }
}

/** O número como a Z-API o quer: só dígitos, com o país. */
export function telefoneDaZapi(e164: string): string {
  return e164.replace(/\D/g, '')
}

export function pedidoDeEnvioDeTexto(credenciais: CredenciaisDaZapi, e164: string, texto: string): PedidoHttp {
  return {
    url: `${base(credenciais)}/send-text`,
    init: {
      method: 'POST',
      headers: cabecalhos(credenciais),
      body: JSON.stringify({ phone: telefoneDaZapi(e164), message: texto }),
    },
    endpoint: 'send-text',
  }
}

export function pedidoDoEstado(credenciais: CredenciaisDaZapi): PedidoHttp {
  return { url: `${base(credenciais)}/status`, init: { method: 'GET', headers: cabecalhos(credenciais) }, endpoint: 'status' }
}

/** Os dois cadastros de webhook, na ordem: recebidas, depois status. */
export function pedidosDosWebhooks(credenciais: CredenciaisDaZapi, endereco: string): readonly PedidoHttp[] {
  return (['update-webhook-received', 'update-webhook-message-status'] as const).map((caminho) => ({
    url: `${base(credenciais)}/${caminho}`,
    init: { method: 'PUT', headers: cabecalhos(credenciais), body: JSON.stringify({ value: endereco }) },
    endpoint: caminho,
  }))
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null
}

function texto(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}

/** O id da mensagem enviada, lido do corpo da resposta. Nulo quando não veio. */
export function lerIdDoEnvio(corpo: unknown): string | null {
  const dado = objeto(corpo)
  if (dado === null) return null
  return texto(dado.messageId) ?? texto(dado.id) ?? texto(dado.zaapId)
}

/** O código que a Z-API mandou num erro, para `erros.ts` traduzir. */
export function lerCodigoDoErro(corpo: unknown): string | null {
  const dado = objeto(corpo)
  if (dado === null) return null
  return texto(dado.error) ?? texto(dado.message) ?? texto(dado.code)
}

// O que chega ---------------------------------------------------------------------

export type TipoDeMidia = 'audio' | 'imagem' | 'video' | 'documento' | 'figurinha' | 'localizacao' | 'contato' | 'outro'

/**
 * Os campos de mídia da Z-API, o nome que o banco guarda
 * (`whatsapp_messages.media_kind`) e o campo da URL do arquivo (Z9), quando há.
 */
const MIDIAS: ReadonlyArray<readonly [string, TipoDeMidia, string | null]> = [
  ['audio', 'audio', 'audioUrl'],
  ['image', 'imagem', 'imageUrl'],
  ['video', 'video', 'videoUrl'],
  ['document', 'documento', 'documentUrl'],
  ['sticker', 'figurinha', 'stickerUrl'],
  ['location', 'localizacao', null],
  ['contact', 'contato', null],
]

/** O arquivo da mídia recebida: onde baixar e o tipo que a Z-API declarou. */
export interface AnexoRecebido {
  readonly url: string
  /** `audio/ogg; codecs=opus`, `image/jpeg`... Nulo quando não veio. */
  readonly mime: string | null
}

export type MotivoParaIgnorar =
  | 'nao_e_mensagem'
  | 'de_mim'
  | 'grupo'
  | 'sem_id'
  | 'telefone_invalido'
  | 'vazia'

export type MensagemRecebida =
  | { readonly tipo: 'ignorar'; readonly motivo: MotivoParaIgnorar }
  | {
      readonly tipo: 'mensagem'
      readonly telefone: string
      readonly idDoProvedor: string
      readonly nomeDoRemetente: string | null
      /** O texto, ou a legenda da mídia. Vazio quando não há nem um nem outro. */
      readonly texto: string
      readonly midia: TipoDeMidia | null
      /** O arquivo da mídia, quando a Z-API mandou a URL. Nulo para texto. */
      readonly anexo: AnexoRecebido | null
      /** Quando o WhatsApp registrou a mensagem, em ISO. Nulo quando não veio. */
      readonly instante: string | null
    }

/**
 * Lê o corpo do webhook de recebidas. Nada aqui levanta: corpo estranho é
 * `ignorar`, e quem chama responde 200 para a Z-API não reenviar o que nunca
 * vai passar a ser legível.
 */
export function lerMensagemRecebida(corpo: unknown): MensagemRecebida {
  const dado = objeto(corpo)
  if (dado === null) return { tipo: 'ignorar', motivo: 'nao_e_mensagem' }
  const tipo = texto(dado.type)
  if (tipo !== null && tipo !== 'ReceivedCallback') return { tipo: 'ignorar', motivo: 'nao_e_mensagem' }
  if (dado.fromMe === true) return { tipo: 'ignorar', motivo: 'de_mim' }

  const bruto = texto(dado.phone) ?? ''
  if (dado.isGroup === true || dado.isNewsletter === true || dado.broadcast === true || /-group$|@g\.us$|@newsletter$/.test(bruto)) {
    return { tipo: 'ignorar', motivo: 'grupo' }
  }

  const id = texto(dado.messageId)
  if (id === null) return { tipo: 'ignorar', motivo: 'sem_id' }

  const telefone = normalizarTelefone(`+${bruto.replace(/\D/g, '')}`)
  if (!telefone.ok) return { tipo: 'ignorar', motivo: 'telefone_invalido' }

  const mensagem = texto(objeto(dado.text)?.message) ?? ''
  let midia: TipoDeMidia | null = null
  let legenda = ''
  let anexo: AnexoRecebido | null = null
  for (const [campo, nome, campoDaUrl] of MIDIAS) {
    const conteudo = objeto(dado[campo])
    if (conteudo !== null) {
      midia = nome
      legenda = texto(conteudo.caption) ?? ''
      const url = campoDaUrl === null ? null : texto(conteudo[campoDaUrl])
      if (url !== null) anexo = { url, mime: texto(conteudo.mimeType) }
      break
    }
  }
  if (midia === null && mensagem === '') {
    // Enquete, botão, reação: conteúdo num objeto que não conhecemos vira
    // `outro`, e a assistente pede texto. Sem objeto nenhum não há o que ler.
    const sobra = Object.keys(dado).some((chave) => chave !== 'text' && objeto(dado[chave]) !== null)
    if (!sobra) return { tipo: 'ignorar', motivo: 'vazia' }
    midia = 'outro'
  }

  const momento = typeof dado.momment === 'number' && Number.isFinite(dado.momment) ? new Date(dado.momment) : null

  return {
    tipo: 'mensagem',
    telefone: telefone.e164,
    idDoProvedor: id,
    nomeDoRemetente: texto(dado.senderName) ?? texto(dado.chatName),
    texto: midia === null ? mensagem : legenda || mensagem,
    midia,
    anexo,
    instante: momento !== null && !Number.isNaN(momento.getTime()) ? momento.toISOString() : null,
  }
}

export type EstadoDaEntrega = 'enviada' | 'entregue' | 'lida'

const ESTADOS_DA_ENTREGA: ReadonlyMap<string, EstadoDaEntrega> = new Map([
  ['SENT', 'enviada'],
  ['RECEIVED', 'entregue'],
  ['DELIVERED', 'entregue'],
  ['READ', 'lida'],
  ['PLAYED', 'lida'],
])

export interface StatusDeMensagens {
  readonly estado: EstadoDaEntrega
  readonly ids: readonly string[]
}

/** Lê o webhook de status. Nulo quando não é status que o banco guarda. */
export function lerStatusDeMensagens(corpo: unknown): StatusDeMensagens | null {
  const dado = objeto(corpo)
  if (dado === null || texto(dado.type) !== 'MessageStatusCallback') return null
  const estado = ESTADOS_DA_ENTREGA.get((texto(dado.status) ?? '').toUpperCase())
  if (estado === undefined) return null
  const ids = (Array.isArray(dado.ids) ? dado.ids : [dado.messageId, dado.id])
    .map(texto)
    .filter((id): id is string => id !== null)
  return ids.length === 0 ? null : { estado, ids }
}

/** Separa os dois webhooks que chegam no mesmo endereço. */
export function eStatusDeMensagem(corpo: unknown): boolean {
  return texto(objeto(corpo)?.type) === 'MessageStatusCallback'
}

// O estado da instância -----------------------------------------------------------

export interface EstadoDaInstancia {
  readonly conectada: boolean
  readonly celularConectado: boolean | null
}

export function lerEstadoDaInstancia(corpo: unknown): EstadoDaInstancia | null {
  const dado = objeto(corpo)
  if (dado === null || typeof dado.connected !== 'boolean') return null
  return {
    conectada: dado.connected,
    celularConectado: typeof dado.smartphoneConnected === 'boolean' ? dado.smartphoneConnected : null,
  }
}

/** O código que a instância sem sessão produz, lido por `erros.ts`. */
export const CODIGO_DA_INSTANCIA_DESCONECTADA = 'whatsapp_not_connected'

/** O envelope de um envio. */
export interface EnvioDaZapi extends EnvelopeDoProvedor {
  readonly idDoProvedor?: string | null
}

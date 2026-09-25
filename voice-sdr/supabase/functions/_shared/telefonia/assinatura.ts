// A assinatura com que a telefonia prova que o pedido é dela.
//
// `inbound-twiml` chega sem sessão: quem a chama é a operadora, no meio de uma
// ligação em curso, e não há usuário nenhum do outro lado. O que autentica é a
// assinatura que a telefonia calcula sobre o pedido inteiro com o token da
// conta dela — o mesmo segredo que `integrations-status` chama de `auth_token`.
//
// A receita é a do Twilio, e está aqui escrita porque é ela que o webhook de
// voz assina: junta-se a URL chamada com **cada par do corpo**, em ordem
// alfabética de nome, nome colado no valor e sem separador nenhum; disso sai
// um HMAC-SHA1 com o token, em base64. Nome e valor colados é o detalhe que
// parece errado e não é: `To+5548...` e `To` + `+5548...` produzem o mesmo
// texto, e é de propósito que a ordem seja do nome e não da chegada — corpo de
// formulário não promete ordem nenhuma.
//
// **Por que módulo, e não função dentro de `inbound-twiml`.** O webhook de
// estado da chamada e o de gravação (F2 adiante) são assinados do mesmo jeito.
// Duas cópias de uma conferência de assinatura divergem no primeiro ajuste, e a
// que divergir para menos passa a aceitar pedido de quem não é a operadora sem
// avisar ninguém — que é o pior defeito possível numa função que atende ligação.
//
// Módulo portável: sem Deno, sem rede, sem banco. `crypto.subtle` é Web Crypto,
// e existe tanto no Deno da borda quanto no Node dos testes.

import { hashesIguais } from '../hash-de-segredo.ts'

/**
 * O formato que uma assinatura tem: HMAC-SHA1 são 20 bytes, que em base64 dão
 * 27 caracteres mais o `=` de enchimento.
 *
 * Conferir o formato antes de calcular é a mesma regra de `lead-intake`:
 * malformado morre antes de tocar em qualquer coisa. A diferença de tempo entre
 * recusar por formato e recusar por valor não conta nada sobre o token — o que
 * precisa ser indistinguível é assinatura errada de assinatura ausente, e as
 * duas saem pela mesma porta em quem chama.
 */
const FORMATO_DA_ASSINATURA = /^[A-Za-z0-9+/]{27}=$/

/** Verdadeiro para o que tem cara de assinatura da telefonia. */
export function pareceAssinaturaDaTelefonia(valor: string): boolean {
  return FORMATO_DA_ASSINATURA.test(valor)
}

/**
 * Duas assinaturas são iguais, em tempo que não depende de onde divergem.
 *
 * Delega em `hashesIguais` em vez de repetir o laço: a receita do tempo
 * constante tem um dono só neste repositório, e uma segunda cópia dela é uma
 * segunda chance de alguém trocar o laço por `===` numa refatoração. O nome de
 * lá fala de hash porque foi lá que a regra nasceu; o que ela compara é texto
 * de mesmo comprimento, que é exatamente o caso aqui.
 */
export function assinaturasIguais(a: string, b: string): boolean {
  return hashesIguais(a, b)
}

/** Um par do corpo do formulário, como a telefonia o mandou. */
export type ParDoCorpo = readonly [nome: string, valor: string]

/**
 * A assinatura que a telefonia calcularia para este pedido, em base64.
 *
 * Levanta quando o token está vazio: assinar com token vazio produz um valor
 * perfeitamente válido, e ele casaria com o que um atacante que soubesse do
 * buraco calculasse. Falta de configuração é recusa em quem chama, nunca uma
 * assinatura que confere por acidente.
 */
export async function assinaturaDaTelefonia(
  token: string,
  url: string,
  pares: readonly ParDoCorpo[],
): Promise<string> {
  if (token.length === 0) throw new Error('token da telefonia vazio')

  // Ordem do nome, e não da chegada. `sort` sem comparador ordena por unidade
  // de código, que é o que a telefonia faz; `localeCompare` depende do ICU da
  // máquina e faria a mesma conta dar dois resultados em dois ambientes.
  const ordenados = [...pares].sort(([um], [outro]) => (um < outro ? -1 : um > outro ? 1 : 0))

  let texto = url
  for (const [nome, valor] of ordenados) texto += nome + valor

  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(token),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const resumo = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto))

  let binario = ''
  for (const byte of new Uint8Array(resumo)) binario += String.fromCharCode(byte)
  return btoa(binario)
}

export interface PedidoAssinado {
  /** O token da conta na telefonia. Vazio ou ausente reprova sempre. */
  readonly token: string | null
  /** A URL exata que a telefonia chamou, com a consulta que ela mandou. */
  readonly url: string
  /** Os pares do corpo do formulário, na ordem em que chegaram. */
  readonly pares: readonly ParDoCorpo[]
  /** O cabeçalho `X-Twilio-Signature`, quando houver. */
  readonly assinatura: string | null
}

/**
 * Confere a assinatura e devolve verdadeiro só quando ela é da telefonia.
 *
 * Os três casos que interessam — ausente, malformada e inválida — devolvem
 * falso, e quem chama devolve o **mesmo** 401 para os três. Frases diferentes
 * contariam a quem tenta que uma delas chegou perto.
 */
export async function conferirAssinaturaDaTelefonia(pedido: PedidoAssinado): Promise<boolean> {
  const token = pedido.token?.trim() ?? ''
  if (token.length === 0) return false

  const recebida = pedido.assinatura?.trim() ?? ''
  if (!pareceAssinaturaDaTelefonia(recebida)) return false

  const esperada = await assinaturaDaTelefonia(token, pedido.url, pedido.pares)
  return assinaturasIguais(recebida, esperada)
}

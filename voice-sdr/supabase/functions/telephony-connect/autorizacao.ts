// A autorização de telefonia, na parte que decide algo.
//
// O provedor devolve o cliente ao nosso endereço com o identificador da
// subconta na barra de endereço. Isso significa que **a única coisa entre um
// estranho e uma conta conectada é o que nós mesmos pusermos ali** — se
// aceitássemos o retorno pelo que ele diz, qualquer um abriria nosso endereço
// com `AccountSid=...&conta=<id alheio>` e ligaria a telefonia de outra
// empresa à conta dele.
//
// Por isso o retorno carrega um `state` que nós emitimos antes de mandar o
// cliente para lá, assinado com a chave do servidor e com validade curta. Ele
// diz três coisas: qual conta, quem clicou, e quando. Sem assinatura válida, o
// retorno é recusado sem tocar no banco.
//
// Módulo portável: `crypto.subtle` é Web Crypto e existe no Deno da borda e no
// Node dos testes. Sem Deno, sem rede, sem banco.

/** Quanto tempo o cliente tem entre clicar em conectar e voltar autorizado. */
export const VALIDADE_DO_ESTADO_MS = 15 * 60 * 1000

/** O que o estado assinado carrega. */
export interface EstadoDeAutorizacao {
  readonly contaId: string
  readonly usuarioId: string
  readonly emitidoEm: number
}

export type MotivoDeRecusa =
  | 'estado_ausente'
  | 'estado_malformado'
  | 'assinatura_invalida'
  | 'estado_expirado'
  | 'conta_do_provedor_ausente'
  | 'conta_do_provedor_malformada'

export type LeituraDoEstado =
  | { ok: true; estado: EstadoDeAutorizacao }
  | { ok: false; motivo: MotivoDeRecusa }

export type LeituraDoRetorno =
  | { ok: true; contaId: string; usuarioId: string; contaDoProvedor: string }
  | { ok: false; motivo: MotivoDeRecusa }

const TEXTO = new TextEncoder()

/**
 * O identificador de subconta da Twilio: `AC` seguido de 32 hexadecimais. A
 * conferência é de forma, não de existência — quem sabe se a subconta existe é
 * o provedor, e a primeira chamada real dirá. O que esta régua evita é gravar
 * lixo vindo da barra de endereço.
 */
const CONTA_DO_PROVEDOR = /^AC[0-9a-fA-F]{32}$/

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const vista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bruto = ''
  for (const byte of vista) bruto += String.fromCharCode(byte)
  return btoa(bruto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deBase64url(valor: string): string {
  const preenchido = valor.replace(/-/g, '+').replace(/_/g, '/')
  return atob(preenchido + '='.repeat((4 - (preenchido.length % 4)) % 4))
}

async function assinar(carga: string, chave: string): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    TEXTO.encode(chave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return base64url(await crypto.subtle.sign('HMAC', material, TEXTO.encode(carga)))
}

/**
 * Comparação em tempo constante. Sair no primeiro byte diferente conta, pelo
 * relógio, quantos bytes o atacante acertou.
 */
function assinaturasConferem(recebida: string, esperada: string): boolean {
  if (recebida.length !== esperada.length) return false
  let diferenca = 0
  for (let i = 0; i < recebida.length; i += 1) {
    diferenca |= recebida.charCodeAt(i) ^ esperada.charCodeAt(i)
  }
  return diferenca === 0
}

/**
 * Emite o estado que acompanha o cliente até o provedor e volta com ele. Quem
 * chama é a interface, antes de abrir o endereço de autorização.
 */
export async function emitirEstado(
  estado: Omit<EstadoDeAutorizacao, 'emitidoEm'>,
  chaveDoServidor: string,
  agora: number = Date.now(),
): Promise<string> {
  const carga = base64url(
    TEXTO.encode(
      JSON.stringify({
        contaId: estado.contaId,
        usuarioId: estado.usuarioId,
        emitidoEm: agora,
      }),
    ),
  )
  return `${carga}.${await assinar(carga, chaveDoServidor)}`
}

/** Confere o estado que voltou do provedor. Nada aqui toca no banco. */
export async function lerEstado(
  valor: string | null | undefined,
  chaveDoServidor: string,
  agora: number = Date.now(),
): Promise<LeituraDoEstado> {
  const bruto = (valor ?? '').trim()
  if (!bruto) return { ok: false, motivo: 'estado_ausente' }

  const partes = bruto.split('.')
  if (partes.length !== 2 || !partes[0] || !partes[1]) {
    return { ok: false, motivo: 'estado_malformado' }
  }
  const [carga, assinatura] = partes as [string, string]

  const esperada = await assinar(carga, chaveDoServidor)
  if (!assinaturasConferem(assinatura, esperada)) {
    return { ok: false, motivo: 'assinatura_invalida' }
  }

  let decodificada: unknown
  try {
    decodificada = JSON.parse(deBase64url(carga))
  } catch {
    return { ok: false, motivo: 'estado_malformado' }
  }

  const { contaId, usuarioId, emitidoEm } = (decodificada ?? {}) as Record<
    string,
    unknown
  >
  if (
    typeof contaId !== 'string' ||
    typeof usuarioId !== 'string' ||
    typeof emitidoEm !== 'number' ||
    !contaId ||
    !usuarioId
  ) {
    return { ok: false, motivo: 'estado_malformado' }
  }

  // Expirado inclui o relógio andando para trás: estado emitido no futuro é
  // tão suspeito quanto estado velho.
  if (agora - emitidoEm > VALIDADE_DO_ESTADO_MS || emitidoEm > agora) {
    return { ok: false, motivo: 'estado_expirado' }
  }

  return { ok: true, estado: { contaId, usuarioId, emitidoEm } }
}

/**
 * A decisão inteira do retorno: confere o estado e a forma do identificador, e
 * devolve o que precisa ser gravado. Quem grava é o adaptador.
 */
export async function lerRetornoDaAutorizacao(
  parametros: { estado?: string | null; contaDoProvedor?: string | null },
  chaveDoServidor: string,
  agora: number = Date.now(),
): Promise<LeituraDoRetorno> {
  const leitura = await lerEstado(parametros.estado, chaveDoServidor, agora)
  if (!leitura.ok) return leitura

  const contaDoProvedor = (parametros.contaDoProvedor ?? '').trim()
  if (!contaDoProvedor) {
    return { ok: false, motivo: 'conta_do_provedor_ausente' }
  }
  if (!CONTA_DO_PROVEDOR.test(contaDoProvedor)) {
    return { ok: false, motivo: 'conta_do_provedor_malformada' }
  }

  return {
    ok: true,
    contaId: leitura.estado.contaId,
    usuarioId: leitura.estado.usuarioId,
    contaDoProvedor,
  }
}

/** O que a pessoa lê quando o retorno é recusado. Em português, como tudo. */
export const FRASES_DE_RECUSA: Record<MotivoDeRecusa, string> = {
  estado_ausente:
    'Este endereço só funciona a partir do botão de conectar na tela de integrações.',
  estado_malformado:
    'O pedido de conexão veio incompleto. Volte à tela de integrações e conecte de novo.',
  assinatura_invalida:
    'Não foi possível confirmar que este pedido partiu daqui. Conecte de novo pela tela de integrações.',
  estado_expirado:
    'O pedido de conexão expirou. Volte à tela de integrações e conecte de novo.',
  conta_do_provedor_ausente:
    'A telefonia não informou qual conta foi autorizada. Tente conectar de novo.',
  conta_do_provedor_malformada:
    'A telefonia informou uma conta em formato desconhecido. Tente conectar de novo.',
}

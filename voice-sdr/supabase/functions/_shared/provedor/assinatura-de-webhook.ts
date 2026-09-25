// A assinatura com que o provedor de voz prova que o webhook é dele.
//
// Dois webhooks nossos chegam do provedor de voz no meio de uma ligação:
// `call-init`, no começo da conversa, e `call-events`, no fim. Nenhum dos dois
// tem sessão — quem chama é o provedor, de servidor para servidor — e a
// credencial dos dois é a mesma: uma assinatura calculada sobre o **corpo cru**
// do pedido, com o segredo de webhook da instalação.
//
// **Por que não é a assinatura de `../telefonia/assinatura.ts`.** Aquela é da
// operadora, cobre URL mais pares de formulário e é HMAC-SHA1; esta é do
// provedor de voz, cobre instante mais corpo JSON e é HMAC-SHA256. São dois
// remetentes diferentes com dois segredos diferentes, e juntá-las num módulo só
// faria a troca do token de um afrouxar a conferência do outro.
//
// **A receita**, escrita porque é ela que o teste segura:
//
// 1. o cabeçalho traz `t=<segundos>,v0=<hexadecimal>`, na ordem em que o
//    provedor os escreve, e a leitura não depende dessa ordem;
// 2. o texto assinado é `<t>.<corpo cru>` — o corpo **byte a byte como chegou**,
//    e nunca o resultado de um `JSON.stringify` do objeto já parseado, que
//    reordena chave e reescreve escape;
// 3. HMAC-SHA256 com o segredo da instalação, em hexadecimal minúsculo;
// 4. comparação em tempo constante, por `hashesIguais`.
//
// **O instante entra na conta de propósito** (R-05). Sem ele, um pedido
// legítimo capturado uma vez valeria para sempre: quem o guardasse poderia
// reenviá-lo meses depois e a assinatura continuaria conferindo. Com o instante
// dentro do texto assinado e uma janela de tolerância, a repetição tardia é
// recusada sem precisar de estado nenhum do nosso lado.
//
// **Ausente, malformada, fora da janela e inválida devolvem o mesmo `false`**, e
// quem chama responde o mesmo 401 para as quatro. Quatro respostas diferentes
// contariam a quem tenta qual das quatro coisas ele acertou.
//
// Módulo portável: sem Deno, sem rede, sem banco. `crypto.subtle` é Web Crypto,
// e existe tanto no Deno da borda quanto no Node dos testes.

import { hashesIguais, pareceHashEmHexadecimal } from '../hash-de-segredo.ts'

/**
 * A janela em que um pedido assinado continua valendo, em segundos.
 *
 * Trinta minutos, e não trinta segundos: o relógio da borda e o do provedor
 * andam separados, e uma janela apertada transformaria um desvio de relógio num
 * webhook de fim de chamada recusado — que é perder a finalização de uma
 * ligação que aconteceu. Trinta minutos é curto o bastante para matar a
 * repetição tardia e largo o bastante para o desvio normal.
 */
export const TOLERANCIA_EM_SEGUNDOS = 30 * 60

/** O prefixo de cada parte do cabeçalho. `v0` é a versão da receita. */
const PREFIXO_DO_INSTANTE = 't='
const PREFIXO_DA_ASSINATURA = 'v0='

/** O cabeçalho já lido em partes. */
export interface AssinaturaDoProvedor {
  /** O instante que o provedor assinou, em segundos desde a época. */
  readonly instante: number
  /** O HMAC em hexadecimal minúsculo, sem o prefixo de versão. */
  readonly valor: string
}

/**
 * O cabeçalho em partes, ou nulo quando ele não tem a forma esperada.
 *
 * A ordem das partes não importa e partes desconhecidas são ignoradas: o
 * provedor pode acrescentar uma `v1` no dia em que trocar a receita, e recusar o
 * cabeçalho inteiro por causa dela derrubaria toda ligação da instalação num
 * dia em que nada nosso mudou.
 */
export function lerAssinaturaDoProvedor(cabecalho: string | null): AssinaturaDoProvedor | null {
  const texto = cabecalho?.trim() ?? ''
  if (texto === '') return null

  let instante: number | null = null
  let valor: string | null = null

  for (const parte of texto.split(',')) {
    const pedaco = parte.trim()
    if (pedaco.startsWith(PREFIXO_DO_INSTANTE)) {
      const digitos = pedaco.slice(PREFIXO_DO_INSTANTE.length)
      if (!/^[0-9]{1,15}$/.test(digitos)) return null
      instante = Number(digitos)
    } else if (pedaco.startsWith(PREFIXO_DA_ASSINATURA)) {
      valor = pedaco.slice(PREFIXO_DA_ASSINATURA.length)
    }
  }

  if (instante === null || valor === null) return null
  if (!pareceHashEmHexadecimal(valor)) return null
  return { instante, valor }
}

/**
 * A assinatura que o provedor calcularia para este corpo neste instante, em
 * hexadecimal minúsculo.
 *
 * Levanta com segredo vazio pela razão de `assinaturaDaTelefonia`: assinar com
 * segredo em branco produz um valor perfeitamente válido, igual em todas as
 * instalações que também esqueceram a variável, e ele conferiria com o que
 * calculasse quem soubesse do buraco.
 */
export async function assinaturaDoProvedor(
  segredo: string,
  instante: number,
  corpo: string,
): Promise<string> {
  if (segredo.length === 0) throw new Error('segredo de webhook do provedor vazio')

  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const resumo = await crypto.subtle.sign(
    'HMAC',
    material,
    new TextEncoder().encode(`${instante}.${corpo}`),
  )
  return [...new Uint8Array(resumo)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** O cabeçalho pronto, como o provedor o escreve. Existe para o teste montá-lo. */
export async function cabecalhoAssinado(
  segredo: string,
  instante: number,
  corpo: string,
): Promise<string> {
  const valor = await assinaturaDoProvedor(segredo, instante, corpo)
  return `${PREFIXO_DO_INSTANTE}${instante},${PREFIXO_DA_ASSINATURA}${valor}`
}

/**
 * Por quanto tempo o segredo anterior continua conferindo depois da rotação, em
 * segundos (R-07).
 *
 * Vinte e quatro horas. Trocar o segredo de webhook do provedor não é um
 * instante: a variável muda de um lado, a configuração muda do outro, e entre
 * as duas há conversas em curso cujo webhook de fim ainda vai chegar assinado
 * com o segredo velho. Sem a janela, rotacionar o segredo perderia a
 * finalização de toda ligação que estivesse no ar — e como a perda é silenciosa
 * (um 401 que ninguém lê), o time aprenderia a não rotacionar.
 *
 * A janela conta do **instante da rotação**, e não do instante do pedido: um
 * segredo anterior sem carimbo de rotação não vale nunca, porque valeria para
 * sempre.
 */
export const JANELA_DE_ROTACAO_EM_SEGUNDOS = 24 * 60 * 60

/**
 * O instante da rotação, lido da variável de ambiente, em segundos desde a
 * época; nulo quando ela está ausente ou ilegível.
 *
 * Aceita data ISO 8601 com fuso (`2026-09-22T13:00:00Z`), que é o que alguém
 * escreve à mão no painel de variáveis. Data sem fuso é recusada: lida no fuso
 * de quem roda, ela moveria a janela em até um dia inteiro, e a janela inteira
 * é um dia. Ilegível desliga o segredo anterior, que é o lado seguro do erro.
 */
export function lerInstanteDaRotacao(texto: string | null | undefined): number | null {
  const valor = texto?.trim() ?? ''
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(valor)) return null
  const milissegundos = Date.parse(valor)
  return Number.isFinite(milissegundos) ? Math.floor(milissegundos / 1000) : null
}

export interface PedidoAssinadoPeloProvedor {
  /** O segredo de webhook da instalação. Vazio ou ausente reprova sempre. */
  readonly segredo: string | null
  /**
   * O segredo de antes da rotação, quando há uma em curso (R-07). Só confere
   * dentro de `JANELA_DE_ROTACAO_EM_SEGUNDOS` contados de `rotacionadoEmSegundos`.
   */
  readonly segredoAnterior?: string | null
  /**
   * Quando a rotação aconteceu, em segundos desde a época. Ausente **desliga**
   * o segredo anterior: sem saber quando a troca foi, a janela não tem começo e
   * o segredo velho continuaria valendo indefinidamente, que é o contrário do
   * que rotacionar quer dizer.
   */
  readonly rotacionadoEmSegundos?: number | null
  /** O corpo cru do pedido, byte a byte como chegou. */
  readonly corpo: string
  /** O cabeçalho da assinatura, quando houver. */
  readonly assinatura: string | null
  /** O relógio de quem confere, em segundos desde a época. */
  readonly agoraEmSegundos: number
}

/**
 * Confere a assinatura e devolve verdadeiro só quando ela é do provedor.
 *
 * Os quatro casos — ausente, malformada, fora da janela e inválida — devolvem
 * falso, e quem chama devolve o **mesmo** 401 para os quatro.
 *
 * Durante a janela de rotação o segredo anterior também confere, e o pedido
 * assinado com ele é indistinguível de um assinado com o atual: quem manda o
 * webhook não sabe que rotacionamos, e não deveria mesmo saber.
 */
export async function conferirAssinaturaDoProvedor(
  pedido: PedidoAssinadoPeloProvedor,
): Promise<boolean> {
  const segredo = pedido.segredo?.trim() ?? ''
  if (segredo.length === 0) return false

  const lida = lerAssinaturaDoProvedor(pedido.assinatura)
  if (!lida) return false

  // A janela vale nos dois sentidos: o relógio do provedor pode estar adiantado
  // em relação ao nosso, e recusar o futuro próximo derrubaria pedido legítimo
  // por desvio de relógio, que é o caso comum.
  if (Math.abs(pedido.agoraEmSegundos - lida.instante) > TOLERANCIA_EM_SEGUNDOS) return false

  const esperada = await assinaturaDoProvedor(segredo, lida.instante, pedido.corpo)
  if (hashesIguais(lida.valor, esperada)) return true

  const anterior = pedido.segredoAnterior?.trim() ?? ''
  if (anterior.length === 0 || anterior === segredo) return false

  const rotacionadoEm = pedido.rotacionadoEmSegundos
  if (typeof rotacionadoEm !== 'number' || !Number.isFinite(rotacionadoEm)) return false
  // Só para a frente: rotação no futuro é variável mal escrita, e tratá-la como
  // janela aberta faria um carimbo errado ressuscitar o segredo velho.
  const desdeARotacao = pedido.agoraEmSegundos - rotacionadoEm
  if (desdeARotacao < 0 || desdeARotacao > JANELA_DE_ROTACAO_EM_SEGUNDOS) return false

  const comOAnterior = await assinaturaDoProvedor(anterior, lida.instante, pedido.corpo)
  return hashesIguais(lida.valor, comOAnterior)
}

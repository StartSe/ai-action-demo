// O documento de atendimento da telefonia, e só ele.
//
// É o único arquivo do produto com os nomes que a telefonia usa — `<Response>`,
// `<Say>`, `<Dial>`, `<Hangup>` —, pela mesma razão de
// `agent-publish/formato-do-provedor.ts`: quem decide o que a linha faz é
// `atendimento.ts`, e quem sabe escrever isso no dialeto da operadora é aqui.
// Trocar de telefonia mexe neste arquivo e em mais nenhum.
//
// Módulo portável: sem Deno, sem rede, sem banco.

/** O tipo do corpo. A telefonia recusa o documento com qualquer outro. */
export const TIPO_DO_DOCUMENTO = 'application/xml; charset=utf-8'

/**
 * A voz que lê a frase na linha.
 *
 * **Não é a voz da conta.** A voz escolhida na tela de identidade é do provedor
 * de voz e só existe dentro do agente; aqui o agente não está em jogo, e o que
 * fala é o sintetizador da própria telefonia. Uma neural em português do Brasil
 * é o mais próximo que dá: ler o recado com a voz padrão em inglês soaria como
 * engano de número.
 */
export const VOZ_DA_TELEFONIA = 'Polly.Camila-Neural'

/** O idioma da leitura. Sem ele a telefonia lê português com fonética inglesa. */
export const IDIOMA_DA_TELEFONIA = 'pt-BR'

/**
 * Quantos segundos chamar antes de desistir do encaminhamento. Vinte é o tempo
 * de cinco toques: menos que isso desliga em cima de quem ia atender, e mais
 * que isso deixa quem ligou ouvindo chamada que não vai ser atendida.
 */
export const ESPERA_DO_ENCAMINHAMENTO_S = 20

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

/**
 * Escapa o que vai para dentro do XML.
 *
 * Não é zelo: `agents.company_name` é texto que a conta escreve, e uma empresa
 * chamada "Silva & Filhos" produz um documento inválido, que a telefonia recusa
 * inteiro — a ligação cai no tom de erro da operadora e ninguém liga uma coisa
 * à outra. O `&` é o caso real; os outros quatro vão junto porque a lista
 * parcial é a que se descobre em produção.
 */
export function escaparXml(texto: string): string {
  return texto.replace(/[&<>"']/g, (caractere) => ESCAPES[caractere] ?? caractere)
}

function say(frase: string): string {
  return `<Say language="${IDIOMA_DA_TELEFONIA}" voice="${VOZ_DA_TELEFONIA}">${escaparXml(frase)}</Say>`
}

function documento(corpo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${corpo}</Response>`
}

/**
 * Fala as frases e encerra. É o recado de `voicemail` e é também o que quem
 * ligou ouve quando a linha não foi reconhecida.
 *
 * O `<Hangup/>` é explícito de propósito: sem ele a telefonia encerra do mesmo
 * jeito, mas o documento passa a depender de um padrão em vez de dizer o que
 * quer, e o dia em que a operadora mudar o padrão é o dia em que a linha ficar
 * muda no ar por mais alguns segundos.
 */
export function documentoDeEncerramento(frases: readonly string[]): string {
  return documento(`${frases.map(say).join('')}<Hangup/>`)
}

export interface Encaminhamento {
  /** Para onde ligar, em E.164. */
  readonly destino: string
  /**
   * O número da própria linha, que vai como identificador de quem chama.
   *
   * **Não é o número de quem ligou**, e é escolha. Repassar o identificador
   * original mostraria a quem atende de quem é a ligação, que é o que se
   * gostaria — mas a telefonia só deixa usar como identificador um número que a
   * conta possui ou verificou, e um número qualquer vindo da rede não é nem um
   * nem outro: o encaminhamento cairia com recusa da operadora. Quem atende vê
   * a linha da empresa, e sabe que é ligação encaminhada.
   */
  readonly identificador: string
  /** O que é dito antes de a discagem começar. Lista vazia transfere calado. */
  readonly frases: readonly string[]
}

/** Avisa e transfere (`forward`, RF-409). */
export function documentoDeEncaminhamento(encaminhamento: Encaminhamento): string {
  const aviso = encaminhamento.frases.filter((frase) => frase.trim()).map(say).join('')
  // `answerOnBridge` mantém o toque de chamada no ouvido de quem ligou até a
  // outra ponta atender. Sem ele, quem ligou ouve silêncio depois do aviso e
  // desliga achando que a ligação caiu.
  const discagem =
    `<Dial timeout="${ESPERA_DO_ENCAMINHAMENTO_S}" answerOnBridge="true"` +
    ` callerId="${escaparXml(encaminhamento.identificador)}">` +
    `${escaparXml(encaminhamento.destino)}</Dial>`
  return documento(`${aviso}${discagem}`)
}

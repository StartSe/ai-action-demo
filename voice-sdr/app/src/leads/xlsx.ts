// Ler a planilha do Excel (.xlsx) no navegador, sem biblioteca (D-08).
//
// O `.xlsx` é um zip com XML dentro. As duas peças que isso pede o navegador
// já tem: `DecompressionStream('deflate-raw')` abre as entradas comprimidas, e
// `DOMParser` lê o XML. O que fica aqui é o recorte do formato que uma
// planilha de leads usa, e nada além:
//
// - **Só a primeira aba**, a primeira de `xl/workbook.xml`. Planilha com leads
//   em várias abas se importa uma aba por vez, salvando a que interessa na
//   frente.
// - **O valor gravado, não o formatado.** Texto sai como está; número sai como
//   o Excel o guarda (`5548999998888`, sem máscara), que é o que o telefone
//   precisa. Data sai como o número serial do Excel: data não é campo do lead.
// - **O número da linha é o do Excel** (atributo `r` da linha), para o
//   relatório mandar o operador na linha que ele vê na planilha (RF-105).
//
// O que não se lê vira recusa com motivo, nunca planilha pela metade: zip
// sem diretório, entrada em formato que o navegador não abre, zip64, pasta
// sem aba. A planilha protegida por senha não é zip, e cai na mesma recusa.
//
// Módulo de interface: usa `DecompressionStream` e `DOMParser`, que o jsdom
// dos testes e os navegadores atuais têm.

/** Uma linha da aba: o número dela no Excel e as células, na ordem das colunas. */
export interface RegistroDaAba {
  readonly numero: number
  readonly celulas: readonly string[]
}

export type LeituraDoXlsx =
  | { ok: true; registros: RegistroDaAba[] }
  | { ok: false; motivo: 'xlsx-ilegivel' }

/** A assinatura do zip (`PK\x03\x04`), que abre todo `.xlsx`. */
export function pareceXlsx(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/**
 * A assinatura do formato binário antigo (`.xls`, e também o `.xlsx` protegido
 * por senha): o contêiner OLE, `D0 CF 11 E0`.
 */
export function pareceXlsAntigo(bytes: Uint8Array): boolean {
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}

class Ilegivel extends Error {}

export async function lerXlsx(bytes: Uint8Array): Promise<LeituraDoXlsx> {
  try {
    const zip = diretorioDoZip(bytes)
    const xml = async (caminho: string) => {
      const entrada = zip.get(caminho)
      return entrada ? lerXml(await abrirEntrada(bytes, entrada)) : null
    }

    const livro = await xml('xl/workbook.xml')
    const relacoes = await xml('xl/_rels/workbook.xml.rels')
    if (!livro || !relacoes) throw new Ilegivel()

    const primeira = porNome(livro, 'sheet')[0]
    const idDaAba = primeira ? atributoComPrefixo(primeira, 'id') : null
    const alvo = porNome(relacoes, 'Relationship').find((item) => item.getAttribute('Id') === idDaAba)
      ?.getAttribute('Target')
    if (!alvo) throw new Ilegivel()

    const aba = await xml(caminhoNoPacote(alvo))
    if (!aba) throw new Ilegivel()
    const compartilhados = await xml('xl/sharedStrings.xml')
    const textos = compartilhados ? porNome(compartilhados, 'si').map(textoDe) : []

    return { ok: true, registros: registrosDaAba(aba, textos) }
  } catch {
    return { ok: false, motivo: 'xlsx-ilegivel' }
  }
}

// O zip --------------------------------------------------------------------------

interface EntradaDoZip {
  readonly metodo: number
  readonly tamanhoComprimido: number
  readonly deslocamentoDoCabecalho: number
}

/**
 * O diretório central, lido pelo fim do arquivo: o registro de fim (EOCD) diz
 * onde o diretório começa e quantas entradas ele tem. É o diretório que diz o
 * tamanho de cada entrada; o cabeçalho local pode trazer zero ali, quando quem
 * gravou usou o descritor depois dos dados.
 */
function diretorioDoZip(bytes: Uint8Array): Map<string, EntradaDoZip> {
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fim = -1
  // O comentário do zip tem no máximo 65535 bytes, então o EOCD está nessa faixa.
  for (let posicao = bytes.length - 22; posicao >= Math.max(0, bytes.length - 22 - 65_535); posicao -= 1) {
    if (visao.getUint32(posicao, true) === 0x06054b50) {
      fim = posicao
      break
    }
  }
  if (fim < 0) throw new Ilegivel()

  const quantas = visao.getUint16(fim + 10, true)
  let posicao = visao.getUint32(fim + 16, true)
  // Zip64 marca os campos com 0xFFFFFFFF; planilha de leads não chega lá.
  if (posicao === 0xffffffff) throw new Ilegivel()

  const decodificador = new TextDecoder()
  const entradas = new Map<string, EntradaDoZip>()
  for (let indice = 0; indice < quantas; indice += 1) {
    if (visao.getUint32(posicao, true) !== 0x02014b50) throw new Ilegivel()
    const metodo = visao.getUint16(posicao + 10, true)
    const tamanhoComprimido = visao.getUint32(posicao + 20, true)
    const tamanhoDoNome = visao.getUint16(posicao + 28, true)
    const tamanhoDoExtra = visao.getUint16(posicao + 30, true)
    const tamanhoDoComentario = visao.getUint16(posicao + 32, true)
    const deslocamentoDoCabecalho = visao.getUint32(posicao + 42, true)
    const nome = decodificador.decode(bytes.subarray(posicao + 46, posicao + 46 + tamanhoDoNome))
    entradas.set(nome, { metodo, tamanhoComprimido, deslocamentoDoCabecalho })
    posicao += 46 + tamanhoDoNome + tamanhoDoExtra + tamanhoDoComentario
  }
  return entradas
}

/** Os bytes de uma entrada, abertos. Guardado (0) ou comprimido (8), só. */
async function abrirEntrada(bytes: Uint8Array, entrada: EntradaDoZip): Promise<string> {
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const local = entrada.deslocamentoDoCabecalho
  if (visao.getUint32(local, true) !== 0x04034b50) throw new Ilegivel()
  const inicio = local + 30 + visao.getUint16(local + 26, true) + visao.getUint16(local + 28, true)
  const dados = bytes.subarray(inicio, inicio + entrada.tamanhoComprimido)

  if (entrada.metodo === 0) return new TextDecoder().decode(dados)
  if (entrada.metodo !== 8) throw new Ilegivel()

  const fluxo = new ReadableStream<Uint8Array>({
    start(controle) {
      controle.enqueue(dados)
      controle.close()
    },
  }).pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)

  const pedacos: Uint8Array[] = []
  const leitor = fluxo.getReader()
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    pedacos.push(value)
  }
  const total = pedacos.reduce((soma, pedaco) => soma + pedaco.length, 0)
  const junto = new Uint8Array(total)
  let deslocamento = 0
  for (const pedaco of pedacos) {
    junto.set(pedaco, deslocamento)
    deslocamento += pedaco.length
  }
  return new TextDecoder().decode(junto)
}

// O XML ----------------------------------------------------------------------------

function lerXml(texto: string): Document {
  const documento = new DOMParser().parseFromString(texto, 'application/xml')
  if (documento.getElementsByTagName('parsererror').length > 0) throw new Ilegivel()
  return documento
}

/** Elementos pelo nome local, com ou sem prefixo de espaço de nomes. */
function porNome(raiz: Document | Element, nome: string): Element[] {
  return [...raiz.getElementsByTagNameNS('*', nome)]
}

/** `r:id` do workbook, qualquer que seja o prefixo que o gravador escolheu. */
function atributoComPrefixo(elemento: Element, nomeLocal: string): string | null {
  for (const atributo of [...elemento.attributes]) {
    if (atributo.localName === nomeLocal && atributo.prefix !== null) return atributo.value
  }
  return null
}

/** O alvo da relação, que é relativo a `xl/` ou absoluto no pacote. */
function caminhoNoPacote(alvo: string): string {
  return alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`
}

/**
 * O texto de um `si` ou de um `is`: todos os `t` dentro, em ordem, que é como o
 * texto com formatação (`r`) vem partido. O guia fonético (`rPh`) fica de fora.
 */
function textoDe(elemento: Element): string {
  return porNome(elemento, 't')
    .filter((t) => t.parentElement?.localName !== 'rPh')
    .map((t) => t.textContent ?? '')
    .join('')
}

/** `B7` vira a coluna 1 (a partir de zero). */
function colunaDe(referencia: string | null): number | null {
  const letras = /^([A-Z]+)\d*$/.exec(referencia ?? '')?.[1]
  if (!letras) return null
  let coluna = 0
  for (const letra of letras) coluna = coluna * 26 + (letra.charCodeAt(0) - 64)
  return coluna - 1
}

function registrosDaAba(aba: Document, textos: readonly string[]): RegistroDaAba[] {
  const registros: RegistroDaAba[] = []
  let numeroAnterior = 0
  for (const linha of porNome(aba, 'row')) {
    const numero = Number(linha.getAttribute('r')) || numeroAnterior + 1
    numeroAnterior = numero

    const celulas: string[] = []
    for (const celula of [...linha.children].filter((filho) => filho.localName === 'c')) {
      const coluna = colunaDe(celula.getAttribute('r')) ?? celulas.length
      while (celulas.length < coluna) celulas.push('')
      celulas[coluna] = valorDaCelula(celula, textos)
    }
    if (celulas.some((valor) => valor.trim() !== '')) registros.push({ numero, celulas })
  }
  return registros
}

function valorDaCelula(celula: Element, textos: readonly string[]): string {
  const tipo = celula.getAttribute('t')
  if (tipo === 'inlineStr') {
    const is = porNome(celula, 'is')[0]
    return is ? textoDe(is) : ''
  }
  const valor = porNome(celula, 'v')[0]?.textContent ?? ''
  if (tipo === 's') return textos[Number(valor)] ?? ''
  return valor
}

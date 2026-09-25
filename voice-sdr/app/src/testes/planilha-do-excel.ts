// Uma planilha do Excel (.xlsx) montada no teste, para a leitura de
// `leads/xlsx.ts` ter o que abrir sem arquivo binário no repositório (D-08).
//
// É o pacote mínimo que o Excel grava: tipos, livro, relações, uma aba e os
// textos compartilhados. Texto vai para `sharedStrings.xml`, como o Excel faz;
// número vai direto na célula. As entradas saem comprimidas (método 8, o que o
// Excel usa) ou guardadas (método 0), para a leitura provar os dois.

type Celula = string | number | null

interface OpcoesDaPlanilha {
  /** Método 0 em vez de 8. */
  guardada?: boolean
  /** A primeira linha da aba no Excel. Padrão: 1. */
  primeiraLinha?: number
  /** Prefixo de espaço de nomes nos elementos da aba, como alguns gravadores fazem. */
  prefixo?: string
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function escapar(texto: string): string {
  return texto.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function letraDaColuna(indice: number): string {
  let letras = ''
  let resto = indice + 1
  while (resto > 0) {
    const modulo = (resto - 1) % 26
    letras = String.fromCharCode(65 + modulo) + letras
    resto = Math.floor((resto - 1) / 26)
  }
  return letras
}

function arquivosDaPlanilha(linhas: readonly (readonly Celula[])[], opcoes: OpcoesDaPlanilha) {
  const textos: string[] = []
  const indiceDoTexto = new Map<string, number>()
  const p = opcoes.prefixo ? `${opcoes.prefixo}:` : ''
  const primeira = opcoes.primeiraLinha ?? 1

  const corpo = linhas
    .map((linha, posicao) => {
      const numero = primeira + posicao
      const celulas = linha
        .map((valor, coluna) => {
          if (valor === null || valor === '') return ''
          const referencia = `${letraDaColuna(coluna)}${String(numero)}`
          if (typeof valor === 'number') return `<${p}c r="${referencia}"><${p}v>${String(valor)}</${p}v></${p}c>`
          let indice = indiceDoTexto.get(valor)
          if (indice === undefined) {
            indice = textos.length
            textos.push(valor)
            indiceDoTexto.set(valor, indice)
          }
          return `<${p}c r="${referencia}" t="s"><${p}v>${String(indice)}</${p}v></${p}c>`
        })
        .join('')
      return `<${p}row r="${String(numero)}">${celulas}</${p}row>`
    })
    .join('')

  const xmlns = opcoes.prefixo ? `xmlns:${opcoes.prefixo}="${NS}"` : `xmlns="${NS}"`
  return {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/><sheet name="Outra" sheetId="2" r:id="rId9"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><${p}worksheet ${xmlns}><${p}sheetData>${corpo}</${p}sheetData></${p}worksheet>`,
    'xl/worksheets/sheet2.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>outra aba</t></is></c></row></sheetData></worksheet>`,
    'xl/sharedStrings.xml': `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="${NS}" count="${String(textos.length)}">${textos
      .map((texto) => `<si><t xml:space="preserve">${escapar(texto)}</t></si>`)
      .join('')}</sst>`,
  }
}

async function comprimir(dados: Uint8Array): Promise<Uint8Array> {
  const fluxo = new ReadableStream<Uint8Array>({
    start(controle) {
      controle.enqueue(dados)
      controle.close()
    },
  }).pipeThrough(new CompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
  const pedacos: Uint8Array[] = []
  const leitor = fluxo.getReader()
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    pedacos.push(value)
  }
  return juntar(pedacos)
}

function juntar(pedacos: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = pedacos.reduce((soma, pedaco) => soma + pedaco.length, 0)
  const junto = new Uint8Array(total)
  let deslocamento = 0
  for (const pedaco of pedacos) {
    junto.set(pedaco, deslocamento)
    deslocamento += pedaco.length
  }
  return junto
}

function crc32(dados: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of dados) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Os bytes do `.xlsx` com estas linhas na primeira aba. */
export async function planilhaDoExcel(
  linhas: readonly (readonly Celula[])[],
  opcoes: OpcoesDaPlanilha = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const codificador = new TextEncoder()
  const metodo = opcoes.guardada ? 0 : 8
  const locais: Uint8Array[] = []
  const centrais: Uint8Array[] = []
  let deslocamento = 0

  for (const [nome, texto] of Object.entries(arquivosDaPlanilha(linhas, opcoes))) {
    const nomeEmBytes = codificador.encode(nome)
    const cru = codificador.encode(texto)
    const dados = metodo === 8 ? await comprimir(cru) : cru
    const crc = crc32(cru)

    const local = new Uint8Array(30 + nomeEmBytes.length)
    const visaoLocal = new DataView(local.buffer)
    visaoLocal.setUint32(0, 0x04034b50, true)
    visaoLocal.setUint16(4, 20, true)
    visaoLocal.setUint16(8, metodo, true)
    visaoLocal.setUint32(14, crc, true)
    visaoLocal.setUint32(18, dados.length, true)
    visaoLocal.setUint32(22, cru.length, true)
    visaoLocal.setUint16(26, nomeEmBytes.length, true)
    local.set(nomeEmBytes, 30)

    const central = new Uint8Array(46 + nomeEmBytes.length)
    const visaoCentral = new DataView(central.buffer)
    visaoCentral.setUint32(0, 0x02014b50, true)
    visaoCentral.setUint16(4, 20, true)
    visaoCentral.setUint16(6, 20, true)
    visaoCentral.setUint16(10, metodo, true)
    visaoCentral.setUint32(16, crc, true)
    visaoCentral.setUint32(20, dados.length, true)
    visaoCentral.setUint32(24, cru.length, true)
    visaoCentral.setUint16(28, nomeEmBytes.length, true)
    visaoCentral.setUint32(42, deslocamento, true)
    central.set(nomeEmBytes, 46)

    locais.push(local, dados)
    centrais.push(central)
    deslocamento += local.length + dados.length
  }

  const diretorio = juntar(centrais)
  const fim = new Uint8Array(22)
  const visaoDoFim = new DataView(fim.buffer)
  visaoDoFim.setUint32(0, 0x06054b50, true)
  visaoDoFim.setUint16(8, centrais.length, true)
  visaoDoFim.setUint16(10, centrais.length, true)
  visaoDoFim.setUint32(12, diretorio.length, true)
  visaoDoFim.setUint32(16, deslocamento, true)

  return juntar([...locais, diretorio, fim])
}

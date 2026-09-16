// Gera uma planilha .xlsx (uma aba por categoria) sem nenhuma dependência nova: o arquivo é um zip de
// XMLs, e as entradas entram sem compressão (método "stored"), o que dispensa qualquer compactador —
// só o CRC-32, calculado aqui em ~15 linhas. Mesma família do PNG feito à mão em clone-site
// (lib/teste-visao.ts): formato de arquivo montado byte a byte em vez de mais um pacote no package.json.
//
// Módulo puro (nenhum import de node:*): roda no navegador, onde a exportação acontece, e em um script
// de teste no Node. Devolve bytes; quem chama decide se vira Blob (navegador) ou arquivo (Node).

export type AbaPlanilha = { nome: string; cabecalho: string[]; linhas: (string | number)[][] };

const TEXTO = new TextEncoder();

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[i] = c >>> 0;
  }
  return tabela;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function escaparXml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Remove os caracteres de controle que o XML 1.0 não aceita (vêm de CSV sujo e invalidariam o arquivo). */
function limpar(v: string): string {
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** Índice 0 -> "A", 25 -> "Z", 26 -> "AA": referência de coluna do Excel. */
function coluna(indice: number): string {
  let nome = "";
  let n = indice;
  do {
    nome = String.fromCharCode(65 + (n % 26)) + nome;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return nome;
}

/** Nome de aba aceito pelo Excel: até 31 caracteres, sem : \ / ? * [ ], nunca vazio e nunca repetido. */
export function nomeDeAba(bruto: string, usados: Set<string>): string {
  const base = (limpar(bruto).replace(/[:\\/?*[\]]/g, " ").trim() || "Sem categoria").slice(0, 31);
  let nome = base;
  let n = 2;
  while (usados.has(nome.toLowerCase())) {
    const sufixo = ` (${n++})`;
    nome = base.slice(0, 31 - sufixo.length) + sufixo;
  }
  usados.add(nome.toLowerCase());
  return nome;
}

function celula(valor: string | number, referencia: string): string {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return `<c r="${referencia}"><v>${valor}</v></c>`;
  }
  return `<c r="${referencia}" t="inlineStr"><is><t>${escaparXml(limpar(String(valor ?? "")))}</t></is></c>`;
}

function xmlDaAba(aba: AbaPlanilha): string {
  const linhas = [aba.cabecalho, ...aba.linhas].map((valores, i) => {
    const celulas = valores.map((v, j) => celula(v, `${coluna(j)}${i + 1}`)).join("");
    return `<row r="${i + 1}">${celulas}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${linhas.join("")}</sheetData></worksheet>`;
}

type Entrada = { nome: string; dados: Uint8Array };

/** Zip com todas as entradas "stored" (sem compressão), na ordem em que chegam. */
function zip(entradas: Entrada[]): Uint8Array {
  const pedacos: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;

  for (const entrada of entradas) {
    const nome = TEXTO.encode(entrada.nome);
    const crc = crc32(entrada.dados);
    const tamanho = entrada.dados.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão mínima do leitor
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // método: sem compressão
    local.setUint16(10, 0, true); // hora
    local.setUint16(12, 0x21, true); // data (1980-01-01, a mais antiga representável)
    local.setUint32(14, crc, true);
    local.setUint32(18, tamanho, true);
    local.setUint32(22, tamanho, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);

    pedacos.push(new Uint8Array(local.buffer), nome, entrada.dados);

    const cabecalho = new DataView(new ArrayBuffer(46));
    cabecalho.setUint32(0, 0x02014b50, true);
    cabecalho.setUint16(4, 20, true);
    cabecalho.setUint16(6, 20, true);
    cabecalho.setUint16(8, 0x0800, true);
    cabecalho.setUint16(10, 0, true);
    cabecalho.setUint16(12, 0, true);
    cabecalho.setUint16(14, 0x21, true);
    cabecalho.setUint32(16, crc, true);
    cabecalho.setUint32(20, tamanho, true);
    cabecalho.setUint32(24, tamanho, true);
    cabecalho.setUint16(28, nome.length, true);
    cabecalho.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(cabecalho.buffer), nome);

    deslocamento += 30 + nome.length + tamanho;
  }

  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, entradas.length, true);
  fim.setUint16(10, entradas.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  const partes = [...pedacos, ...central, new Uint8Array(fim.buffer)];
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    saida.set(parte, posicao);
    posicao += parte.length;
  }
  return saida;
}

/** Monta o arquivo .xlsx com uma aba por item recebido (a primeira costuma ser o resumo). */
export function montarXlsx(abas: AbaPlanilha[]): Uint8Array {
  const usados = new Set<string>();
  const nomeadas = abas.map((a) => ({ ...a, nome: nomeDeAba(a.nome, usados) }));

  const tipos =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    nomeadas
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join("") +
    `</Types>`;

  const raizRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    nomeadas.map((a, i) => `<sheet name="${escaparXml(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    nomeadas
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("") +
    `</Relationships>`;

  return zip([
    { nome: "[Content_Types].xml", dados: TEXTO.encode(tipos) },
    { nome: "_rels/.rels", dados: TEXTO.encode(raizRels) },
    { nome: "xl/workbook.xml", dados: TEXTO.encode(workbook) },
    { nome: "xl/_rels/workbook.xml.rels", dados: TEXTO.encode(workbookRels) },
    ...nomeadas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: TEXTO.encode(xmlDaAba(a)) })),
  ]);
}

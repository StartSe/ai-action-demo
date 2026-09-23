import * as XLSX from "xlsx";
import { fromBuffer } from "yauzl";
import { AppError } from "./api";
import { LIMITE_BYTES, LIMITE_COLUNAS, LIMITE_LINHAS } from "./planilhas";

// Check the ZIP directory before decompression. XLSX can expand far beyond its upload size.
async function validarPacote(buffer: Buffer) {
  if (buffer.length > LIMITE_BYTES) throw new AppError("O arquivo passa de 20 MB. Envie um recorte menor.", 413);
  await new Promise<void>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(new AppError("Não foi possível abrir o XLSX. Verifique se o arquivo é válido e não tem senha."));
      let tamanho = 0;
      let entradas = 0;
      zip.on("error", () => reject(new AppError("O arquivo XLSX está corrompido.")));
      zip.on("entry", entry => {
        tamanho += entry.uncompressedSize;
        if (++entradas > 10000 || tamanho > 100 * 1024 * 1024) {
          zip.close();
          reject(new AppError("O XLSX é muito grande após descompactar. Envie um recorte menor.", 413));
        } else zip.readEntry();
      });
      zip.on("end", resolve);
      zip.readEntry();
    });
  });
}
export async function lerXlsx(buffer: Buffer, aba?: string): Promise<{ abas: string[]; texto?: string }> {
  await validarPacote(buffer);
  try {
    const indice = XLSX.read(buffer, { type: "buffer", bookSheets: true });
    const abas = indice.SheetNames;
    if (!abas.length) throw new AppError("O XLSX não contém abas.");
    if (!aba) return { abas };
    if (!abas.includes(aba)) throw new AppError("Escolha uma das abas deste arquivo.");
    const workbook = XLSX.read(buffer, { type: "buffer", sheets: [aba], sheetRows: LIMITE_LINHAS + 2, cellDates: true, dense: true });
    const sheet = workbook.Sheets[aba];
    if (!sheet?.["!ref"]) throw new AppError("A aba selecionada está vazia.");
    const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"]);
    if (range.e.r - range.s.r > LIMITE_LINHAS || range.e.c - range.s.c + 1 > LIMITE_COLUNAS) throw new AppError("A aba excede 200 mil linhas ou 120 colunas. Envie um recorte menor.", 413);
    // Read raw numbers rather than display formatting, which can round money or percentages.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
    const texto = rows.map(row => row.map(value => {
      const text = value instanceof Date ? value.toISOString().slice(0, 10)
        : typeof value === "number" ? value.toLocaleString("pt-BR", { useGrouping: false, maximumSignificantDigits: 21 })
        : String(value ?? "");
      return '"' + text.replace(/"/g, '""') + '"';
    }).join(";")).join("\n");
    if (Buffer.byteLength(texto) > LIMITE_BYTES) throw new AppError("A aba convertida passa de 20 MB. Envie um recorte menor.", 413);
    return { abas, texto };
  } catch(e) {
    if (e instanceof AppError) throw e;
    throw new AppError("Não foi possível ler o XLSX. Verifique o arquivo e tente novamente.");
  }
}

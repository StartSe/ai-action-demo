import { z } from "zod";

// Extensão aceita → formato persistido no banco (.xls e .xlsx viram "xlsx")
export const FORMAT_BY_EXTENSION: Record<string, "csv" | "xlsx" | "json"> = {
  ".csv": "csv",
  ".xlsx": "xlsx",
  ".xls": "xlsx",
  ".json": "json",
};

/** Limite de tamanho de upload em bytes (MAX_UPLOAD_MB, default 10 MB). */
export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
}

/** Metadados do arquivo enviados no multipart, validados antes de tocar o disco. */
export const uploadFileSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "Nenhum arquivo foi enviado.")
    .max(255, "Nome de arquivo muito longo (máximo de 255 caracteres)."),
  size: z
    .number()
    .int("Tamanho de arquivo inválido.")
    .positive("Nenhum arquivo foi enviado."),
});

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 (xlsx é um ZIP)
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // xls legado
const UTF16_LE_BOM = [0xff, 0xfe];
const UTF16_BE_BOM = [0xfe, 0xff];

const SNIFF_WINDOW = 8192;

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((byte, index) => bytes[index] === byte);
}

/**
 * Decodifica o início do arquivo como texto. O worker aceita CSV/JSON em
 * UTF-16 (BOM), então NUL bytes só indicam binário quando não há BOM UTF-16.
 */
function sniffTextStart(bytes: Uint8Array): string | null {
  const window = bytes.subarray(0, SNIFF_WINDOW);
  if (startsWith(window, UTF16_LE_BOM)) {
    return new TextDecoder("utf-16le").decode(window.subarray(2));
  }
  if (startsWith(window, UTF16_BE_BOM)) {
    // Swap de bytes para decodificar como LE (utf-16be depende de ICU completo)
    const swapped = new Uint8Array(window.length - 2);
    for (let i = 2; i + 1 < window.length; i += 2) {
      swapped[i - 2] = window[i + 1];
      swapped[i - 1] = window[i];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  if (window.includes(0)) return null; // NUL sem BOM UTF-16 → binário
  return new TextDecoder("utf-8", { fatal: false }).decode(window);
}

/**
 * Valida o conteúdo do arquivo pelos magic bytes (não confia só na extensão).
 * Retorna mensagem de erro em português ou null quando o conteúdo é coerente.
 */
export function validateFileSignature(
  bytes: Uint8Array,
  extension: string,
): string | null {
  switch (extension) {
    case ".xlsx":
      if (!startsWith(bytes, ZIP_MAGIC)) {
        return "O conteúdo do arquivo não corresponde a uma planilha .xlsx válida.";
      }
      return null;
    case ".xls":
      if (!startsWith(bytes, OLE2_MAGIC)) {
        return "O conteúdo do arquivo não corresponde a uma planilha .xls válida.";
      }
      return null;
    case ".json": {
      const text = sniffTextStart(bytes);
      // Esperamos array de objetos, mas objeto passa para o parser do worker
      // devolver o erro detalhado em português
      const first = text?.replace(/^\uFEFF/, "").trimStart()[0];
      if (first !== "[" && first !== "{") {
        return "O conteúdo do arquivo não corresponde a um JSON válido.";
      }
      return null;
    }
    case ".csv":
      if (
        startsWith(bytes, ZIP_MAGIC) ||
        startsWith(bytes, OLE2_MAGIC) ||
        sniffTextStart(bytes) === null
      ) {
        return "O conteúdo do arquivo não corresponde a um CSV de texto válido.";
      }
      return null;
    default:
      return "Formato não suportado. Envie um arquivo .csv, .xlsx, .xls ou .json.";
  }
}

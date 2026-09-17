import { describe, expect, it } from "vitest";

import {
  FORMAT_BY_EXTENSION,
  uploadFileSchema,
  validateFileSignature,
} from "@/lib/upload-validation";

const encoder = new TextEncoder();

function utf16le(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xff;
    bytes[3 + i * 2] = code >> 8;
  }
  return bytes;
}

const ZIP_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE2_HEADER = new Uint8Array([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00,
]);

describe("uploadFileSchema", () => {
  it("aceita metadados válidos", () => {
    const result = uploadFileSchema.safeParse({
      fileName: "vendas.csv",
      size: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita nome vazio e tamanho zero com mensagens em português", () => {
    const emptyName = uploadFileSchema.safeParse({ fileName: "", size: 10 });
    expect(emptyName.success).toBe(false);
    const zeroSize = uploadFileSchema.safeParse({
      fileName: "a.csv",
      size: 0,
    });
    expect(zeroSize.success).toBe(false);
    if (!zeroSize.success) {
      expect(zeroSize.error.issues[0]?.message).toBe(
        "Nenhum arquivo foi enviado.",
      );
    }
  });

  it("rejeita nome de arquivo acima de 255 caracteres", () => {
    const result = uploadFileSchema.safeParse({
      fileName: `${"a".repeat(256)}.csv`,
      size: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe("validateFileSignature", () => {
  it("aceita CSV de texto simples", () => {
    const bytes = encoder.encode("nome,idade\nAna,31\nBia,44\n");
    expect(validateFileSignature(bytes, ".csv")).toBeNull();
  });

  it("aceita CSV UTF-16 com BOM (NUL bytes legítimos)", () => {
    expect(validateFileSignature(utf16le("nome,idade\nAna,31\n"), ".csv")).toBeNull();
  });

  it("rejeita binário renomeado para .csv", () => {
    const binary = new Uint8Array([0x00, 0x01, 0x02, 0x50, 0x4b]);
    expect(validateFileSignature(binary, ".csv")).toMatch(/CSV/);
    expect(validateFileSignature(ZIP_HEADER, ".csv")).toMatch(/CSV/);
    expect(validateFileSignature(OLE2_HEADER, ".csv")).toMatch(/CSV/);
  });

  it("aceita .xlsx com assinatura ZIP e rejeita texto renomeado", () => {
    expect(validateFileSignature(ZIP_HEADER, ".xlsx")).toBeNull();
    const fake = encoder.encode("nome,idade\nAna,31\n");
    expect(validateFileSignature(fake, ".xlsx")).toMatch(/xlsx/);
  });

  it("aceita .xls com assinatura OLE2 e rejeita ZIP renomeado", () => {
    expect(validateFileSignature(OLE2_HEADER, ".xls")).toBeNull();
    expect(validateFileSignature(ZIP_HEADER, ".xls")).toMatch(/xls/);
  });

  it("aceita JSON de array/objeto, com ou sem BOM", () => {
    expect(
      validateFileSignature(encoder.encode('[{"a": 1}]'), ".json"),
    ).toBeNull();
    expect(
      validateFileSignature(encoder.encode('  {"a": 1}'), ".json"),
    ).toBeNull();
    const withBom = new Uint8Array([
      0xef, 0xbb, 0xbf, ...encoder.encode("[]"),
    ]);
    expect(validateFileSignature(withBom, ".json")).toBeNull();
    expect(validateFileSignature(utf16le('[{"a": 1}]'), ".json")).toBeNull();
  });

  it("rejeita conteúdo não-JSON em arquivo .json", () => {
    expect(
      validateFileSignature(encoder.encode("nome,idade\nAna,31\n"), ".json"),
    ).toMatch(/JSON/);
    expect(validateFileSignature(ZIP_HEADER, ".json")).toMatch(/JSON/);
  });

  it("rejeita extensão desconhecida", () => {
    expect(validateFileSignature(encoder.encode("x"), ".exe")).toMatch(
      /Formato não suportado/,
    );
  });

  it("mapa de extensões cobre .csv/.xlsx/.xls/.json", () => {
    expect(FORMAT_BY_EXTENSION).toEqual({
      ".csv": "csv",
      ".xlsx": "xlsx",
      ".xls": "xlsx",
      ".json": "json",
    });
  });
});

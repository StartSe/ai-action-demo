import ExcelJS from "exceljs";

import { type TemplateFormat } from "./template-links";

/**
 * Planilha modelo (US-026): exemplo do formato esperado no upload, para a
 * usuária baixar antes de subir a planilha dela. Uma definição de template
 * gera tanto o CSV quanto o XLSX, e outros templates (ex.: o gerado a partir
 * do guia do problema) reutilizam os mesmos builders.
 */

type TemplateColumnType = "id" | "date" | "category" | "number" | "text";

type TemplateColumn = {
  name: string;
  type: TemplateColumnType;
  description: string;
  example: string | number;
  /** A coluna alvo (o que o modelo deve prever) vem sempre por último. */
  role?: "target";
};

export type SpreadsheetTemplate = {
  key: string;
  /** Nome do arquivo sem extensão. */
  fileName: string;
  title: string;
  columns: TemplateColumn[];
  rows: (string | number)[][];
};

const TEMPLATE_TYPE_LABELS: Record<TemplateColumnType, string> = {
  id: "Identificador",
  date: "Data",
  category: "Categoria",
  number: "Número",
  text: "Texto",
};

// Valores numéricos são inteiros de propósito: o parser do worker converte
// números com ponto decimal, e o Excel pt-BR grava vírgula — inteiros fazem o
// round-trip (baixar → editar → subir) sem ambiguidade nos dois formatos.
// Colunas numéricas repetem valores: inteiros todos únicos são inferidos como
// identificador pelo worker (_classify_numeric), não como número.
export const CHURN_TEMPLATE: SpreadsheetTemplate = {
  key: "churn",
  fileName: "planilha-modelo-churn",
  title: "Exemplo: quais clientes vão cancelar?",
  columns: [
    {
      name: "id_cliente",
      type: "id",
      description: "Identificador único de cada linha (cliente).",
      example: "C-0001",
    },
    {
      name: "data_cadastro",
      type: "date",
      description: "Data no formato AAAA-MM-DD.",
      example: "2024-03-15",
    },
    {
      name: "plano",
      type: "category",
      description:
        "Categoria com poucos valores distintos (ex.: Básico, Pro, Premium).",
      example: "Básico",
    },
    {
      name: "meses_ativo",
      type: "number",
      description: "Número inteiro: meses desde o cadastro.",
      example: 14,
    },
    {
      name: "mensalidade",
      type: "number",
      description:
        "Número sem símbolo de moeda nem separador de milhar (em reais).",
      example: 90,
    },
    {
      name: "chamados_suporte",
      type: "number",
      description: "Número inteiro: chamados abertos nos últimos 90 dias.",
      example: 2,
    },
    {
      name: "atraso_pagamento",
      type: "category",
      description: "Pagou com atraso nos últimos 3 meses? (sim/não)",
      example: "não",
    },
    {
      name: "cancelou",
      type: "category",
      role: "target",
      description:
        "Alvo — o que o modelo deve prever. Última coluna: o cliente cancelou? (sim/não)",
      example: "não",
    },
  ],
  rows: [
    ["C-0001", "2023-01-10", "Básico", 20, 90, 0, "não", "não"],
    ["C-0002", "2023-03-22", "Pro", 18, 150, 3, "sim", "sim"],
    ["C-0003", "2023-05-05", "Premium", 16, 250, 1, "não", "não"],
    ["C-0004", "2023-08-14", "Básico", 13, 90, 4, "sim", "sim"],
    ["C-0005", "2023-10-01", "Pro", 11, 150, 0, "não", "não"],
    ["C-0006", "2024-01-19", "Básico", 5, 90, 2, "não", "não"],
    ["C-0007", "2024-02-27", "Premium", 7, 250, 5, "sim", "sim"],
    ["C-0008", "2024-04-03", "Pro", 5, 150, 1, "não", "não"],
    ["C-0009", "2024-06-30", "Básico", 3, 90, 3, "sim", "sim"],
    ["C-0010", "2024-08-12", "Pro", 1, 150, 0, "não", "não"],
  ],
};

export { TEMPLATE_FORMATS, type TemplateFormat } from "./template-links";

export const TEMPLATE_CONTENT_TYPES: Record<TemplateFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const CSV_SEPARATOR = ";";

function escapeCsv(value: string | number): string {
  const text = String(value);
  if (/[";\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * CSV que abre direto no Excel pt-BR: BOM UTF-8, separador ";" e CRLF
 * (mesma convenção dos CSVs gerados no client — ver CLAUDE.md do web).
 */
export function buildTemplateCsv(template: SpreadsheetTemplate): string {
  const lines = [
    template.columns
      .map((column) => escapeCsv(column.name))
      .join(CSV_SEPARATOR),
    ...template.rows.map((row) => row.map(escapeCsv).join(CSV_SEPARATOR)),
  ];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

const INSTRUCTION_HEADERS = ["Coluna", "Tipo", "Descrição", "Exemplo"];

/**
 * XLSX com a aba "Dados" (cabeçalho + linhas de exemplo) e a aba "Instruções"
 * (uma linha por coluna, com tipo, descrição e exemplo).
 */
export async function buildTemplateXlsx(
  template: SpreadsheetTemplate,
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AutoML";

  const data = workbook.addWorksheet("Dados", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  data.columns = template.columns.map((column) => ({
    header: column.name,
    key: column.name,
    width: Math.max(14, column.name.length + 4),
  }));
  data.getRow(1).font = { bold: true };
  for (const row of template.rows) {
    data.addRow(row);
  }

  const instructions = workbook.addWorksheet("Instruções");
  instructions.columns = [
    { header: INSTRUCTION_HEADERS[0], width: 22 },
    { header: INSTRUCTION_HEADERS[1], width: 16 },
    { header: INSTRUCTION_HEADERS[2], width: 72 },
    { header: INSTRUCTION_HEADERS[3], width: 16 },
  ];
  instructions.getRow(1).font = { bold: true };
  for (const column of template.columns) {
    instructions.addRow([
      column.name,
      column.role === "target"
        ? `${TEMPLATE_TYPE_LABELS[column.type]} (alvo)`
        : TEMPLATE_TYPE_LABELS[column.type],
      column.description,
      column.example,
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  // Cópia em ArrayBuffer próprio: o Buffer do Node não serve de BodyInit
  return new Uint8Array(buffer);
}

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  CHURN_TEMPLATE,
  buildTemplateCsv,
  buildTemplateXlsx,
  type SpreadsheetTemplate,
} from "@/lib/spreadsheet-template";

const COLUMN_NAMES = CHURN_TEMPLATE.columns.map((column) => column.name);

describe("CHURN_TEMPLATE", () => {
  it("tem 8 colunas (id, data, categoria, números, alvo por último) e 10 linhas", () => {
    expect(CHURN_TEMPLATE.columns).toHaveLength(8);
    expect(CHURN_TEMPLATE.columns[0].type).toBe("id");
    expect(CHURN_TEMPLATE.columns[1].type).toBe("date");
    expect(CHURN_TEMPLATE.columns.some((c) => c.type === "category")).toBe(true);
    expect(CHURN_TEMPLATE.columns.some((c) => c.type === "number")).toBe(true);
    expect(CHURN_TEMPLATE.columns.at(-1)?.role).toBe("target");
    expect(CHURN_TEMPLATE.columns.filter((c) => c.role === "target")).toHaveLength(1);
    expect(CHURN_TEMPLATE.rows).toHaveLength(10);
    for (const row of CHURN_TEMPLATE.rows) {
      expect(row).toHaveLength(8);
    }
  });
});

describe("buildTemplateCsv", () => {
  const csv = buildTemplateCsv(CHURN_TEMPLATE);

  it("começa com BOM UTF-8", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("usa ';' como separador, CRLF e cabeçalho com os nomes das colunas", () => {
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(COLUMN_NAMES.join(";"));
    expect(lines[0]).not.toContain(",");
  });

  it("tem 10 linhas de dados com o mesmo número de campos do cabeçalho", () => {
    const lines = csv.slice(1).split("\r\n");
    // última posição é a string vazia depois do CRLF final
    expect(lines.at(-1)).toBe("");
    const dataLines = lines.slice(1, -1);
    expect(dataLines).toHaveLength(10);
    for (const line of dataLines) {
      expect(line.split(";")).toHaveLength(COLUMN_NAMES.length);
    }
    expect(dataLines[0]).toBe("C-0001;2023-01-10;Básico;20;90;0;não;não");
  });

  it("escapa campos com separador, aspas ou quebra de linha", () => {
    const template: SpreadsheetTemplate = {
      key: "t",
      fileName: "t",
      title: "t",
      columns: [
        { name: "a;b", type: "category", description: "", example: "" },
        { name: "c", type: "category", description: "", example: "" },
      ],
      rows: [['diz "oi"', "linha\nquebrada"]],
    };
    const lines = buildTemplateCsv(template).slice(1).split("\r\n");
    expect(lines[0]).toBe('"a;b";c');
    expect(lines[1]).toBe('"diz ""oi""";"linha\nquebrada"');
  });
});

describe("buildTemplateXlsx", () => {
  it("gera as abas 'Dados' e 'Instruções' com os cabeçalhos corretos", async () => {
    const bytes = await buildTemplateXlsx(CHURN_TEMPLATE);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Dados",
      "Instruções",
    ]);

    const data = workbook.getWorksheet("Dados")!;
    const header = data.getRow(1).values as unknown[];
    // exceljs indexa células a partir de 1 (posição 0 fica vazia)
    expect(header.slice(1)).toEqual(COLUMN_NAMES);
    expect(data.rowCount).toBe(1 + CHURN_TEMPLATE.rows.length);
    expect((data.getRow(2).values as unknown[]).slice(1)).toEqual(
      CHURN_TEMPLATE.rows[0],
    );

    const instructions = workbook.getWorksheet("Instruções")!;
    expect((instructions.getRow(1).values as unknown[]).slice(1)).toEqual([
      "Coluna",
      "Tipo",
      "Descrição",
      "Exemplo",
    ]);
    expect(instructions.rowCount).toBe(1 + CHURN_TEMPLATE.columns.length);
    const targetRow = instructions.getRow(1 + CHURN_TEMPLATE.columns.length)
      .values as unknown[];
    expect(targetRow[1]).toBe("cancelou");
    expect(targetRow[2]).toBe("Categoria (alvo)");
  });
});

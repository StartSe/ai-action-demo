import { describe, expect, it } from "vitest";

import type { LayoutDiagnosis, LayoutDiagnosisSheet } from "@/db/schema";
import {
  chooseCombineGroup,
  chooseHeaderRow,
  chooseSheet,
  chooseTranspose,
  combinableGroups,
  describeLayoutWarnings,
  formatSheetSize,
  groupIndexOf,
  hasLayoutWarnings,
  initialParseOptions,
  layoutReviewHref,
  layoutReviewNavigation,
  layoutWarnings,
  selectedSheet,
  transposePreview,
} from "@/lib/dataset-layout-form";

function sheet(
  name: string,
  overrides: Partial<LayoutDiagnosisSheet> = {},
): LayoutDiagnosisSheet {
  return {
    name,
    rowCount: 10,
    colCount: 4,
    headerRow: 0,
    orientation: "horizontal",
    schemaFingerprint: ["a", "b", "c", "d"],
    preview: [["a", "b", "c", "d"]],
    ...overrides,
  };
}

// Três abas de vendas com as mesmas colunas + uma aba "Guia" diferente;
// "Fev" tem título acima do cabeçalho e "Guia" está transposta.
const diagnosis: LayoutDiagnosis = {
  sheets: [
    sheet("Jan"),
    sheet("Fev", { headerRow: 2 }),
    sheet("Mar", { rowCount: 50 }),
    sheet("Guia", {
      orientation: "transposed",
      schemaFingerprint: ["x", "y"],
      colCount: 1,
      rowCount: 1,
    }),
  ],
  groups: [
    { sheets: ["Jan", "Fev", "Mar"], fingerprint: ["a", "b", "c", "d"] },
    { sheets: ["Guia"], fingerprint: ["x", "y"] },
  ],
  needsReview: true,
  truncated: false,
};

describe("initialParseOptions", () => {
  it("sugere a primeira aba com o cabeçalho/orientação do diagnóstico", () => {
    expect(initialParseOptions(diagnosis, null)).toEqual({
      sheets: ["Jan"],
      combine: false,
      headerRow: 0,
      transpose: false,
    });
  });

  it("preserva opções gravadas quando todas as abas ainda existem", () => {
    const saved = {
      sheets: ["Fev", "Mar"],
      combine: true,
      headerRow: 3,
      transpose: true,
    };
    const initial = initialParseOptions(diagnosis, saved);
    expect(initial).toEqual(saved);
    // cópia, não a mesma referência (o formulário muta por setState)
    expect(initial).not.toBe(saved);
    expect(initial?.sheets).not.toBe(saved.sheets);
  });

  it("ignora opções gravadas que apontam para aba fora do diagnóstico", () => {
    expect(
      initialParseOptions(diagnosis, {
        sheets: ["Abr"],
        combine: false,
        headerRow: 1,
        transpose: false,
      }),
    ).toEqual({
      sheets: ["Jan"],
      combine: false,
      headerRow: 0,
      transpose: false,
    });
  });

  it("devolve null sem abas no diagnóstico (json)", () => {
    expect(
      initialParseOptions(
        { sheets: [], groups: [], needsReview: false, truncated: false },
        null,
      ),
    ).toBeNull();
  });
});

describe("grupos", () => {
  it("groupIndexOf acha o grupo da aba (ou -1)", () => {
    expect(groupIndexOf(diagnosis, "Mar")).toBe(0);
    expect(groupIndexOf(diagnosis, "Guia")).toBe(1);
    expect(groupIndexOf(diagnosis, "Abr")).toBe(-1);
  });

  it("combinableGroups só devolve grupos com duas abas ou mais", () => {
    expect(combinableGroups(diagnosis)).toEqual([
      { index: 0, sheets: ["Jan", "Fev", "Mar"] },
    ]);
  });

  it("combinableGroups mantém o índice original do grupo", () => {
    const twoGroups: LayoutDiagnosis = {
      ...diagnosis,
      groups: [
        { sheets: ["Guia"], fingerprint: ["x", "y"] },
        { sheets: ["Jan", "Fev"], fingerprint: ["a"] },
        { sheets: ["Mar"], fingerprint: ["z"] },
      ],
    };
    expect(combinableGroups(twoGroups)).toEqual([
      { index: 1, sheets: ["Jan", "Fev"] },
    ]);
  });
});

describe("escolhas", () => {
  const base = initialParseOptions(diagnosis, null)!;

  it("chooseSheet troca a aba e recarrega cabeçalho/orientação sugeridos", () => {
    expect(chooseSheet(diagnosis, base, "Fev")).toEqual({
      sheets: ["Fev"],
      combine: false,
      headerRow: 2,
      transpose: false,
    });
    expect(chooseSheet(diagnosis, base, "Guia")).toEqual({
      sheets: ["Guia"],
      combine: false,
      headerRow: 0,
      transpose: true,
    });
  });

  it("chooseSheet desfaz uma combinação anterior", () => {
    const combined = chooseCombineGroup(diagnosis, base, 0);
    expect(chooseSheet(diagnosis, combined, "Mar")).toEqual({
      sheets: ["Mar"],
      combine: false,
      headerRow: 0,
      transpose: false,
    });
  });

  it("chooseSheet ignora aba desconhecida", () => {
    expect(chooseSheet(diagnosis, base, "Abr")).toBe(base);
  });

  it("chooseCombineGroup seleciona todas as abas do grupo na ordem", () => {
    expect(chooseCombineGroup(diagnosis, base, 0)).toEqual({
      sheets: ["Jan", "Fev", "Mar"],
      combine: true,
      headerRow: 0,
      transpose: false,
    });
  });

  it("chooseCombineGroup ignora grupo de uma aba só ou inexistente", () => {
    expect(chooseCombineGroup(diagnosis, base, 1)).toBe(base);
    expect(chooseCombineGroup(diagnosis, base, 7)).toBe(base);
  });

  it("selectedSheet é a primeira aba escolhida", () => {
    expect(selectedSheet(diagnosis, base)?.name).toBe("Jan");
    const combined = chooseCombineGroup(diagnosis, base, 0);
    expect(selectedSheet(diagnosis, combined)?.name).toBe("Jan");
    expect(
      selectedSheet(diagnosis, { ...base, sheets: ["Abr"] }),
    ).toBeUndefined();
  });

  it("chooseHeaderRow aceita só inteiro não negativo", () => {
    expect(chooseHeaderRow(base, 3)).toEqual({ ...base, headerRow: 3 });
    expect(chooseHeaderRow(base, -1)).toBe(base);
    expect(chooseHeaderRow(base, 1.5)).toBe(base);
  });
});

describe("formatSheetSize", () => {
  it("pluraliza e marca o limite da amostra", () => {
    expect(formatSheetSize({ rowCount: 10, colCount: 4 })).toBe(
      "10 linhas × 4 colunas",
    );
    expect(formatSheetSize({ rowCount: 1, colCount: 1 })).toBe(
      "1 linha × 1 coluna",
    );
    expect(formatSheetSize({ rowCount: 50, colCount: 12 })).toBe(
      "50+ linhas × 12 colunas",
    );
  });
});

describe("orientação (US-027)", () => {
  const base = initialParseOptions(diagnosis, null)!;

  it("chooseTranspose só troca a flag transpose", () => {
    expect(chooseTranspose(base, true)).toEqual({ ...base, transpose: true });
    expect(chooseTranspose({ ...base, transpose: true }, false)).toEqual(base);
  });

  it("transposePreview vira a grade a partir do headerRow, como o worker", () => {
    // Título na linha 0; a partir da linha 1: características nas linhas,
    // meses nas colunas — igual ao caso que parsing._transpose recebe
    const preview = [
      ["Relatório 2024"],
      ["", "Jan", "Fev", "Mar"],
      ["Receita", "10", "12", "15"],
      ["Clientes", "3", "4"],
    ];
    expect(transposePreview(preview, 1)).toEqual([
      ["", "Receita", "Clientes"],
      ["Jan", "10", "3"],
      ["Fev", "12", "4"],
      ["Mar", "15", ""],
    ]);
  });

  it("transposePreview: grade vazia ou headerRow além da prévia → []", () => {
    expect(transposePreview([], 0)).toEqual([]);
    expect(transposePreview([[], []], 0)).toEqual([]);
    expect(transposePreview([["a", "b"]], 5)).toEqual([]);
    expect(transposePreview([["a", "b"]], -1)).toEqual([["a"], ["b"]]);
  });
});

describe("navegação da tela (US-027)", () => {
  const projectId = "3f2b4c1e-8d6a-4f0b-9c7e-1a2b3c4d5e6f";
  const datasetId = "0d7e8f90-1234-4abc-8def-1234567890ab";

  it("layoutReviewHref só carrega projectId quando é UUID", () => {
    expect(layoutReviewHref(datasetId)).toBe(`/datasets/${datasetId}/review`);
    expect(layoutReviewHref(datasetId, null)).toBe(
      `/datasets/${datasetId}/review`,
    );
    expect(layoutReviewHref(datasetId, projectId)).toBe(
      `/datasets/${datasetId}/review?projectId=${projectId}`,
    );
    expect(layoutReviewHref(datasetId, "../admin")).toBe(
      `/datasets/${datasetId}/review`,
    );
  });

  it("layoutReviewNavigation vindo de um projeto volta para o Prepare dele", () => {
    expect(layoutReviewNavigation(projectId)).toEqual({
      doneHref: `/projects/${projectId}/prepare`,
      backHref: `/projects/${projectId}/datasets`,
      backLabel: "Escolher outro dataset",
    });
  });

  it("layoutReviewNavigation sem projeto (ou valor inválido) cai na lista", () => {
    const fallback = {
      doneHref: "/datasets",
      backHref: "/datasets",
      backLabel: "Datasets",
    };
    expect(layoutReviewNavigation(undefined)).toEqual(fallback);
    expect(layoutReviewNavigation(null)).toEqual(fallback);
    expect(layoutReviewNavigation("")).toEqual(fallback);
    // Nada de caminho livre vindo da URL virar href de redirect
    expect(layoutReviewNavigation("https://evil.example")).toEqual(fallback);
    expect(layoutReviewNavigation("//evil.example")).toEqual(fallback);
  });
});

describe("layoutWarnings", () => {
  it("sem diagnóstico ou sem profiling não há avisos", () => {
    expect(layoutWarnings(null)).toEqual([]);
    expect(layoutWarnings(diagnosis)).toEqual([]);
    expect(hasLayoutWarnings({ ...diagnosis, warnings: [] })).toBe(false);
  });

  it("devolve os códigos gravados pelo worker", () => {
    const withWarnings = {
      ...diagnosis,
      warnings: ["unnamed_columns", "mostly_empty_columns"] as const,
    };
    expect(
      layoutWarnings({ ...withWarnings, warnings: [...withWarnings.warnings] }),
    ).toEqual(["unnamed_columns", "mostly_empty_columns"]);
    expect(
      hasLayoutWarnings({ ...diagnosis, warnings: ["unnamed_columns"] }),
    ).toBe(true);
  });

  it("ignora códigos desconhecidos (worker mais novo que o web)", () => {
    const warnings = ["unnamed_columns", "algo_novo"] as unknown as [
      "unnamed_columns",
    ];
    expect(layoutWarnings({ ...diagnosis, warnings })).toEqual([
      "unnamed_columns",
    ]);
  });

  it("descreve os avisos em uma frase", () => {
    expect(describeLayoutWarnings([])).toBe("");
    expect(describeLayoutWarnings(["unnamed_columns"])).toBe(
      "muitas colunas sem nome no cabeçalho",
    );
    expect(
      describeLayoutWarnings(["unnamed_columns", "mostly_empty_columns"]),
    ).toBe(
      "muitas colunas sem nome no cabeçalho e muitas colunas quase vazias",
    );
  });
});

// Testes do preview de impacto do "Limpar dataset" (US-050: B7) — o preview
// deve espelhar a semântica real do worker (apps/worker/jobs/transform.py).

import { describe, expect, it } from "vitest";

import {
  estimateCleanImpact,
  type CleanOperationKey,
} from "./clean-preview";
import type { PrepareColumn, SampleRow } from "./prepare-view";

function column(
  name: string,
  type: PrepareColumn["type"],
  stats: Partial<NonNullable<PrepareColumn["stats"]>> & { count: number },
): PrepareColumn {
  return {
    name,
    type,
    stats: { empty: 0, unique: 10, ...stats },
    correlations: null,
  };
}

function rowsOf(name: string, values: unknown[]): SampleRow[] {
  return values.map((value) => ({ [name]: value }));
}

function select(...keys: CleanOperationKey[]): ReadonlySet<CleanOperationKey> {
  return new Set(keys);
}

describe("standardize_dates (B7)", () => {
  it("não lista coluna date tz-naive (já padronizada)", () => {
    const columns = [column("quando", "date", { count: 100 })];
    const rows = rowsOf("quando", ["2024-01-02T00:00:00.000", "2024-03-04T10:30:00.000"]);
    const impact = estimateCleanImpact(columns, rows, 100, select("standardize_dates"));
    expect(impact.get("standardize_dates")).toEqual([]);
  });

  it("lista coluna date tz-aware (sufixo de fuso no sample)", () => {
    const columns = [column("quando", "date", { count: 100 })];
    const rows = rowsOf("quando", [
      "2024-01-02T00:00:00.000Z",
      "2024-03-04T10:30:00.000+00:00",
    ]);
    const impact = estimateCleanImpact(columns, rows, 100, select("standardize_dates"));
    expect(impact.get("standardize_dates")).toEqual([
      "Padronizar o fuso horário da coluna “quando”",
    ]);
  });

  it("lista coluna de texto cuja amostra é majoritariamente data", () => {
    const columns = [column("nascimento", "text", { count: 100 })];
    const rows = rowsOf("nascimento", [
      "2024-01-02",
      "03/04/2021",
      "1999-12-31",
      "15/06/2020",
    ]);
    const impact = estimateCleanImpact(columns, rows, 100, select("standardize_dates"));
    expect(impact.get("standardize_dates")).toEqual([
      "Converter a coluna de texto “nascimento” para data",
    ]);
  });

  it("não lista coluna de texto que não é data", () => {
    const columns = [column("nome", "text", { count: 100 })];
    const rows = rowsOf("nome", ["Ana", "Bruno", "Carla"]);
    const impact = estimateCleanImpact(columns, rows, 100, select("standardize_dates"));
    expect(impact.get("standardize_dates")).toEqual([]);
  });
});

describe("remoção em cascata text→date majoritariamente nula (B7)", () => {
  it("prevê a remoção por 'data ilegível após a conversão'", () => {
    // 99% vazia mas o 1% restante é data parseável: converte e cai na remoção
    const columns = [
      column("data_opcional", "text", { count: 1000, empty: 990 }),
    ];
    const rows = rowsOf("data_opcional", ["2024-01-02", "2023-05-06", null]);
    const impact = estimateCleanImpact(
      columns,
      rows,
      1000,
      select("standardize_dates", "remove_illegible_date_columns"),
    );
    expect(impact.get("remove_illegible_date_columns")).toEqual([
      "Remover a coluna “data_opcional” (data ilegível após a conversão)",
    ]);
    // A coluna removida não aparece também como "a padronizar"
    expect(impact.get("standardize_dates")).toEqual([]);
  });

  it("sem standardize_dates a coluna de texto não vira 'data ilegível'", () => {
    const columns = [
      column("data_opcional", "text", { count: 1000, empty: 990 }),
    ];
    const rows = rowsOf("data_opcional", ["2024-01-02", "2023-05-06"]);
    const impact = estimateCleanImpact(
      columns,
      rows,
      1000,
      select("remove_illegible_date_columns"),
    );
    expect(impact.get("remove_illegible_date_columns")).toEqual([]);
  });
});

describe("vazia vs ilegível com invalidCount (espelha US-049)", () => {
  it("coluna numérica com 99% de ilegíveis é 'numérica ilegível', não 'vazia'", () => {
    const columns = [
      column("v", "number", { count: 1000, empty: 990, invalidCount: 990 }),
    ];
    const impact = estimateCleanImpact(
      columns,
      [],
      1000,
      select("remove_illegible_numeric_columns", "remove_empty_columns"),
    );
    expect(impact.get("remove_illegible_numeric_columns")).toEqual([
      "Remover a coluna “v” (numérica ilegível)",
    ]);
    expect(impact.get("remove_empty_columns")).toEqual([]);
  });

  it("coluna de texto com 99% de vazios de origem é 'vazia'", () => {
    const columns = [column("obs", "text", { count: 1000, empty: 995 })];
    const impact = estimateCleanImpact(
      columns,
      [],
      1000,
      select("remove_empty_columns"),
    );
    expect(impact.get("remove_empty_columns")).toEqual([
      "Remover a coluna “obs” (vazia)",
    ]);
  });
});

describe("operações seguintes usam o tipo efetivo pós-conversão", () => {
  it("coluna category convertida para data não entra no agrupamento", () => {
    const columns = [
      column("dia", "category", { count: 100, unique: 60 }),
    ];
    const rows = rowsOf("dia", ["2024-01-02", "2024-01-03", "2024-01-04"]);
    const impact = estimateCleanImpact(
      columns,
      rows,
      100,
      select("standardize_dates", "group_excess_categories"),
    );
    expect(impact.get("group_excess_categories")).toEqual([]);
    expect(impact.get("standardize_dates")).toEqual([
      "Converter a coluna de texto “dia” para data",
    ]);
  });
});

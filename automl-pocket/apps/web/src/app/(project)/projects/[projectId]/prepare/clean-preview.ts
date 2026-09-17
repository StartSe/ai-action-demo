// Estimativa de impacto do "Limpar dataset" (US-038), calculada no web a
// partir de dataset_columns.stats + amostra da grade — sem rodar o worker. Os
// limiares e a ordem espelham apps/worker/jobs/transform.py (fonte da verdade
// da limpeza real): padronizar datas primeiro, depois remoções de colunas.

import { numberPtBr } from "@/lib/format";

import type { PrepareColumn, SampleRow } from "./prepare-view";

const CLEAN_OPERATION_KEYS = [
  "standardize_dates",
  "remove_unexpected_nulls",
  "group_excess_categories",
  "remove_constant_columns",
  "remove_illegible_numeric_columns",
  "remove_illegible_date_columns",
  "remove_empty_columns",
  "flag_outliers",
] as const;

export type CleanOperationKey = (typeof CLEAN_OPERATION_KEYS)[number];

// Espelham GROUP_TOP_CATEGORIES, MOSTLY_THRESHOLD e DATE_MIN_PARSE_RATIO do worker
const GROUP_TOP_CATEGORIES = 32;
const MOSTLY_THRESHOLD = 0.99;
const DATE_MIN_PARSE_RATIO = 0.9;

// Estimativa do parse "mixed" do pandas na amostra: ISO 8601 ou d/m/a
const DATE_PATTERNS = [
  /^\d{4}-\d{1,2}-\d{1,2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
  /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}( \d{1,2}:\d{2}(:\d{2})?)?$/,
];
// Datas tz-aware serializam com sufixo de fuso no sample (naive vem sem)
const TZ_SUFFIX_RE = /(Z|[+-]\d{2}:?\d{2})$/;

/** Coluna com o tipo/frações efetivos APÓS a padronização de datas (B7). */
type EffectiveColumn = {
  column: PrepareColumn;
  type: PrepareColumn["type"];
  // Frações estimadas sobre o total de linhas, já contando os nulos que a
  // conversão text→date criaria
  nullFraction: number;
  invalidFraction: number;
  convertsToDate: boolean;
  standardizesTimezone: boolean;
};

function sampleDateSignals(
  rows: SampleRow[],
  name: string,
): { nonEmpty: number; parseable: number; withTimezone: number } {
  let nonEmpty = 0;
  let parseable = 0;
  let withTimezone = 0;
  for (const row of rows) {
    const value = row[name];
    if (value == null || value === "") continue;
    nonEmpty += 1;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") {
      nonEmpty -= 1;
      continue;
    }
    if (TZ_SUFFIX_RE.test(trimmed)) withTimezone += 1;
    if (DATE_PATTERNS.some((pattern) => pattern.test(trimmed))) parseable += 1;
  }
  return { nonEmpty, parseable, withTimezone };
}

/**
 * Aplica o efeito estimado de "Padronizar datas" sobre os metadados: coluna
 * date tz-aware é padronizada; texto/categoria com ≥90% de datas na amostra
 * converte para date (os inconversíveis viram nulos — base da remoção em
 * cascata por "data ilegível").
 */
function toEffectiveColumns(
  columns: PrepareColumn[],
  rows: SampleRow[],
  selected: ReadonlySet<CleanOperationKey>,
): EffectiveColumn[] {
  return columns.map((column) => {
    const count = column.stats?.count ?? 0;
    let nullFraction = count > 0 ? (column.stats?.empty ?? 0) / count : 1;
    let invalidFraction =
      count > 0 ? (column.stats?.invalidCount ?? 0) / count : 0;
    let type = column.type;
    let convertsToDate = false;
    let standardizesTimezone = false;

    if (selected.has("standardize_dates")) {
      const signals = sampleDateSignals(rows, column.name);
      if (column.type === "date") {
        standardizesTimezone = signals.withTimezone > 0;
      } else if (
        (column.type === "text" || column.type === "category") &&
        signals.nonEmpty > 0 &&
        signals.parseable / signals.nonEmpty >= DATE_MIN_PARSE_RATIO
      ) {
        convertsToDate = true;
        type = "date";
        const failFraction =
          (1 - signals.parseable / signals.nonEmpty) * (1 - nullFraction);
        invalidFraction += failFraction;
        nullFraction += failFraction;
      }
    }

    return {
      column,
      type,
      nullFraction,
      invalidFraction,
      convertsToDate,
      standardizesTimezone,
    };
  });
}

/**
 * Motivo de remoção da coluna, na mesma ordem de precedência do worker
 * (constante → numérica ilegível → data ilegível → vazia); null = mantida.
 * "Ilegível" usa a fração total de nulos; "vazia" desconta os ilegíveis.
 */
function removalReason(
  effective: EffectiveColumn,
  selected: ReadonlySet<CleanOperationKey>,
): string | null {
  const stats = effective.column.stats;
  const nonNull = stats ? stats.count - stats.empty : 0;
  if (
    selected.has("remove_constant_columns") &&
    stats &&
    nonNull > 0 &&
    stats.unique <= 1
  ) {
    return "constante";
  }
  if (
    selected.has("remove_illegible_numeric_columns") &&
    effective.type === "number" &&
    effective.nullFraction >= MOSTLY_THRESHOLD
  ) {
    return "numérica ilegível";
  }
  if (
    selected.has("remove_illegible_date_columns") &&
    effective.type === "date" &&
    effective.nullFraction >= MOSTLY_THRESHOLD
  ) {
    return effective.convertsToDate
      ? "data ilegível após a conversão"
      : "data ilegível";
  }
  if (
    selected.has("remove_empty_columns") &&
    Math.max(effective.nullFraction - effective.invalidFraction, 0) >=
      MOSTLY_THRESHOLD
  ) {
    return "vazia";
  }
  return null;
}

const REMOVAL_OPERATION_BY_REASON: Record<string, CleanOperationKey> = {
  constante: "remove_constant_columns",
  "numérica ilegível": "remove_illegible_numeric_columns",
  "data ilegível": "remove_illegible_date_columns",
  "data ilegível após a conversão": "remove_illegible_date_columns",
  vazia: "remove_empty_columns",
};

/**
 * Estimativa por operação selecionada: lista de linhas descritivas do impacto.
 * Lista vazia = "sem efeito neste dataset".
 */
export function estimateCleanImpact(
  columns: PrepareColumn[],
  rows: SampleRow[],
  rowCount: number | null,
  selected: ReadonlySet<CleanOperationKey>,
): Map<CleanOperationKey, string[]> {
  const impact = new Map<CleanOperationKey, string[]>();
  for (const key of CLEAN_OPERATION_KEYS) {
    if (selected.has(key)) impact.set(key, []);
  }

  // Ordem do worker: padronização de datas muda tipo/nulos ANTES das remoções
  const effective = toEffectiveColumns(columns, rows, selected);
  const kept: EffectiveColumn[] = [];
  for (const item of effective) {
    const reason = removalReason(item, selected);
    if (reason == null) {
      kept.push(item);
      continue;
    }
    impact
      .get(REMOVAL_OPERATION_BY_REASON[reason])
      ?.push(`Remover a coluna “${item.column.name}” (${reason})`);
  }

  if (selected.has("standardize_dates")) {
    const lines = impact.get("standardize_dates")!;
    // Só colunas que mudam de fato: date tz-aware ou texto que é data (B7);
    // date tz-naive já está padronizada — fica no "sem efeito"
    for (const item of kept) {
      if (item.standardizesTimezone) {
        lines.push(`Padronizar o fuso horário da coluna “${item.column.name}”`);
      } else if (item.convertsToDate) {
        lines.push(
          `Converter a coluna de texto “${item.column.name}” para data`,
        );
      }
    }
  }

  if (selected.has("group_excess_categories")) {
    const lines = impact.get("group_excess_categories")!;
    for (const item of kept) {
      if (item.type !== "category" || !item.column.stats) continue;
      const excess = item.column.stats.unique - GROUP_TOP_CATEGORIES;
      if (excess > 0) {
        lines.push(
          `Agrupar ${numberPtBr(excess)} ${excess === 1 ? "categoria" : "categorias"} de “${item.column.name}” em “Outros”`,
        );
      }
    }
  }

  if (selected.has("remove_unexpected_nulls")) {
    const lines = impact.get("remove_unexpected_nulls")!;
    const watched = kept.filter(
      (item) =>
        item.nullFraction > 0 && item.nullFraction <= 1 - MOSTLY_THRESHOLD,
    );
    if (watched.length > 0) {
      const estimated = Math.min(
        watched.reduce((sum, item) => sum + (item.column.stats?.empty ?? 0), 0),
        rowCount ?? Number.MAX_SAFE_INTEGER,
      );
      lines.push(
        `Remover até ${numberPtBr(estimated)} ${estimated === 1 ? "linha" : "linhas"} com nulos inesperados (${watched
          .map((item) => `“${item.column.name}”`)
          .join(", ")})`,
      );
    }
  }

  if (selected.has("flag_outliers")) {
    const lines = impact.get("flag_outliers")!;
    for (const item of kept) {
      if (
        item.type === "number" &&
        item.column.stats &&
        item.column.stats.count > item.column.stats.empty
      ) {
        lines.push(`Criar a coluna “${item.column.name}_outlier”`);
      }
    }
  }

  return impact;
}

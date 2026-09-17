/**
 * Estado do formulário da tela "Revisar planilha" (US-026/US-027) — helpers
 * puros e client-safe (só `import type` do schema; nada de drizzle/pg no
 * bundle do browser). Também é dono dos hrefs da tela (`layoutReviewHref`,
 * `layoutReviewNavigation`), usados pela lista de datasets e pelo Prepare.
 *
 * O formulário guarda exatamente o payload que a rota
 * POST /api/datasets/[datasetId]/layout recebe (`ParseOptions` =
 * `DatasetParseOptions`, validado lá por `layoutOptionsSchema`): as escolhas
 * de aba/combinação/cabeçalho/orientação são derivadas do `layout_diagnosis`
 * gravado pelo worker (diagnose_layout) e todo ajuste passa pelos helpers
 * daqui, para a UI nunca montar um `sheets` que a rota rejeitaria (aba fora
 * do diagnóstico, combine com grupos diferentes).
 */
import {
  type DatasetParseOptions,
  LAYOUT_WARNINGS,
  type LayoutDiagnosis,
  type LayoutDiagnosisSheet,
  type LayoutWarning,
} from "@/db/schema";

export type ParseOptions = DatasetParseOptions;

/** Limite de abas do diagnóstico do worker (layout.MAX_SHEETS). */
export const MAX_LAYOUT_SHEETS = 30;

/** Linhas por aba que o diagnóstico do worker amostra (layout.MAX_ROWS). */
const DIAGNOSIS_SAMPLE_ROWS = 50;

/** Linhas físicas que o diagnóstico guarda em `preview` (layout.PREVIEW_ROWS). */
export const DIAGNOSIS_PREVIEW_ROWS = 8;

/** Tamanho mínimo de um grupo para a opção "Combinar abas" fazer sentido. */
const MIN_COMBINABLE_SHEETS = 2;

/** Nome da coluna que o worker adiciona ao combinar abas (parsing._combine). */
export const SHEET_ORIGIN_COLUMN = "aba_origem";

export type CombinableGroup = {
  /** Índice do grupo em `diagnosis.groups` (estável para a UI). */
  index: number;
  sheets: string[];
};

/** Abas do diagnóstico por nome (o worker garante nomes únicos). */
function findSheet(
  diagnosis: LayoutDiagnosis,
  name: string,
): LayoutDiagnosisSheet | undefined {
  return diagnosis.sheets.find((sheet) => sheet.name === name);
}

/** Índice do grupo (mesmas colunas) da aba, ou -1 se ela não estiver em nenhum. */
export function groupIndexOf(diagnosis: LayoutDiagnosis, name: string): number {
  return diagnosis.groups.findIndex((group) => group.sheets.includes(name));
}

/** Grupos com pelo menos duas abas — os únicos que ganham "Combinar abas". */
export function combinableGroups(
  diagnosis: LayoutDiagnosis,
): CombinableGroup[] {
  return diagnosis.groups
    .map((group, index) => ({ index, sheets: group.sheets }))
    .filter((group) => group.sheets.length >= MIN_COMBINABLE_SHEETS);
}

/** Opções sugeridas pelo diagnóstico para uma aba: só ela, sem combinar. */
function optionsForSheet(sheet: LayoutDiagnosisSheet): ParseOptions {
  return {
    sheets: [sheet.name],
    combine: false,
    headerRow: sheet.headerRow,
    transpose: sheet.orientation === "transposed",
  };
}

/**
 * Estado inicial do formulário. Prioridade: opções já gravadas (retentativa
 * depois de um parse com erro — a tela reabre com as escolhas preservadas),
 * desde que todas as abas ainda existam no diagnóstico; senão a sugestão do
 * worker para a primeira aba com dados. Diagnóstico sem abas → null (a tela
 * não tem o que revisar).
 */
export function initialParseOptions(
  diagnosis: LayoutDiagnosis,
  saved: ParseOptions | null | undefined,
): ParseOptions | null {
  const [first] = diagnosis.sheets;
  if (!first) return null;

  if (
    saved &&
    saved.sheets.length > 0 &&
    saved.sheets.every((name) => findSheet(diagnosis, name) !== undefined)
  ) {
    return {
      sheets: [...saved.sheets],
      combine: saved.combine,
      headerRow: saved.headerRow,
      transpose: saved.transpose,
    };
  }

  return optionsForSheet(first);
}

/**
 * Aba cujo preview a tela mostra no bloco "Cabeçalho": a primeira escolhida
 * (é também a que o worker usa como referência de nomes ao combinar).
 */
export function selectedSheet(
  diagnosis: LayoutDiagnosis,
  options: ParseOptions,
): LayoutDiagnosisSheet | undefined {
  return findSheet(diagnosis, options.sheets[0]);
}

/**
 * "Usar só esta aba": troca a aba e recarrega cabeçalho/orientação com a
 * sugestão do diagnóstico para ela (cada aba tem a sua). Aba desconhecida →
 * estado inalterado.
 */
export function chooseSheet(
  diagnosis: LayoutDiagnosis,
  options: ParseOptions,
  name: string,
): ParseOptions {
  const sheet = findSheet(diagnosis, name);
  if (!sheet) return options;
  return optionsForSheet(sheet);
}

/**
 * "Combinar abas com as mesmas colunas": seleciona todas as abas do grupo na
 * ordem do diagnóstico, com o cabeçalho/orientação sugeridos para a primeira.
 * Grupo inexistente ou com menos de duas abas → estado inalterado.
 */
export function chooseCombineGroup(
  diagnosis: LayoutDiagnosis,
  options: ParseOptions,
  groupIndex: number,
): ParseOptions {
  const group = diagnosis.groups[groupIndex];
  if (!group || group.sheets.length < MIN_COMBINABLE_SHEETS) return options;
  const first = findSheet(diagnosis, group.sheets[0]);
  if (!first) return options;
  return {
    ...optionsForSheet(first),
    sheets: [...group.sheets],
    combine: true,
  };
}

/** Linha do cabeçalho escolhida no preview (índice físico, 0-based). */
export function chooseHeaderRow(
  options: ParseOptions,
  headerRow: number,
): ParseOptions {
  if (!Number.isInteger(headerRow) || headerRow < 0) return options;
  return { ...options, headerRow };
}

/**
 * "N linhas × M colunas" para a lista de abas. `rowCount` vem da amostra do
 * worker (≤ DIAGNOSIS_SAMPLE_ROWS), então no limite mostramos "50+ linhas"
 * em vez de um total que não é o do arquivo.
 */
export function formatSheetSize(sheet: {
  rowCount: number;
  colCount: number;
}): string {
  const rows =
    sheet.rowCount >= DIAGNOSIS_SAMPLE_ROWS
      ? `${DIAGNOSIS_SAMPLE_ROWS}+ linhas`
      : `${sheet.rowCount} ${sheet.rowCount === 1 ? "linha" : "linhas"}`;
  const cols = `${sheet.colCount} ${sheet.colCount === 1 ? "coluna" : "colunas"}`;
  return `${rows} × ${cols}`;
}

/** "Virar a planilha" (bloco Orientação): só troca a flag `transpose`. */
export function chooseTranspose(
  options: ParseOptions,
  transpose: boolean,
): ParseOptions {
  return { ...options, transpose };
}

/**
 * Prévia "como ficará" do bloco Orientação: espelha `parsing._transpose` do
 * worker sobre a amostra — a grade a partir de `headerRow` é virada, então a
 * primeira coluna (nomes das características) vira a primeira linha (o novo
 * cabeçalho) e cada coluna seguinte vira um exemplo. Células ausentes viram
 * "". Grade vazia → [].
 */
export function transposePreview(
  preview: string[][],
  headerRow: number,
): string[][] {
  const grid = preview.slice(Math.max(0, headerRow));
  const width = Math.max(0, ...grid.map((row) => row.length));
  if (grid.length === 0 || width === 0) return [];
  return Array.from({ length: width }, (_, column) =>
    grid.map((row) => row[column] ?? ""),
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URL da tela "Revisar planilha". `projectId` (opcional) diz de qual projeto
 * o usuário veio — a tela devolve para o Prepare desse projeto ao terminar.
 */
export function layoutReviewHref(
  datasetId: string,
  projectId?: string | null,
): string {
  const base = `/datasets/${datasetId}/review`;
  return projectId && UUID_PATTERN.test(projectId)
    ? `${base}?projectId=${projectId}`
    : base;
}

export type LayoutReviewNavigation = {
  /** Para onde ir quando o parse com as opções terminar. */
  doneHref: string;
  /** Link de saída no topo da tela (sem confirmar). */
  backHref: string;
  backLabel: string;
};

/**
 * Destinos da tela a partir do `?projectId=` da URL. Só um UUID é aceito (o
 * valor vem do usuário e vira href de redirect — nada de caminho livre);
 * qualquer outra coisa cai na lista de datasets. Vindo de um projeto, o
 * "voltar" vai para o seletor de datasets dele, não para o Prepare (que
 * mandaria de volta para cá enquanto o dataset estiver em needs_review).
 */
export function layoutReviewNavigation(
  projectId: string | null | undefined,
): LayoutReviewNavigation {
  if (projectId && UUID_PATTERN.test(projectId)) {
    return {
      doneHref: `/projects/${projectId}/prepare`,
      backHref: `/projects/${projectId}/datasets`,
      backLabel: "Escolher outro dataset",
    };
  }
  return {
    doneHref: "/datasets",
    backHref: "/datasets",
    backLabel: "Datasets",
  };
}

/* ----------------------------------------------------- avisos de estrutura --- */

/**
 * Texto de cada aviso gravado pelo dataset:profile (US-028) — usado pelo
 * banner "Parece que a planilha não está no formato esperado".
 */
const LAYOUT_WARNING_LABEL = {
  unnamed_columns: "muitas colunas sem nome no cabeçalho",
  mostly_empty_columns: "muitas colunas quase vazias",
} satisfies Record<LayoutWarning, string>;

/**
 * Avisos conhecidos do diagnóstico (códigos futuros do worker são ignorados
 * em vez de quebrar o rótulo). Sem diagnóstico ou sem profiling → vazio.
 */
export function layoutWarnings(
  diagnosis: LayoutDiagnosis | null | undefined,
): LayoutWarning[] {
  const known = new Set<string>(LAYOUT_WARNINGS);
  return (diagnosis?.warnings ?? []).filter((code): code is LayoutWarning =>
    known.has(code),
  );
}

export function hasLayoutWarnings(
  diagnosis: LayoutDiagnosis | null | undefined,
): boolean {
  return layoutWarnings(diagnosis).length > 0;
}

/** "muitas colunas sem nome no cabeçalho e muitas colunas quase vazias". */
export function describeLayoutWarnings(warnings: LayoutWarning[]): string {
  const labels = warnings.map((code) => LAYOUT_WARNING_LABEL[code]);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

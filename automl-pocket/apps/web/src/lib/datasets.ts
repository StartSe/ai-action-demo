import path from "node:path";

import { eq } from "drizzle-orm";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";

import { getDb } from "@/db";
import { datasetVersions } from "@/db/schema";

// Mesmo limite do worker (SAMPLE_MAX_ROWS em jobs/dataset_parse.py)
const SAMPLE_MAX_ROWS = 500;

type DatasetParquetSource = {
  parquetPath: string | null;
  currentVersionId?: string | null;
};

/**
 * Retorna o parquet da versão ativa do dataset (US-035).
 *
 * Datasets sem transformação têm current_version_id nulo e caem no
 * datasets.parquet_path original — nenhum backfill é necessário.
 */
export async function getActiveParquetPath(
  dataset: DatasetParquetSource,
): Promise<string | null> {
  if (!dataset.currentVersionId) return dataset.parquetPath;

  const db = getDb();
  const [version] = await db
    .select({ parquetPath: datasetVersions.parquetPath })
    .from(datasetVersions)
    .where(eq(datasetVersions.id, dataset.currentVersionId))
    .limit(1);

  return version?.parquetPath ?? dataset.parquetPath;
}

function toSampleValue(value: unknown): unknown {
  if (value == null) return null;
  // Mesmo formato do worker: to_json(orient="records", date_format="iso")
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

/**
 * Lê um intervalo de linhas [rowStart, rowEnd) de um parquet do volume de
 * uploads, serializado como o sample gravado pelo worker (datas ISO, NaN →
 * null). hyparquet só busca os row groups que intersectam o intervalo, então
 * a leitura paginada é barata mesmo em datasets grandes (US-009).
 */
export async function readParquetRows(
  parquetPath: string,
  columns: string[],
  rowStart: number,
  rowEnd: number,
): Promise<Record<string, unknown>[]> {
  const uploadDir = process.env.UPLOAD_DIR ?? "uploads";
  const file = await asyncBufferFromFile(
    path.join(/*turbopackIgnore: true*/ uploadDir, parquetPath),
  );
  const records = await parquetReadObjects({
    file,
    columns,
    rowStart,
    rowEnd,
  });
  return records.map((record) =>
    Object.fromEntries(
      columns.map((name) => [name, toSampleValue(record[name])]),
    ),
  );
}

/**
 * Lê a amostra (primeiras 500 linhas) de um parquet do volume de uploads —
 * usada para restaurar datasets.sample no desfazer de transformação (US-039).
 */
export async function readParquetSample(
  parquetPath: string,
  columns: string[],
): Promise<Record<string, unknown>[]> {
  return readParquetRows(parquetPath, columns, 0, SAMPLE_MAX_ROWS);
}

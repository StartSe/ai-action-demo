"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { getDb } from "@/db";
import { datasetColumns, datasets, datasetVersions } from "@/db/schema";
import { logAudit, requestMeta } from "@/lib/audit";
import { readParquetSample } from "@/lib/datasets";
import { findDatasetScoped } from "@/lib/org-scope";
import { enqueueDatasetParse, enqueueDatasetTransform } from "@/lib/queue";
import { enforceRateLimit } from "@/lib/rate-limit";
import { TRANSFORM_RATE_LIMIT } from "@/lib/rate-limit-policy";
import { requireSession } from "@/lib/session";
import { removeFileQuiet } from "@/lib/uploads";

// "use server" só permite exportar funções async — as listas ficam internas
const COLUMN_TYPES = ["number", "text", "category", "date", "id"] as const;
export type ChangeableColumnType = (typeof COLUMN_TYPES)[number];

// Chaves das operações de limpeza esperadas pelo worker (jobs/transform.py)
const CLEAN_OPERATIONS = [
  "standardize_dates",
  "remove_unexpected_nulls",
  "group_excess_categories",
  "remove_constant_columns",
  "remove_illegible_numeric_columns",
  "remove_illegible_date_columns",
  "remove_empty_columns",
  "flag_outliers",
] as const;
export type CleanOperation = (typeof CLEAN_OPERATIONS)[number];

/**
 * Altera o tipo de uma coluna do dataset: valida escopo/estado e enfileira
 * dataset:transform kind type_change (o worker gera nova versão + parquet).
 */
export async function changeColumnType(
  datasetId: string,
  column: string,
  newType: ChangeableColumnType,
) {
  const { user } = await requireSession();
  const db = getDb();

  // Rate limit por usuário, compartilhado entre as transformações (US-011)
  const limited = await enforceRateLimit("transform", user.id, TRANSFORM_RATE_LIMIT);
  if (limited) {
    const body = (await limited.json()) as { error?: string };
    return { error: body.error ?? "Muitas requisições. Tente novamente." };
  }

  // datasetId vem do client — escopo org + auditoria de negação
  const dataset = await findDatasetScoped(user, datasetId);
  if (!dataset) {
    return { error: "Dataset não encontrado." };
  }
  if (dataset.status !== "ready") {
    return {
      error:
        "O dataset está sendo processado. Aguarde a conclusão para alterar tipos.",
    };
  }
  if (!COLUMN_TYPES.includes(newType)) {
    return { error: "Tipo de coluna inválido." };
  }

  const [existing] = await db
    .select({ type: datasetColumns.type })
    .from(datasetColumns)
    .where(
      and(
        eq(datasetColumns.datasetId, dataset.id),
        eq(datasetColumns.name, column),
      ),
    )
    .limit(1);
  if (!existing) {
    return { error: "Coluna não encontrada no dataset." };
  }
  if (existing.type === newType) {
    return {};
  }

  // Feedback imediato na grade; o worker também seta 'profiling' ao pegar o job
  await db
    .update(datasets)
    .set({ status: "profiling", errorMessage: null, lastTransformError: null })
    .where(eq(datasets.id, dataset.id));

  const meta = requestMeta(await headers());
  await logAudit({
    action: "dataset.transform",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "dataset",
    resourceId: dataset.id,
    metadata: { kind: "type_change", column, newType },
    ...meta,
  });

  try {
    await enqueueDatasetTransform(dataset.id, "type_change", {
      column,
      newType,
    });
  } catch {
    await db
      .update(datasets)
      .set({ status: "ready" })
      .where(eq(datasets.id, dataset.id));
    return {
      error: "Não foi possível enfileirar a transformação. Tente novamente.",
    };
  }

  return {};
}

/**
 * Limpa o dataset com as operações selecionadas no modal (US-038): valida
 * escopo/estado e enfileira dataset:transform kind clean (o worker aplica na
 * ordem padronizada e gera nova versão + parquet).
 */
export async function cleanDataset(datasetId: string, operations: string[]) {
  const { user } = await requireSession();
  const db = getDb();

  // Rate limit por usuário, compartilhado entre as transformações (US-011)
  const limited = await enforceRateLimit("transform", user.id, TRANSFORM_RATE_LIMIT);
  if (limited) {
    const body = (await limited.json()) as { error?: string };
    return { error: body.error ?? "Muitas requisições. Tente novamente." };
  }

  // datasetId vem do client — escopo org + auditoria de negação
  const dataset = await findDatasetScoped(user, datasetId);
  if (!dataset) {
    return { error: "Dataset não encontrado." };
  }
  if (dataset.status !== "ready") {
    return {
      error:
        "O dataset está sendo processado. Aguarde a conclusão para limpar os dados.",
    };
  }

  const selected = [...new Set(operations)].filter(
    (operation): operation is CleanOperation =>
      (CLEAN_OPERATIONS as readonly string[]).includes(operation),
  );
  if (selected.length === 0 || selected.length !== new Set(operations).size) {
    return { error: "Selecione operações de limpeza válidas." };
  }

  // Feedback imediato na grade; o worker também seta 'profiling' ao pegar o job
  await db
    .update(datasets)
    .set({ status: "profiling", errorMessage: null, lastTransformError: null })
    .where(eq(datasets.id, dataset.id));

  const meta = requestMeta(await headers());
  await logAudit({
    action: "dataset.transform",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "dataset",
    resourceId: dataset.id,
    metadata: { kind: "clean", operations: selected },
    ...meta,
  });

  try {
    await enqueueDatasetTransform(dataset.id, "clean", {
      operations: selected,
    });
  } catch {
    await db
      .update(datasets)
      .set({ status: "ready" })
      .where(eq(datasets.id, dataset.id));
    return {
      error: "Não foi possível enfileirar a limpeza. Tente novamente.",
    };
  }

  return {};
}

// Shape gravado pelo worker em dataset_versions.columns_snapshot
type SnapshotColumn = {
  name: string;
  type: ChangeableColumnType;
  position: number;
  stats: unknown;
  correlations: unknown;
};

/**
 * Desfaz a última transformação (US-039): a versão ativa volta a apontar para
 * a anterior, dataset_columns/row_count/column_count/sample são restaurados do
 * snapshot e a versão desfeita é removida (com o parquet apagado do disco).
 * Quando a anterior é a original implícita (sem snapshot), o estado é
 * re-derivado pelo worker a partir do arquivo original (parse + profile).
 */
export async function undoLastTransform(datasetId: string) {
  const { user } = await requireSession();
  const db = getDb();

  // Desfazer também regrava estado/parquet — mesma janela das transformações
  const limited = await enforceRateLimit("transform", user.id, TRANSFORM_RATE_LIMIT);
  if (limited) {
    const body = (await limited.json()) as { error?: string };
    return { error: body.error ?? "Muitas requisições. Tente novamente." };
  }

  // datasetId vem do client — escopo org + auditoria de negação
  const dataset = await findDatasetScoped(user, datasetId);
  if (!dataset) {
    return { error: "Dataset não encontrado." };
  }
  if (dataset.status !== "ready") {
    return {
      error:
        "O dataset está sendo processado. Aguarde a conclusão para desfazer.",
    };
  }
  if (!dataset.currentVersionId) {
    return { error: "Nenhuma transformação para desfazer." };
  }

  const [current] = await db
    .select()
    .from(datasetVersions)
    .where(
      and(
        eq(datasetVersions.id, dataset.currentVersionId),
        eq(datasetVersions.datasetId, dataset.id),
      ),
    )
    .limit(1);
  if (!current) {
    return { error: "Nenhuma transformação para desfazer." };
  }

  const meta = requestMeta(await headers());

  if (!current.parentVersionId) {
    // Anterior = original implícita (sem snapshot): re-deriva colunas, sample
    // e stats do arquivo original via worker (dataset:parse → dataset:profile)
    await db
      .update(datasets)
      .set({ status: "profiling", errorMessage: null, lastTransformError: null })
      .where(eq(datasets.id, dataset.id));
    try {
      await enqueueDatasetParse(dataset.id);
    } catch {
      await db
        .update(datasets)
        .set({ status: "ready" })
        .where(eq(datasets.id, dataset.id));
      return {
        error: "Não foi possível desfazer a transformação. Tente novamente.",
      };
    }
    await db.transaction(async (tx) => {
      await tx
        .update(datasets)
        .set({ currentVersionId: null })
        .where(eq(datasets.id, dataset.id));
      await tx.delete(datasetVersions).where(eq(datasetVersions.id, current.id));
    });
    await logAudit({
      action: "dataset.transform_undo",
      orgId: user.orgId,
      userId: user.id,
      resourceType: "dataset",
      resourceId: dataset.id,
      metadata: {
        undoneVersionId: current.id,
        kind: current.kind,
        label: current.label,
        restoredVersionId: null,
      },
      ...meta,
    });
    await removeFileQuiet(current.parquetPath);
    return { reprofiling: true };
  }

  const [parent] = await db
    .select()
    .from(datasetVersions)
    .where(eq(datasetVersions.id, current.parentVersionId))
    .limit(1);
  const snapshot = parent?.columnsSnapshot as SnapshotColumn[] | null;
  if (!parent || !Array.isArray(snapshot) || snapshot.length === 0) {
    return { error: "Não foi possível restaurar a versão anterior." };
  }

  // A grade lê datasets.sample — restaura relendo o parquet da versão anterior
  let sample: Record<string, unknown>[];
  try {
    sample = await readParquetSample(
      parent.parquetPath,
      snapshot.map((column) => column.name),
    );
  } catch {
    return {
      error:
        "Não foi possível ler os dados da versão anterior. Tente novamente.",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(datasetColumns)
      .where(eq(datasetColumns.datasetId, dataset.id));
    await tx.insert(datasetColumns).values(
      snapshot.map((column) => ({
        orgId: user.orgId,
        datasetId: dataset.id,
        name: column.name,
        type: column.type,
        position: column.position,
        stats: column.stats,
        correlations: column.correlations,
      })),
    );
    await tx
      .update(datasets)
      .set({
        currentVersionId: parent.id,
        rowCount: parent.rowCount,
        columnCount: parent.columnCount,
        sample,
      })
      .where(eq(datasets.id, dataset.id));
    await tx.delete(datasetVersions).where(eq(datasetVersions.id, current.id));
  });

  await logAudit({
    action: "dataset.transform_undo",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "dataset",
    resourceId: dataset.id,
    metadata: {
      undoneVersionId: current.id,
      kind: current.kind,
      label: current.label,
      restoredVersionId: parent.id,
    },
    ...meta,
  });
  await removeFileQuiet(current.parquetPath);
  return { reprofiling: false };
}

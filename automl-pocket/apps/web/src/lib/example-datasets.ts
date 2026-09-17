import { copyFile, mkdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { datasets, organizations } from "@/db/schema";
import { enqueueDatasetParse } from "@/lib/queue";
import { removeFileQuiet } from "@/lib/uploads";
import { FORMAT_BY_EXTENSION } from "@/lib/upload-validation";

/**
 * Dataset de exemplo (US-002, reduzido a 1 base no Pocket — US-010):
 * provisiona apps/web/seed-assets/Credit_Card_Fraud_Example.csv em uma
 * organização, seguindo o mesmo pipeline do upload normal — arquivo com nome
 * UUID no UPLOAD_DIR, linha em datasets com status "parsing" e job
 * dataset:parse para o worker. A linha nasce com is_example = true e fica
 * fora da quota de armazenamento (US-001).
 *
 * Idempotente por nome: se a organização já tem um dataset com o mesmo
 * file_name, o exemplo é pulado (não duplica nem sobrescreve).
 */

export const EXAMPLE_DATASET_FILES = ["Credit_Card_Fraud_Example.csv"] as const;

export type ExampleDatasetSeedStore = {
  /** file_names já existentes na organização, dentre os candidatos. */
  listExistingFileNames(
    orgId: string,
    fileNames: readonly string[],
  ): Promise<string[]>;
  /** Copia o asset para o UPLOAD_DIR com nome UUID; retorna nome e tamanho. */
  copyAssetToUploads(
    assetFileName: string,
  ): Promise<{ storedName: string; sizeBytes: number }>;
  /** INSERT em datasets (status "parsing", is_example true); retorna o id. */
  insertDataset(values: {
    orgId: string;
    fileName: string;
    format: "csv" | "xlsx" | "json";
    storedName: string;
    sizeBytes: number;
  }): Promise<string>;
  /** Enfileira o job dataset:parse consumido pelo worker Python. */
  enqueueParse(datasetId: string): Promise<void>;
  /** Marca o dataset como erro quando o enfileiramento falha. */
  markDatasetError(datasetId: string, message: string): Promise<void>;
  /** Remove um arquivo do UPLOAD_DIR sem propagar erros. */
  removeUpload(storedName: string): Promise<void>;
};

export type ExampleSeedSummary = {
  /** Exemplos criados nesta execução (file_name). */
  created: string[];
  /** Exemplos pulados por já existirem na organização (file_name). */
  skipped: string[];
  /** Exemplos que falharam (file_name); os demais seguem normalmente. */
  failed: string[];
};

export async function seedExampleDatasets(
  orgId: string,
  store: ExampleDatasetSeedStore = createDbSeedStore(),
): Promise<ExampleSeedSummary> {
  const summary: ExampleSeedSummary = { created: [], skipped: [], failed: [] };

  const existing = new Set(
    await store.listExistingFileNames(orgId, EXAMPLE_DATASET_FILES),
  );

  for (const fileName of EXAMPLE_DATASET_FILES) {
    if (existing.has(fileName)) {
      summary.skipped.push(fileName);
      continue;
    }

    const format = FORMAT_BY_EXTENSION[path.extname(fileName).toLowerCase()];
    if (!format) {
      // Inalcançável com a lista atual; protege contra extensão nova sem mapa
      summary.failed.push(fileName);
      continue;
    }

    // Falha em um exemplo não impede os demais — o chamador decide o que
    // fazer com o resumo (signup ignora, backfill loga)
    try {
      const { storedName, sizeBytes } =
        await store.copyAssetToUploads(fileName);
      const datasetId = await store.insertDataset({
        orgId,
        fileName,
        format,
        storedName,
        sizeBytes,
      });
      try {
        await store.enqueueParse(datasetId);
      } catch (error) {
        // Mesmo tratamento do upload normal: linha vira erro e o arquivo sai
        console.error(
          `seedExampleDatasets: falha ao enfileirar dataset:parse de ${fileName}:`,
          error,
        );
        await store.markDatasetError(
          datasetId,
          "Não foi possível iniciar o processamento do arquivo. Tente enviar novamente.",
        );
        await store.removeUpload(storedName);
        summary.failed.push(fileName);
        continue;
      }
      summary.created.push(fileName);
    } catch (error) {
      console.error(
        `seedExampleDatasets: falha ao provisionar ${fileName} na org ${orgId}:`,
        error,
      );
      summary.failed.push(fileName);
    }
  }

  return summary;
}

export type ExampleBackfillSummary = {
  /** Organizações percorridas. */
  orgs: number;
  created: number;
  skipped: number;
  failed: number;
};

/**
 * Backfill: provisiona os exemplos em todas as organizações existentes.
 * Idempotente (org já provisionada só soma em skipped). Chamado pelo script
 * `npm run seed:examples` e pelo boot do servidor (`src/instrumentation.ts`).
 */
export async function backfillExampleDatasets(): Promise<ExampleBackfillSummary> {
  const db = getDb();
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .orderBy(organizations.createdAt);

  const totals: ExampleBackfillSummary = {
    orgs: orgs.length,
    created: 0,
    skipped: 0,
    failed: 0,
  };

  for (const org of orgs) {
    const summary = await seedExampleDatasets(org.id);
    totals.created += summary.created.length;
    totals.skipped += summary.skipped.length;
    totals.failed += summary.failed.length;
    // Só loga org com novidade; org já provisionada fica restrita ao resumo
    if (summary.created.length > 0 || summary.failed.length > 0) {
      console.log(
        `[seed-examples] ${org.name} (${org.id}): ` +
          `criados=${summary.created.length} pulados=${summary.skipped.length} falhas=${summary.failed.length}`,
      );
    }
  }

  return totals;
}

/** Diretório dos assets de exemplo (apps/web/seed-assets no dev e no deploy). */
function seedAssetsDir(): string {
  return (
    process.env.SEED_ASSETS_DIR ??
    path.join(/*turbopackIgnore: true*/ process.cwd(), "seed-assets")
  );
}

/** Store real: banco via Drizzle, arquivos no UPLOAD_DIR e fila BullMQ. */
function createDbSeedStore(): ExampleDatasetSeedStore {
  return {
    listExistingFileNames: async (orgId, fileNames) => {
      const db = getDb();
      const rows = await db
        .select({ fileName: datasets.fileName })
        .from(datasets)
        .where(
          and(
            eq(datasets.orgId, orgId),
            inArray(datasets.fileName, [...fileNames]),
          ),
        );
      return rows.map((row) => row.fileName);
    },
    copyAssetToUploads: async (assetFileName) => {
      const assetPath = path.join(seedAssetsDir(), assetFileName);
      const { size } = await stat(assetPath);
      const uploadDir = process.env.UPLOAD_DIR ?? "uploads";
      const extension = path.extname(assetFileName).toLowerCase();
      const storedName = `${randomUUID()}${extension}`;
      await mkdir(/*turbopackIgnore: true*/ uploadDir, { recursive: true });
      await copyFile(assetPath, path.join(uploadDir, storedName));
      return { storedName, sizeBytes: size };
    },
    insertDataset: async ({
      orgId,
      fileName,
      format,
      storedName,
      sizeBytes,
    }) => {
      const db = getDb();
      const [dataset] = await db
        .insert(datasets)
        .values({
          orgId,
          // Sem created_by: o exemplo pertence à organização, não a um usuário
          fileName,
          format,
          status: "parsing",
          filePath: storedName,
          sizeBytes,
          isExample: true,
        })
        .returning({ id: datasets.id });
      return dataset.id;
    },
    enqueueParse: enqueueDatasetParse,
    markDatasetError: async (datasetId, message) => {
      const db = getDb();
      await db
        .update(datasets)
        .set({ status: "error", errorMessage: message })
        .where(eq(datasets.id, datasetId));
    },
    removeUpload: removeFileQuiet,
  };
}

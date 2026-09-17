import { describe, expect, it, vi } from "vitest";

import {
  EXAMPLE_DATASET_FILES,
  seedExampleDatasets,
  type ExampleDatasetSeedStore,
} from "@/lib/example-datasets";

const ORG = "11111111-1111-4111-8111-111111111111";
const EXAMPLE_FILE = EXAMPLE_DATASET_FILES[0];

type FakeDataset = {
  id: string;
  orgId: string;
  fileName: string;
  format: string;
  status: string;
  filePath: string;
  sizeBytes: number;
  isExample: boolean;
  errorMessage?: string;
};

/**
 * Store em memória com a mesma semântica da real: datasets por org,
 * arquivos "no volume" e fila de parse. Permite injetar falha no enqueue
 * para exercitar o caminho de erro.
 */
class FakeStore implements ExampleDatasetSeedStore {
  datasets: FakeDataset[] = [];
  uploads: string[] = [];
  enqueued: string[] = [];
  failEnqueueFor: string[] = [];
  private nextId = 1;

  async listExistingFileNames(orgId: string, fileNames: readonly string[]) {
    return this.datasets
      .filter((d) => d.orgId === orgId && fileNames.includes(d.fileName))
      .map((d) => d.fileName);
  }

  async copyAssetToUploads(assetFileName: string) {
    const storedName = `uuid-${this.nextId}${assetFileName.slice(assetFileName.lastIndexOf("."))}`;
    this.uploads.push(storedName);
    return { storedName, sizeBytes: 1000 + this.nextId };
  }

  async insertDataset(values: {
    orgId: string;
    fileName: string;
    format: "csv" | "xlsx" | "json";
    storedName: string;
    sizeBytes: number;
  }) {
    const id = `ds-${this.nextId++}`;
    this.datasets.push({
      id,
      orgId: values.orgId,
      fileName: values.fileName,
      format: values.format,
      status: "parsing",
      filePath: values.storedName,
      sizeBytes: values.sizeBytes,
      isExample: true,
    });
    return id;
  }

  async enqueueParse(datasetId: string) {
    const dataset = this.datasets.find((d) => d.id === datasetId);
    if (dataset && this.failEnqueueFor.includes(dataset.fileName)) {
      throw new Error("Redis indisponível");
    }
    this.enqueued.push(datasetId);
  }

  async markDatasetError(datasetId: string, message: string) {
    const dataset = this.datasets.find((d) => d.id === datasetId);
    if (dataset) {
      dataset.status = "error";
      dataset.errorMessage = message;
    }
  }

  async removeUpload(storedName: string) {
    this.uploads = this.uploads.filter((name) => name !== storedName);
  }
}

describe("seedExampleDatasets", () => {
  it("cria o exemplo em uma organização vazia e enfileira o parse", async () => {
    const store = new FakeStore();

    const summary = await seedExampleDatasets(ORG, store);

    expect(summary.created).toEqual([EXAMPLE_FILE]);
    expect(summary.skipped).toEqual([]);
    expect(summary.failed).toEqual([]);
    expect(store.datasets).toHaveLength(1);
    expect(store.enqueued).toHaveLength(1);
    expect(store.datasets[0].orgId).toBe(ORG);
    expect(store.datasets[0].status).toBe("parsing");
    expect(store.datasets[0].isExample).toBe(true);
    expect(store.datasets[0].format).toBe("csv");
  });

  it("é idempotente: a segunda execução pula o exemplo sem duplicar", async () => {
    const store = new FakeStore();

    await seedExampleDatasets(ORG, store);
    const second = await seedExampleDatasets(ORG, store);

    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual([EXAMPLE_FILE]);
    expect(store.datasets).toHaveLength(1);
    expect(store.enqueued).toHaveLength(1);
  });

  it("dataset de outra organização não conta para a idempotência", async () => {
    const store = new FakeStore();
    store.datasets.push({
      id: "ds-outra-org",
      orgId: "22222222-2222-4222-8222-222222222222",
      fileName: EXAMPLE_FILE,
      format: "csv",
      status: "ready",
      filePath: "outra.csv",
      sizeBytes: 1,
      isExample: true,
    });

    const summary = await seedExampleDatasets(ORG, store);

    expect(summary.created).toEqual([EXAMPLE_FILE]);
    expect(summary.skipped).toEqual([]);
  });

  it("falha no enqueue marca o dataset como erro e remove o upload", async () => {
    const store = new FakeStore();
    store.failEnqueueFor = [EXAMPLE_FILE];
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const summary = await seedExampleDatasets(ORG, store);

    expect(summary.created).toEqual([]);
    expect(summary.failed).toEqual([EXAMPLE_FILE]);

    const failed = store.datasets.find((d) => d.fileName === EXAMPLE_FILE);
    expect(failed?.status).toBe("error");
    expect(failed?.errorMessage).toContain("processamento");
    // O arquivo copiado para o volume foi removido
    expect(store.uploads).toHaveLength(0);

    consoleError.mockRestore();
  });
});

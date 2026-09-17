import { describe, expect, it } from "vitest";

import {
  deleteProjectData,
  type ProjectDeleteStore,
} from "@/lib/project-delete";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT = "22222222-2222-4222-8222-222222222222";
const DATASET = "33333333-3333-4333-8333-333333333333";

type FakeProject = { id: string; datasetId: string | null };
type FakeModel = {
  id: string;
  projectId: string;
  artifactPath: string | null;
};
type FakeTrainingJob = { id: string; projectId: string; datasetId: string };
type FakeDataset = {
  id: string;
  filePath: string;
  parquetPath: string | null;
};
type FakeDatasetVersion = { id: string; datasetId: string; parquetPath: string };

/**
 * Store em memória com a mesma semântica do banco: o DELETE do projeto
 * cascateia para models e training_jobs (FKs com onDelete cascade), e nada
 * mais — datasets e dataset_versions não têm FK para projects.
 */
class FakeStore implements ProjectDeleteStore {
  projects: FakeProject[] = [];
  models: FakeModel[] = [];
  trainingJobs: FakeTrainingJob[] = [];
  datasets: FakeDataset[] = [];
  datasetVersions: FakeDatasetVersion[] = [];
  removedFiles: string[] = [];

  async listModelArtifacts(projectId: string) {
    return this.models
      .filter((m) => m.projectId === projectId)
      .map((m) => m.artifactPath);
  }

  async deleteProjectRow(projectId: string) {
    this.projects = this.projects.filter((p) => p.id !== projectId);
    this.models = this.models.filter((m) => m.projectId !== projectId);
    this.trainingJobs = this.trainingJobs.filter(
      (j) => j.projectId !== projectId,
    );
  }

  async removeFile(path: string | null) {
    if (path) this.removedFiles.push(path);
  }
}

function seedStore(): FakeStore {
  const store = new FakeStore();
  store.projects = [
    { id: PROJECT, datasetId: DATASET },
    { id: OTHER_PROJECT, datasetId: DATASET },
  ];
  store.models = [
    { id: "m1", projectId: PROJECT, artifactPath: "models/job-1.joblib" },
  ];
  store.trainingJobs = [{ id: "j1", projectId: PROJECT, datasetId: DATASET }];
  store.datasets = [
    { id: DATASET, filePath: "abc.csv", parquetPath: "abc.parquet" },
  ];
  store.datasetVersions = [
    { id: "v1", datasetId: DATASET, parquetPath: "v1.parquet" },
  ];
  return store;
}

describe("deleteProjectData", () => {
  it("apaga o projeto, seus models/training_jobs e os artefatos dos modelos", async () => {
    const store = seedStore();

    await deleteProjectData(store, PROJECT);

    expect(store.projects.map((p) => p.id)).toEqual([OTHER_PROJECT]);
    expect(store.models).toEqual([]);
    expect(store.trainingJobs).toEqual([]);
    expect(store.removedFiles).toEqual(["models/job-1.joblib"]);
  });

  it("não remove linha de datasets nem de datasetVersions", async () => {
    const store = seedStore();

    await deleteProjectData(store, PROJECT);

    expect(store.datasets).toHaveLength(1);
    expect(store.datasets[0].id).toBe(DATASET);
    expect(store.datasetVersions).toHaveLength(1);
    expect(store.datasetVersions[0].datasetId).toBe(DATASET);
  });

  it("preserva o dataset mesmo quando nenhum outro projeto ou job aponta para ele", async () => {
    const store = seedStore();
    // Cenário que antes disparava a limpeza de "dataset órfão"
    store.projects = [{ id: PROJECT, datasetId: DATASET }];
    store.trainingJobs = [];

    await deleteProjectData(store, PROJECT);

    expect(store.projects).toEqual([]);
    expect(store.datasets).toHaveLength(1);
    expect(store.datasetVersions).toHaveLength(1);
  });

  it("não toca em arquivos do dataset (file_path/parquet_path/versões)", async () => {
    const store = seedStore();
    store.projects = [{ id: PROJECT, datasetId: DATASET }];
    store.trainingJobs = [];

    await deleteProjectData(store, PROJECT);

    expect(store.removedFiles).toEqual(["models/job-1.joblib"]);
    expect(store.removedFiles).not.toContain("abc.csv");
    expect(store.removedFiles).not.toContain("abc.parquet");
    expect(store.removedFiles).not.toContain("v1.parquet");
  });

  it("não remove nenhum arquivo quando o modelo não tem artefato (path nulo)", async () => {
    const store = seedStore();
    store.models = [{ id: "m1", projectId: PROJECT, artifactPath: null }];

    await deleteProjectData(store, PROJECT);

    expect(store.removedFiles).toEqual([]);
  });
});

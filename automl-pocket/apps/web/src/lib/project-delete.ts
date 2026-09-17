/**
 * Exclusão de projeto (US-009): apaga o projeto, seus models/training_jobs
 * (cascade do banco) e os artefatos joblib dos modelos — NUNCA o dataset,
 * seus arquivos ou dataset_versions. Datasets são independentes: N projetos
 * podem apontar para a mesma base.
 *
 * A store não expõe nenhuma operação sobre datasets de propósito — o tipo
 * garante que a exclusão de projeto não tem como tocá-los.
 */

export type ProjectDeleteStore = {
  /** Artefatos joblib dos modelos do projeto — coletados antes do cascade. */
  listModelArtifacts(projectId: string): Promise<(string | null)[]>;
  /** DELETE do projeto; o cascade do banco remove models e training_jobs. */
  deleteProjectRow(projectId: string): Promise<void>;
  /** Remove um arquivo do volume de uploads sem propagar erros. */
  removeFile(path: string | null): Promise<void>;
};

export async function deleteProjectData(
  store: ProjectDeleteStore,
  projectId: string,
): Promise<void> {
  const artifacts = await store.listModelArtifacts(projectId);
  await store.deleteProjectRow(projectId);
  for (const artifactPath of artifacts) {
    await store.removeFile(artifactPath);
  }
}

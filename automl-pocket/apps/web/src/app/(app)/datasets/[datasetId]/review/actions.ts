"use server";

import type { DatasetStatus } from "@/lib/dataset-status";
import { findDatasetScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

export type LayoutReviewStatus = {
  status: DatasetStatus;
  errorMessage: string | null;
};

/**
 * Polling da tela "Revisar planilha" (US-027) depois de "Confirmar e
 * continuar": o client pergunta o status até o dataset sair de `parsing`.
 * Não existe página própria de dataset para um `router.refresh()` resolver —
 * a própria página de revisão redireciona quando o dataset deixa de ser
 * revisável, o que derrubaria a tela no meio do "Processando".
 */
export async function getLayoutReviewStatus(
  datasetId: string,
): Promise<LayoutReviewStatus | { error: string }> {
  const { user } = await requireSession();
  // id vem do client: escopo org + auditoria de negação
  const dataset = await findDatasetScoped(user, datasetId);
  if (!dataset) return { error: "Dataset não encontrado." };
  return { status: dataset.status, errorMessage: dataset.errorMessage };
}

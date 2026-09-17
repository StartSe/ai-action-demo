/**
 * Status de dataset — rótulos e predicados compartilhados por Server e Client
 * Components. Este módulo é client-safe: só importa TIPOS do schema (nada de
 * drizzle/pg entra no bundle do browser).
 *
 * Todo Record por status usa `satisfies Record<DatasetStatus, …>`: adicionar
 * um valor ao enum `dataset_status` quebra o typecheck aqui até a UI tratá-lo.
 */
import type { DatasetStatus } from "@/db/schema";

export type { DatasetStatus };

/** Rótulo curto de cada status (badge da lista de datasets). */
export const DATASET_STATUS_LABEL = {
  uploading: "Enviando",
  parsing: "Processando",
  needs_review: "Precisa de revisão",
  profiling: "Analisando",
  ready: "Pronto",
  error: "Erro",
} satisfies Record<DatasetStatus, string>;

/**
 * Status em que o worker ainda está trabalhando no dataset — a UI faz polling
 * até sair deles. "needs_review" NÃO é processamento: o worker parou e espera
 * uma ação do usuário (tela "Revisar planilha").
 */
const PROCESSING = {
  uploading: true,
  parsing: true,
  needs_review: false,
  profiling: true,
  ready: false,
  error: false,
} satisfies Record<DatasetStatus, boolean>;

export function isDatasetProcessing(status: DatasetStatus): boolean {
  return PROCESSING[status];
}

/**
 * Datasets que podem ser vinculados a um projeto (e, depois de ready,
 * treinados). Em processamento ainda conta: o Prepare cobre a espera. Em
 * needs_review não: o usuário precisa confirmar o layout antes, e em error o
 * arquivo precisa ser reenviado.
 */
const SELECTABLE = {
  uploading: true,
  parsing: true,
  needs_review: false,
  profiling: true,
  ready: true,
  error: false,
} satisfies Record<DatasetStatus, boolean>;

export function isDatasetSelectable(status: DatasetStatus): boolean {
  return SELECTABLE[status];
}

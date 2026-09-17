/**
 * Copy da tela de progresso do treino (`predict/jobs/[jobId]/training-progress.tsx`).
 * Módulo client-safe (sem `@/db`): o componente é Client Component.
 *
 * O estado "concluído" tem duas formas: a tela "Treinamento concluído" (PRD
 * US-007: o usuário escolhe entre abrir o relatório e voltar aos projetos) e o
 * redirecionamento direto ao relatório. Qual vale é decidido por
 * TRAINING_SUCCEEDED_SCREEN_ENABLED.
 */

/**
 * Decisão de produto (2026-09-14): treino concluído abre o relatório do
 * modelo direto, sem a tela intermediária "Treinamento concluído". A tela
 * NÃO foi removida — está só oculta por esta flag, para voltar com uma linha.
 * Com `false`, o `page.tsx` do job redireciona no servidor (também no
 * `router.refresh()` do polling) e a `TrainingProgress` faz `router.replace`
 * como reserva se chegar a renderizar o estado concluído. `failed` continua
 * mostrando a tela de erro com "Tentar novamente".
 */
export const TRAINING_SUCCEEDED_SCREEN_ENABLED = false;

export const TRAINING_PROGRESS_COPY = {
  succeededTitle: "Treinamento concluído",
  succeededSubtitle:
    "Seu modelo está pronto. Abra o relatório para ver o resultado.",
  viewReport: "Ver relatório do modelo",
  backToProjects: "Voltar aos projetos",
} as const;

/** Destino do botão primário no sucesso: o Prever abre no relatório do modelo. */
export function trainingReportHref(projectId: string): string {
  return `/projects/${projectId}/predict`;
}

/** Destino do link secundário no sucesso. */
export const PROJECTS_HREF = "/projects";

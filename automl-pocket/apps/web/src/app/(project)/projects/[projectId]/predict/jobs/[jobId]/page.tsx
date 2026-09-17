import { notFound, redirect } from "next/navigation";

import { findTrainingJobScoped } from "@/lib/org-scope";
import { getTrainingQueuePosition } from "@/lib/queue";
import { requireSession } from "@/lib/session";
import { estimateQueueWait, loadTrainingJobInfo } from "@/lib/training-eta";
import {
  TRAINING_SUCCEEDED_SCREEN_ENABLED,
  trainingReportHref,
} from "@/lib/training-progress-copy";

import {
  TrainingProgress,
  type CandidatesPayload,
  type TrainingEta,
} from "./training-progress";

// Visão de progresso do treinamento (US-019)
export default async function TrainingJobPage({
  params,
}: {
  params: Promise<{ projectId: string; jobId: string }>;
}) {
  const { projectId, jobId } = await params;
  const { user } = await requireSession();

  // jobId é input do usuário: negação (outra org/inexistente) é auditada
  const job = await findTrainingJobScoped(user, jobId, projectId);
  if (!job) notFound();

  const config = job.config as {
    problemType?: string;
    forecastModel?: string | null;
  };

  const problemType = config.problemType ?? "classification";
  const active = job.status === "queued" || job.status === "running";

  // Treino concluído abre o relatório direto (tela "Treinamento concluído"
  // oculta pela flag — ver training-progress-copy.ts). Vale tanto para quem
  // abre a URL do job depois quanto para o polling da TrainingProgress: o
  // router.refresh() que encontra o status succeeded segue este redirect.
  if (job.status === "succeeded" && !TRAINING_SUCCEEDED_SCREEN_ENABLED) {
    redirect(trainingReportHref(projectId));
  }

  // Faixa de tempo até o treino terminar contando a fila (US-015): jobs
  // ativos + à frente + estimativa própria (mediana histórica por tipo e
  // tamanho). O polling de 2s da TrainingProgress (router.refresh) mantém o
  // valor vivo. null (Redis fora, tipo sem estimativa) → a UI omite as linhas
  // de tempo e cai na posição simples da fila (US-004).
  const estimate = active
    ? await estimateQueueWait(
        job.id,
        (await loadTrainingJobInfo(job.id)) ?? { problemType, rowCount: null },
      )
    : null;
  const eta: TrainingEta | null = estimate && {
    minSeconds: estimate.minSeconds,
    maxSeconds: estimate.maxSeconds,
    ownSeconds: estimate.own.seconds,
  };
  const queuePosition =
    estimate && estimate.position !== null
      ? { position: estimate.position, total: estimate.total }
      : job.status === "queued" && !estimate
        ? await getTrainingQueuePosition(job.id)
        : null;

  // Início para "Treinando há …" e "Restam …": o processedOn do BullMQ é o
  // momento real em que o worker pegou o job; sem ele (fila, Redis fora) vale
  // created_at, o único carimbo estável do banco — o worker toca updated_at a
  // cada passo do progresso.
  const startedAt = new Date(estimate?.startedAt ?? job.createdAt);

  return (
    <TrainingProgress
      projectId={projectId}
      jobId={job.id}
      status={job.status}
      queuePosition={queuePosition}
      eta={eta}
      progress={job.progress}
      progressStep={job.progressStep}
      errorMessage={job.errorMessage}
      candidates={(job.candidates as CandidatesPayload | null) ?? null}
      problemType={problemType}
      startedAt={startedAt.toISOString()}
      forecastModel={config.forecastModel ?? null}
    />
  );
}

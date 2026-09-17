"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  CircleDashed,
  FolderOpen,
  Loader2,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatApproxDuration,
  formatDurationRange,
  formatElapsed,
  remainingSeconds,
} from "@/lib/training-eta-format";
import {
  PROJECTS_HREF,
  TRAINING_PROGRESS_COPY,
  TRAINING_SUCCEEDED_SCREEN_ENABLED,
  trainingReportHref,
} from "@/lib/training-progress-copy";

import { retryTraining } from "../../actions";

type CandidateState = {
  algorithm: string;
  label: string;
  status: "waiting" | "running" | "done";
  metric: number | null;
};

export type CandidatesPayload = {
  metricName: string;
  items: CandidateState[];
};

/**
 * Estimativa de tempo vinda do servidor (US-015): faixa até o treino terminar
 * contando a fila, e a duração própria do treino para o "Restam …" em running.
 */
export type TrainingEta = {
  minSeconds: number;
  maxSeconds: number;
  ownSeconds: number;
};

// Lista exibida antes de o worker reportar o primeiro estado (job ainda na
// fila). Deve espelhar os candidatos de apps/worker/jobs/automl.py e
// forecasting.py (chaves, rótulos e ordem).
const FALLBACK_CANDIDATES: Record<string, CandidatesPayload> = {
  classification: {
    metricName: "f1",
    items: [
      { algorithm: "baseline", label: "Baseline (classe mais comum)" },
      { algorithm: "logistic_regression", label: "Regressão Logística" },
      { algorithm: "decision_tree", label: "Árvore de Decisão" },
      { algorithm: "random_forest", label: "Random Forest" },
      { algorithm: "xgboost", label: "XGBoost" },
      { algorithm: "mlp", label: "Rede Neural (MLP)" },
    ].map((item) => ({ ...item, status: "waiting" as const, metric: null })),
  },
  regression: {
    metricName: "rmse",
    items: [
      { algorithm: "baseline", label: "Baseline (média)" },
      { algorithm: "linear_regression", label: "Regressão Linear" },
      { algorithm: "random_forest", label: "Random Forest" },
      { algorithm: "xgboost", label: "XGBoost" },
      { algorithm: "mlp", label: "Rede Neural (MLP)" },
    ].map((item) => ({ ...item, status: "waiting" as const, metric: null })),
  },
  forecasting: {
    metricName: "mape",
    items: [
      { algorithm: "naive", label: "Baseline (último valor)" },
      { algorithm: "holt_winters", label: "Holt-Winters" },
      { algorithm: "arima", label: "ARIMA" },
    ].map((item) => ({ ...item, status: "waiting" as const, metric: null })),
  },
};

/**
 * Fallback do job: com algoritmo fixado no formulário (US-011) o worker só vai
 * rodar aquele candidato — a lista estática não pode prometer os outros dois.
 */
function fallbackCandidates(
  problemType: string,
  forecastModel: string | null,
): CandidatesPayload | null {
  const fallback = FALLBACK_CANDIDATES[problemType] ?? null;
  if (!fallback || !forecastModel || forecastModel === "auto") return fallback;
  const items = fallback.items.filter(
    (item) => item.algorithm === forecastModel,
  );
  return items.length > 0 ? { ...fallback, items } : fallback;
}

const METRIC_LABELS: Record<string, string> = {
  f1: "F1",
  rmse: "RMSE",
  mape: "MAPE",
};

function formatMetric(metricName: string, metric: number | null): string {
  if (metric === null) return "—";
  const label = METRIC_LABELS[metricName] ?? metricName.toUpperCase();
  if (metricName === "mape") {
    // MAPE chega como fração (0.061 = 6,1%)
    const pct = (metric * 100).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    });
    return `${label} ${pct}%`;
  }
  const value = metric.toLocaleString("pt-BR", {
    minimumFractionDigits: metricName === "f1" ? 2 : 0,
    maximumFractionDigits: metricName === "f1" ? 3 : 2,
  });
  return `${label} ${value}`;
}

export function TrainingProgress({
  projectId,
  jobId,
  status,
  progress,
  progressStep,
  errorMessage,
  candidates,
  problemType,
  forecastModel = null,
  queuePosition = null,
  eta = null,
  startedAt = null,
}: {
  projectId: string;
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  progressStep: string | null;
  errorMessage: string | null;
  candidates: CandidatesPayload | null;
  problemType: string;
  /** Algoritmo fixado no formulário; "auto"/null = os três candidatos. */
  forecastModel?: string | null;
  /** Posição na fila do BullMQ enquanto queued; null = já saiu da espera. */
  queuePosition?: { position: number; total: number } | null;
  /** Faixa estimada contando a fila; null = sem estimativa (linhas omitidas). */
  eta?: TrainingEta | null;
  /**
   * ISO do início do treino (processedOn do BullMQ ou, sem ele, created_at);
   * alimenta "Treinando há …" e "Restam …".
   */
  startedAt?: string | null;
}) {
  const router = useRouter();
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrying, startRetry] = useTransition();
  // Relógio do cliente para o tempo decorrido. Começa null para o HTML do
  // servidor e a hidratação baterem; o primeiro valor vem no mount, os
  // seguintes no mesmo tick do polling.
  const [now, setNow] = useState<number | null>(null);
  const active = status === "queued" || status === "running";

  // Polling de 2s enquanto o job está na fila ou rodando
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(() => {
      tick();
      router.refresh();
    }, 2000);
    tick();
    return () => clearInterval(timer);
  }, [active, router]);

  // Reserva do redirect do servidor (page.tsx): se o estado concluído chegar
  // a renderizar com a tela oculta, vai direto ao relatório. `replace` para o
  // voltar do navegador não cair de novo nesta URL.
  useEffect(() => {
    if (status === "succeeded" && !TRAINING_SUCCEEDED_SCREEN_ENABLED) {
      router.replace(trainingReportHref(projectId));
    }
  }, [status, projectId, router]);

  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const elapsedSeconds =
    status === "running" && now !== null && Number.isFinite(startedAtMs)
      ? (now - startedAtMs) / 1000
      : null;
  // "Restam …" só depois do primeiro tick do relógio (evita divergência de
  // hidratação); estimativa própria menos o decorrido, nunca negativo.
  const remaining =
    eta && elapsedSeconds !== null
      ? remainingSeconds(eta.ownSeconds, elapsedSeconds)
      : null;

  // Ao concluir NÃO há redirecionamento automático (PRD US-007): a tela
  // oferece "Ver relatório do modelo" e "Voltar aos projetos", e a notificação
  // de treino (já resolvida pelo page.tsx) conta a mesma história.

  const shown =
    status === "failed"
      ? candidates
      : (candidates ?? fallbackCandidates(problemType, forecastModel));

  function handleRetry() {
    setRetryError(null);
    startRetry(async () => {
      const result = await retryTraining(projectId, jobId);
      if (result?.error) {
        setRetryError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 px-6 py-16 text-center">
      {active && (
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      )}
      {status === "succeeded" && (
        <CheckCircle2 className="size-8 text-emerald-600" aria-hidden />
      )}
      {status === "failed" && (
        <AlertCircle className="size-8 text-destructive" aria-hidden />
      )}

      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {status === "queued" && "Na fila de treinamento..."}
          {status === "running" && "Treinando seu modelo..."}
          {status === "succeeded" && TRAINING_PROGRESS_COPY.succeededTitle}
          {status === "failed" && "O treinamento falhou"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {status === "failed"
            ? (errorMessage ?? "Erro inesperado durante o treinamento.")
            : status === "succeeded"
              ? TRAINING_PROGRESS_COPY.succeededSubtitle
              : (progressStep ??
                "A plataforma vai testar vários algoritmos e escolher o melhor.")}
        </p>
        {status === "queued" && eta && (
          <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
            Tempo estimado:{" "}
            {formatDurationRange(eta.minSeconds, eta.maxSeconds)}
          </p>
        )}
        {status === "queued" && queuePosition && (
          <p
            className={
              eta
                ? "mt-0.5 text-xs tabular-nums text-muted-foreground"
                : "mt-1 text-sm font-medium tabular-nums text-foreground"
            }
          >
            Posição na fila: {queuePosition.position}
          </p>
        )}
        {elapsedSeconds !== null && (
          <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
            Treinando há {formatElapsed(elapsedSeconds)}
          </p>
        )}
        {remaining !== null && (
          <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
            Restam {formatApproxDuration(remaining)}
          </p>
        )}
        {active && eta && (
          <p className="mt-1 text-xs text-muted-foreground">
            A estimativa considera os treinos em andamento e o histórico da
            plataforma
          </p>
        )}
      </div>

      {active && (
        <div className="w-full">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(Math.max(progress, 2), 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
            {progress}%
          </p>
        </div>
      )}

      {status === "succeeded" && (
        <div
          className="flex flex-wrap items-center justify-center gap-2"
          data-training-succeeded-actions
        >
          <Button asChild>
            <Link href={trainingReportHref(projectId)}>
              <BarChart3 className="size-4" aria-hidden />
              {TRAINING_PROGRESS_COPY.viewReport}
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={PROJECTS_HREF}>
              <FolderOpen className="size-4" aria-hidden />
              {TRAINING_PROGRESS_COPY.backToProjects}
            </Link>
          </Button>
        </div>
      )}

      {status === "failed" && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="size-4" aria-hidden />
              )}
              Tentar novamente
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/predict`}>
                <ArrowLeft className="size-4" aria-hidden />
                Voltar para Predição
              </Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Na aba Predição você pode ajustar a coluna-alvo, os campos ignorados
            e o modo de treinamento antes de treinar de novo.
          </p>
          {retryError && (
            <p role="alert" className="text-sm text-destructive">
              {retryError}
            </p>
          )}
        </div>
      )}

      {shown && shown.items.length > 0 && (
        <div className="w-full rounded-xl border border-border bg-card text-left shadow-sm">
          <p className="border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Algoritmos candidatos
          </p>
          <ul className="divide-y divide-border">
            {shown.items.map((item) => (
              <li
                key={item.algorithm}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                {item.status === "waiting" && (
                  <CircleDashed
                    className="size-4 shrink-0 text-muted-foreground/60"
                    aria-hidden
                  />
                )}
                {item.status === "running" && (
                  <Loader2
                    className="size-4 shrink-0 animate-spin text-primary"
                    aria-hidden
                  />
                )}
                {item.status === "done" && (
                  <Check
                    className="size-4 shrink-0 text-emerald-600"
                    aria-hidden
                  />
                )}
                <span
                  className={`flex-1 truncate text-sm ${
                    item.status === "waiting"
                      ? "text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {item.label}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {item.status === "waiting" && "Aguardando"}
                  {item.status === "running" && "Rodando..."}
                  {item.status === "done" &&
                    formatMetric(shown.metricName, item.metric)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

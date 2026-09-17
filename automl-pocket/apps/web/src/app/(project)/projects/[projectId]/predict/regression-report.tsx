import { ChevronDown, Trophy } from "lucide-react";

import { numberPtBr } from "@/lib/format";
import { cn } from "@/lib/utils";

import { SectionCard, type TopField } from "./classification-report";
import { TopFieldsSection } from "./insights-sections";

// Shape produzido pelo worker (apps/worker/jobs/insights.py, US-018).
type RegressionSummary = {
  medianErrorPct: number | null;
  rmse: number;
  mae: number;
  r2: number;
  text: string;
};

type HistogramBin = {
  from: number;
  to: number;
  count: number;
  pct: number;
};

type TargetDistribution = {
  mean: number;
  median: number;
  bins: HistogramBin[];
  text: string;
};

type ScatterPoint = {
  actual: number;
  predicted: number;
};

type ScatterData = {
  total: number;
  points: ScatterPoint[];
};

export type RegressionInsights = {
  methodology: string;
  summary: RegressionSummary;
  targetDistribution: TargetDistribution;
  scatter: ScatterData;
  topFields: TopField[];
};

// Shape de models.metrics (apps/worker/jobs/automl.py, US-015)
type RegressionCandidateMetrics = {
  algorithm: string;
  label: string;
  rmse?: number;
  mae?: number;
  r2?: number;
  configsTested: number;
  trainSeconds: number;
  best: boolean;
};

export type RegressionMetrics = {
  problemType: string;
  target: string;
  selectionMetric: string;
  rows?: { total: number; train: number; validation: number };
  winner: { algorithm: string; label: string };
  candidates: RegressionCandidateMetrics[];
};

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
}

function formatPctValue(value: number, decimals = 1): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/** Interpola emerald-500 → orange-500 conforme o erro relativo (0..1). */
function errorColor(t: number): string {
  const clamped = Math.min(Math.max(t, 0), 1);
  const r = Math.round(16 + (249 - 16) * clamped);
  const g = Math.round(185 + (115 - 185) * clamped);
  const b = Math.round(129 + (22 - 129) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Histograma do alvo com marcadores de média e mediana. */
function TargetDistributionChart({
  distribution,
}: {
  distribution: TargetDistribution;
}) {
  const { bins, mean, median } = distribution;
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  const min = bins[0]?.from ?? 0;
  const max = bins[bins.length - 1]?.to ?? 1;
  const range = max - min || 1;
  const position = (value: number) =>
    Math.min(Math.max(((value - min) / range) * 100, 0), 100);

  return (
    <div>
      <div className="relative h-44">
        <div className="flex h-full items-end gap-px">
          {bins.map((bin, index) => (
            <div
              key={index}
              className="min-w-0 flex-1 rounded-t-sm bg-primary/60"
              style={{
                height: `${Math.max((bin.count / maxCount) * 100, bin.count > 0 ? 2 : 0)}%`,
              }}
              title={`${formatNumber(bin.from)} a ${formatNumber(bin.to)}: ${numberPtBr(bin.count)} linhas (${formatPctValue(bin.pct)})`}
            />
          ))}
        </div>
        <div
          className="absolute inset-y-0 w-0 border-l-2 border-foreground/70"
          style={{ left: `${position(mean)}%` }}
          aria-hidden
        />
        <div
          className="absolute inset-y-0 w-0 border-l-2 border-dashed border-amber-500"
          style={{ left: `${position(median)}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{formatNumber(min)}</span>
        <span>{formatNumber(max)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-foreground/70" aria-hidden />
          Média:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatNumber(mean)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-0.5 border-l-2 border-dashed border-amber-500"
            aria-hidden
          />
          Mediana:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatNumber(median)}
          </span>
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{distribution.text}</p>
    </div>
  );
}

const SCATTER_SIZE = 320;
const SCATTER_PAD = 10;

/** Scatter Previsto × Real com diagonal ideal e pontos coloridos por erro. */
function ScatterChart({
  scatter,
  target,
}: {
  scatter: ScatterData;
  target: string;
}) {
  const { points } = scatter;
  const values = points.flatMap((point) => [point.actual, point.predicted]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || 1;
  const inner = SCATTER_SIZE - SCATTER_PAD * 2;
  const toX = (value: number) => SCATTER_PAD + ((value - lo) / range) * inner;
  const toY = (value: number) =>
    SCATTER_SIZE - SCATTER_PAD - ((value - lo) / range) * inner;
  const maxError = Math.max(
    ...points.map((point) => Math.abs(point.predicted - point.actual)),
    1e-9,
  );

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-6">
      <div className="w-full max-w-sm shrink-0">
        <div className="flex">
          <p
            className="self-center text-xs font-medium text-muted-foreground"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Previsto
          </p>
          <svg
            viewBox={`0 0 ${SCATTER_SIZE} ${SCATTER_SIZE}`}
            className="w-full rounded-md border border-border bg-muted/20"
            role="img"
            aria-label={`Gráfico de dispersão previsto × real de '${target}'`}
          >
            {/* Diagonal ideal: previsão perfeita */}
            <line
              x1={toX(lo)}
              y1={toY(lo)}
              x2={toX(hi)}
              y2={toY(hi)}
              stroke="currentColor"
              className="text-muted-foreground/50"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            {points.map((point, index) => (
              <circle
                key={index}
                cx={toX(point.actual)}
                cy={toY(point.predicted)}
                r={3.5}
                fill={errorColor(
                  Math.abs(point.predicted - point.actual) / maxError,
                )}
                fillOpacity={0.75}
              >
                <title>
                  {`Real: ${formatNumber(point.actual)} · Previsto: ${formatNumber(point.predicted)}`}
                </title>
              </circle>
            ))}
          </svg>
        </div>
        <div className="mt-1 flex justify-between pl-4 text-xs tabular-nums text-muted-foreground">
          <span>{formatNumber(lo)}</span>
          <span className="font-medium">Real</span>
          <span>{formatNumber(hi)}</span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        <p>
          Cada ponto é uma linha de validação: quanto mais perto da linha
          tracejada, mais a previsão se aproximou do valor real de{" "}
          <span className="font-medium text-foreground">{target}</span>.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span
            className="h-2 w-24 rounded-full"
            style={{
              background: `linear-gradient(to right, ${errorColor(0)}, ${errorColor(1)})`,
            }}
            aria-hidden
          />
          <span>erro menor → erro maior</span>
        </div>
        {scatter.total > points.length && (
          <p className="mt-3">
            Exibindo {numberPtBr(points.length)} de {numberPtBr(scatter.total)}{" "}
            linhas de validação.
          </p>
        )}
      </div>
    </div>
  );
}

/** Relatório de Insights de regressão (US-023). */
export function RegressionReport({
  insights,
  metrics,
}: {
  insights: RegressionInsights;
  metrics: RegressionMetrics;
}) {
  const { summary } = insights;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Relatório de Insights — Regressão
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prevendo{" "}
          <span className="font-medium text-foreground">{metrics.target}</span>
          {" — "}um valor numérico estimado para cada linha.
        </p>
      </div>

      {/* Resumo */}
      <SectionCard title="Resumo">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <p className="text-4xl font-semibold tabular-nums text-foreground">
              {summary.medianErrorPct !== null
                ? `±${formatPctValue(summary.medianErrorPct)}`
                : formatNumber(summary.mae)}
            </p>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {summary.medianErrorPct !== null
                ? "Erro percentual mediano"
                : "Erro médio (MAE)"}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{summary.text}</p>
          </div>
        </div>
        <details className="group mt-4 border-t border-border pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-primary [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="size-3.5 transition-transform group-open:rotate-180"
              aria-hidden
            />
            Ver métricas de erro (RMSE e MAE)
          </summary>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                RMSE
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatNumber(summary.rmse)}
              </dd>
              <dd className="mt-0.5 text-xs text-muted-foreground">
                Raiz do erro quadrático médio — penaliza mais os erros grandes.
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                MAE
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatNumber(summary.mae)}
              </dd>
              <dd className="mt-0.5 text-xs text-muted-foreground">
                Erro médio absoluto, nas mesmas unidades de &lsquo;
                {metrics.target}&rsquo;.
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                R²
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatNumber(summary.r2)}
              </dd>
              <dd className="mt-0.5 text-xs text-muted-foreground">
                Quanto da variação do alvo o modelo explica (1 = perfeito).
              </dd>
            </div>
          </dl>
        </details>
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          {insights.methodology}
        </p>
      </SectionCard>

      {/* Distribuição do alvo */}
      {insights.targetDistribution.bins.length > 0 && (
        <SectionCard
          title="Distribuição do Alvo"
          subtitle={`Como os valores de '${metrics.target}' se distribuem em todas as linhas do dataset.`}
        >
          <TargetDistributionChart distribution={insights.targetDistribution} />
        </SectionCard>
      )}

      {/* Scatter Previsto × Real */}
      {insights.scatter.points.length > 0 && (
        <SectionCard
          title="Previsto × Real"
          subtitle="Previsões do modelo comparadas aos valores reais nas linhas de validação."
        >
          <ScatterChart scatter={insights.scatter} target={metrics.target} />
        </SectionCard>
      )}

      {/* Campos Principais */}
      {insights.topFields.length > 0 && (
        <SectionCard
          title="Campos Principais"
          subtitle="Quanto cada campo contribui para as previsões do modelo."
        >
          <TopFieldsSection topFields={insights.topFields} />
        </SectionCard>
      )}

      {/* Detalhes Avançados do Modelo (expansível) */}
      <details className="group rounded-xl border border-border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Detalhes Avançados do Modelo
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Algoritmo vencedor e comparação dos candidatos testados.
            </p>
          </div>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="border-t border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <Trophy className="size-4 text-amber-500" aria-hidden />
            <span>
              Algoritmo vencedor:{" "}
              <span className="font-semibold">{metrics.winner.label}</span>
            </span>
            {metrics.rows && (
              <span className="text-xs text-muted-foreground">
                (treinado com {numberPtBr(metrics.rows.train)} linhas, validado
                com {numberPtBr(metrics.rows.validation)})
              </span>
            )}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Algoritmo</th>
                  <th className="px-3 py-2 text-right">RMSE</th>
                  <th className="px-3 py-2 text-right">MAE</th>
                  <th className="px-3 py-2 text-right">R²</th>
                  <th className="px-3 py-2 text-right">Configurações</th>
                  <th className="px-3 py-2 text-right">Tempo (s)</th>
                </tr>
              </thead>
              <tbody>
                {metrics.candidates.map((candidate) => (
                  <tr
                    key={candidate.algorithm}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      candidate.best && "bg-primary/5",
                    )}
                  >
                    <td className="py-2.5 pr-4 font-medium text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {candidate.label}
                        {candidate.best && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            Vencedor
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {candidate.rmse !== undefined
                        ? formatNumber(candidate.rmse)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {candidate.mae !== undefined
                        ? formatNumber(candidate.mae)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {candidate.r2 !== undefined
                        ? formatNumber(candidate.r2)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {numberPtBr(candidate.configsTested)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {candidate.trainSeconds.toLocaleString("pt-BR", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            A seleção do vencedor usa RMSE (raiz do erro quadrático médio —
            quanto menor, melhor) na validação.
          </p>
        </div>
      </details>
    </div>
  );
}

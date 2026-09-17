import { ChevronDown, Trophy } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { numberPtBr } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  SegmentsSection,
  TopFactorsSection,
  TopFieldsSection,
} from "./insights-sections";
import { SampleRowsSection, ThresholdSection } from "./probability-sections";

// Shape produzido pelo worker (apps/worker/jobs/insights.py, US-017).
type ConfusionCell = {
  kind: "tp" | "fp" | "tn" | "fn";
  label: string;
  count: number;
  // Denominador do pct: total de positivos reais (tp/fn) ou negativos reais
  // (fp/tn). Ausente em relatórios antigos, cujo pct era sobre o total.
  of?: number;
  pct: number;
  text: string;
};

type PerClassRow = {
  className: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  count: number;
};

export type TopField = {
  column: string;
  importance: number;
  pct: number;
};

export type FactorItem = {
  label: string;
  count: number;
  pct: number;
  outcomeRate: number;
  // Em pontos percentuais vs. a taxa média geral
  impact: number;
  text: string;
};

export type TopFactorEntry = {
  column: string;
  overallRate: number;
  factors: FactorItem[];
};

export type SegmentAttribute = {
  column: string;
  kind: "number" | "category";
  segmentMean?: number;
  overallMean?: number;
  value?: string;
  segmentPct?: number;
  overallPct?: number;
  text: string;
};

export type Segment = {
  level: "high" | "medium" | "low" | "all";
  label: string;
  size: number;
  sizePct: number;
  outcomeRate: number;
  overallRate: number;
  // Em pontos percentuais vs. a taxa média geral
  vsOverall: number;
  avgProbability: number;
  attributes: SegmentAttribute[];
  text: string;
};

type ThresholdBin = {
  from: number;
  to: number;
  positive: number;
  negative: number;
};

export type ThresholdChart = {
  positiveClass: string;
  bins: ThresholdBin[];
};

export type SampleRowValue = string | number | boolean | null;

export type SampleRow = {
  values: Record<string, SampleRowValue>;
  actual: string;
  predicted: string;
  probability: number;
};

export type SampleRows = {
  columns: string[];
  rows: SampleRow[];
};

export type ClassificationInsights = {
  positiveClass: string;
  methodology: string;
  summary: {
    accuracy: number;
    correct: number;
    total: number;
    baselineAccuracy: number;
    vsBaseline: number | null;
    text: string;
  };
  confusionMatrix: { positiveClass: string; cells: ConfusionCell[] };
  perClass: PerClassRow[];
  topFields: TopField[];
  topFactors: TopFactorEntry[];
  segments: Segment[];
  thresholdChart: ThresholdChart;
  sampleRows: SampleRows;
};

// Shape de models.metrics (apps/worker/jobs/automl.py)
type CandidateMetrics = {
  algorithm: string;
  label: string;
  f1?: number;
  accuracy?: number;
  precision?: number;
  recall?: number;
  configsTested: number;
  trainSeconds: number;
  best: boolean;
};

export type ClassificationMetrics = {
  problemType: string;
  target: string;
  selectionMetric: string;
  rows?: { total: number; train: number; validation: number };
  winner: { algorithm: string; label: string };
  candidates: CandidateMetrics[];
};

function formatPct(fraction: number, decimals = 1): string {
  return `${(fraction * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

function formatTimes(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

const METRIC_TOOLTIPS: { key: string; label: string; tooltip: string }[] = [
  {
    key: "accuracy",
    label: "Acurácia",
    tooltip:
      "De todas as linhas de validação, quantas o modelo classificou corretamente como sendo (ou não sendo) esta classe.",
  },
  {
    key: "precision",
    label: "Precisão",
    tooltip:
      "Quando o modelo prevê esta classe, com que frequência ele acerta.",
  },
  {
    key: "recall",
    label: "Cobertura (Recall)",
    tooltip:
      "De todas as linhas que realmente são desta classe, quantas o modelo conseguiu encontrar.",
  },
  {
    key: "f1",
    label: "F1",
    tooltip:
      "Nota única que equilibra precision e recall — quanto mais perto de 100%, melhor.",
  },
  {
    key: "count",
    label: "Linhas",
    tooltip: "Quantas linhas de validação pertencem a esta classe.",
  },
];

export function SectionCard({
  title,
  subtitle,
  headerAction,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Controle no canto direito do header (ex.: um botão de ação da seção). */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {headerAction}
      </div>
      {children != null && <div className="px-5 py-4">{children}</div>}
    </section>
  );
}

/**
 * Card de seção contraído por padrão (details/summary nativo — funciona em
 * server components). Para seções de aprofundamento que o usuário expande
 * quando quer saber mais.
 */
function CollapsibleSectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border px-5 py-4">{children}</div>
    </details>
  );
}

/** Relatório de Insights de classificação — resumo e performance (US-020). */
export function ClassificationReport({
  insights,
  metrics,
}: {
  insights: ClassificationInsights;
  metrics: ClassificationMetrics;
}) {
  const { summary, confusionMatrix, perClass } = insights;
  const correctKinds = new Set(["tp", "tn"]);

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Relatório de Insights — Classificação
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prevendo{" "}
            <span className="font-medium text-foreground">
              {metrics.target}
            </span>
            {" — "}o desfecho analisado é{" "}
            <span className="font-medium text-foreground">
              &lsquo;{insights.positiveClass}&rsquo;
            </span>
            .
          </p>
        </div>

        {/* Resumo */}
        <SectionCard title="Resumo">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <p className="text-4xl font-semibold tabular-nums text-foreground">
                {formatPct(summary.accuracy)}
              </p>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Acurácia geral
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                O modelo acertou{" "}
                <span className="font-medium">
                  {numberPtBr(summary.correct)}
                </span>{" "}
                de{" "}
                <span className="font-medium">{numberPtBr(summary.total)}</span>{" "}
                linhas reservadas para validação.
              </p>
              {summary.vsBaseline !== null && (
                <span className="mt-2 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {formatTimes(summary.vsBaseline)}× melhor que o baseline
                </span>
              )}
            </div>
          </div>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            {insights.methodology}
          </p>
        </SectionCard>

        {/* Performance Preditiva */}
        <SectionCard
          title="Performance Preditiva"
          subtitle={`Como as previsões se distribuem em relação ao desfecho '${confusionMatrix.positiveClass}'. Percentuais sobre o total real de cada classe.`}
        >
          <div className="flex flex-col gap-4">
            {confusionMatrix.cells.map((cell) => {
              const correct = correctKinds.has(cell.kind);
              return (
                <div key={cell.kind}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {cell.label}
                    </p>
                    <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {numberPtBr(cell.count)}
                      </span>
                      {cell.of !== undefined && <>/{numberPtBr(cell.of)}</>} (
                      {cell.pct.toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}
                      %)
                    </p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        correct ? "bg-emerald-500" : "bg-amber-500",
                      )}
                      style={{
                        width: `${Math.min(Math.max(cell.pct, 1), 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cell.text}
                  </p>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Detalhes de Performance por classe (contraído por padrão) */}
        <CollapsibleSectionCard
          title="Detalhes de Performance"
          subtitle="Métricas de validação para cada classe do alvo. Passe o mouse sobre as colunas para entender cada métrica."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Classe
                  </th>
                  {METRIC_TOOLTIPS.map((metric) => (
                    <th key={metric.key} className="px-3 py-2 text-right">
                      <Tooltip>
                        <TooltipTrigger className="cursor-help text-xs font-semibold uppercase tracking-wide text-muted-foreground underline decoration-dotted underline-offset-4">
                          {metric.label}
                        </TooltipTrigger>
                        <TooltipContent>{metric.tooltip}</TooltipContent>
                      </Tooltip>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perClass.map((row) => (
                  <tr
                    key={row.className}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="max-w-48 truncate py-2.5 pr-4 font-medium text-foreground">
                      {row.className}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {formatPct(row.accuracy)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {formatPct(row.precision)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {formatPct(row.recall)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {formatPct(row.f1)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {numberPtBr(row.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSectionCard>

        {/* Campos Principais (US-021) */}
        {insights.topFields.length > 0 && (
          <SectionCard
            title="Campos Principais"
            subtitle="Quanto cada campo contribui para as previsões do modelo. Clique em um campo para ver faixas de valor e impacto."
          >
            <TopFieldsSection
              topFields={insights.topFields}
              topFactors={insights.topFactors}
              positiveClass={insights.positiveClass}
            />
          </SectionCard>
        )}

        {/* Fatores Principais (US-021, contraído por padrão) */}
        {insights.topFactors.length > 0 && (
          <CollapsibleSectionCard
            title="Fatores Principais"
            subtitle={`Valores e faixas específicos que mais alteram a chance do desfecho '${insights.positiveClass}'.`}
          >
            <TopFactorsSection
              entries={insights.topFactors}
              positiveClass={insights.positiveClass}
            />
          </CollapsibleSectionCard>
        )}

        {/* Segmentos (US-021, contraído por padrão) */}
        {insights.segments.length > 0 && (
          <CollapsibleSectionCard
            title="Segmentos"
            subtitle="Grupos de linhas com chance parecida do desfecho e o que distingue cada um."
          >
            <SegmentsSection
              segments={insights.segments}
              positiveClass={insights.positiveClass}
            />
          </CollapsibleSectionCard>
        )}

        {/* Explorador de Limiar (US-022, contraído por padrão) */}
        {insights.thresholdChart && insights.thresholdChart.bins.length > 0 && (
          <CollapsibleSectionCard
            title="Explorador de Limiar"
            subtitle={`Como as linhas de validação se distribuem pela probabilidade prevista de '${insights.thresholdChart.positiveClass}'. Mova o slider para simular um limiar de decisão.`}
          >
            <ThresholdSection chart={insights.thresholdChart} />
          </CollapsibleSectionCard>
        )}

        {/* Linhas de Exemplo (US-022, contraído por padrão) */}
        {insights.sampleRows && insights.sampleRows.rows.length > 0 && (
          <CollapsibleSectionCard
            title="Linhas de Exemplo"
            subtitle="Amostra de linhas de validação com a probabilidade prevista pelo modelo. Clique nos cabeçalhos para ordenar e use os sliders para filtrar por faixa de probabilidade."
          >
            <SampleRowsSection
              data={insights.sampleRows}
              positiveClass={insights.positiveClass}
            />
          </CollapsibleSectionCard>
        )}

        {/* Detalhes Avançados do Modelo (expansível) */}
        <CollapsibleSectionCard
          title="Detalhes Avançados do Modelo"
          subtitle="Algoritmo vencedor e comparação dos candidatos testados."
        >
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
              <Trophy className="size-4 text-amber-500" aria-hidden />
              <span>
                Algoritmo vencedor:{" "}
                <span className="font-semibold">{metrics.winner.label}</span>
              </span>
              {metrics.rows && (
                <span className="text-xs text-muted-foreground">
                  (treinado com {numberPtBr(metrics.rows.train)} linhas,
                  validado com {numberPtBr(metrics.rows.validation)})
                </span>
              )}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">Algoritmo</th>
                    <th className="px-3 py-2 text-right">F1</th>
                    <th className="px-3 py-2 text-right">Acurácia</th>
                    <th className="px-3 py-2 text-right">Precisão</th>
                    <th className="px-3 py-2 text-right">Cobertura</th>
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
                        {candidate.f1 !== undefined
                          ? formatPct(candidate.f1)
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {candidate.accuracy !== undefined
                          ? formatPct(candidate.accuracy)
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {candidate.precision !== undefined
                          ? formatPct(candidate.precision)
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {candidate.recall !== undefined
                          ? formatPct(candidate.recall)
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
              A seleção do vencedor usa{" "}
              {metrics.selectionMetric === "f1_macro"
                ? "F1-macro (média do F1 de todas as classes)"
                : "F1 (equilíbrio entre precision e recall)"}{" "}
              na validação.
            </p>
          </div>
        </CollapsibleSectionCard>
      </div>
    </TooltipProvider>
  );
}

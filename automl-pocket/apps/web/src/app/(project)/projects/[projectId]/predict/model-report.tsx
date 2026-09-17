import type { ReactNode } from "react";

import {
  ClassificationReport,
  type ClassificationInsights,
  type ClassificationMetrics,
} from "./classification-report";
import {
  ForecastingReport,
  type ForecastInsights,
  type ForecastingMetrics,
} from "./forecasting-report";
import {
  RegressionReport,
  type RegressionInsights,
  type RegressionMetrics,
} from "./regression-report";

export const PROBLEM_LABELS: Record<string, string> = {
  classification: "Classificação",
  regression: "Regressão",
  forecasting: "Previsão de série temporal",
};

type ModelReportSource = {
  problemType: string;
  insights: unknown;
  metrics: unknown;
};

/**
 * Montagem compartilhada do Insights Report: despacha pelo problemType do
 * modelo (classification/regression/forecasting). Retorna null quando o
 * modelo não tem insights/metrics gravados (modelos antigos) — quem chama
 * decide o fallback.
 */
export function buildModelReport(model: ModelReportSource): ReactNode | null {
  if (model.problemType === "classification") {
    const insights = (
      model.insights as { classification?: ClassificationInsights } | null
    )?.classification;
    const metrics = model.metrics as ClassificationMetrics | null;
    if (insights && metrics) {
      return <ClassificationReport insights={insights} metrics={metrics} />;
    }
  }

  if (model.problemType === "regression") {
    const insights = (
      model.insights as { regression?: RegressionInsights } | null
    )?.regression;
    const metrics = model.metrics as RegressionMetrics | null;
    if (insights && metrics) {
      return <RegressionReport insights={insights} metrics={metrics} />;
    }
  }

  if (model.problemType === "forecasting") {
    const insights = (model.insights as { forecast?: ForecastInsights } | null)
      ?.forecast;
    const metrics = model.metrics as ForecastingMetrics | null;
    if (insights && metrics) {
      return <ForecastingReport insights={insights} metrics={metrics} />;
    }
  }

  return null;
}

/** Rótulo do algoritmo vencedor p/ o fallback de modelo sem relatório. */
export function winnerLabelOf(model: {
  metrics: unknown;
  winningAlgorithm: string | null;
}): string {
  const metrics = model.metrics as { winner?: { label?: string } } | null;
  return metrics?.winner?.label ?? model.winningAlgorithm ?? "—";
}

"use client";

import { useId, useState } from "react";

import { ChevronDown, Repeat, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

import { SectionCard } from "./classification-report";
import {
  BacktestSection,
  ConfidenceMarginCard,
  ForecastChartSection,
  SeasonalitySection,
  SeriesTableSection,
} from "./forecast-sections";

// Shape produzido pelo worker (apps/worker/jobs/forecasting.py, US-016/US-018).
type ForecastHistoryPoint = {
  date: string;
  value: number;
};

export type ForecastPrediction = {
  date: string;
  value: number;
  lower: number;
  upper: number;
};

type ForecastSeasonalityItem = {
  label: string;
  impact: number;
  count: number;
};

export type ForecastSeasonalityBucket = {
  key: string;
  label: string;
  items: ForecastSeasonalityItem[];
};

type ForecastSeasonality = {
  detected: boolean;
  period: number;
  strength: number;
  label: string | null;
  text: string;
  // buckets chegaram na US-002 desta PRD — modelos antigos não têm a chave
  buckets?: ForecastSeasonalityBucket[];
};

type ForecastBacktestPoint = {
  date: string;
  actual: number;
  predicted: number;
};

export type ForecastBacktest = {
  points: ForecastBacktestPoint[];
  rmse: number;
  mae: number;
  mape: number;
  trainPoints: number;
  testPoints: number;
};

/**
 * Detalhe de uma subsequência do ID Field (US-016). Só as chaves que variam
 * por série: frequência, rótulo e horizontes continuam vindo do topo.
 */
export type ForecastSeriesInsight = {
  id: string;
  label: string;
  points: number;
  // null quando nem o baseline convergiu naquela série
  mape: number | null;
  history: ForecastHistoryPoint[];
  predictions: ForecastPrediction[];
  backtest?: ForecastBacktest;
  seasonality: ForecastSeasonality;
};

export type ForecastInsights = {
  frequency: string;
  frequencyLabel: string;
  seasonalPeriod: number;
  // horizonte efetivo da previsão e sua origem — US-009; modelos anteriores só
  // têm `horizons` (que era fixo em [7, 30, 90])
  horizon?: number;
  horizonSource?: "auto" | "manual";
  horizons: number[];
  mape: number;
  // summary/seasonality chegaram na US-018 — opcionais p/ modelos antigos
  summary?: { mape: number; text: string };
  seasonality?: ForecastSeasonality;
  // backtest chegou na US-001 desta PRD — modelos antigos não têm a chave
  backtest?: ForecastBacktest;
  history: ForecastHistoryPoint[];
  predictions: ForecastPrediction[];
  // ID Field (US-016): ausentes no treino de série única
  idColumn?: string;
  excludedSeries?: number;
  truncatedSeries?: { shown: number; total: number };
  series?: ForecastSeriesInsight[];
};

// Shape de models.metrics (apps/worker/jobs/forecasting.py, US-016)
type ForecastingCandidateMetrics = {
  algorithm: string;
  label: string;
  mape?: number;
  rmse?: number;
  mae?: number;
  configsTested: number;
  trainSeconds: number;
  best: boolean;
};

export type ForecastingMetrics = {
  problemType: string;
  target: string;
  selectionMetric: string;
  rows?: { total: number; train: number; validation: number };
  winner: { algorithm: string; label: string };
  candidates: ForecastingCandidateMetrics[];
};

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
}

/** MAPE vem como fração do worker (0.061 → "6,1%"). */
function formatMape(fraction: number): string {
  return `${(fraction * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Valor do <select> que representa a visão agregada (US-018). */
const AGGREGATE_OPTION = "";

/** Relatório de Insights de forecasting (US-024). */
export function ForecastingReport({
  insights,
  metrics,
}: {
  insights: ForecastInsights;
  metrics: ForecastingMetrics;
}) {
  const seriesSelectId = useId();
  // Índice em `seriesList`; "" = "Todas (agregado)". A seleção é por índice
  // porque o id de uma série pode ser a string vazia (grupo sem identificador)
  const [selected, setSelected] = useState<string>(AGGREGATE_OPTION);

  // O worker já entrega ordenado por nº de períodos desc; a cópia ordenada
  // torna a garantia local (e sobrevive a insights gravados fora de ordem)
  const seriesList = [...(insights.series ?? [])].sort(
    (a, b) => b.points - a.points,
  );
  const active: ForecastSeriesInsight | undefined =
    selected === AGGREGATE_OPTION ? undefined : seriesList[Number(selected)];

  // Visão ativa: a agregada usa as chaves de topo (idêntico ao relatório de
  // série única), a série usa as chaves dela — frequência, rótulo e horizontes
  // continuam vindo do topo, porque são os mesmos para todas as séries
  const mape = active ? active.mape : (insights.summary?.mape ?? insights.mape);
  const summaryText = active
    ? active.mape !== null
      ? `Nas janelas de teste, a previsão desta série errou em média ${formatMape(active.mape)}.`
      : "Não foi possível medir o erro desta série nas janelas de teste."
    : (insights.summary?.text ??
      `Nas janelas de teste, a previsão errou em média ${formatMape(insights.summary?.mape ?? insights.mape)}.`);
  const seasonality = active ? active.seasonality : insights.seasonality;
  const history = active ? active.history : insights.history;
  const predictions = active ? active.predictions : insights.predictions;
  const hasPredictions = predictions.length > 0;
  const backtest = active ? active.backtest : insights.backtest;
  const hasBacktest = Boolean(backtest && backtest.points.length > 0);
  const seasonalBuckets = seasonality?.buckets ?? [];
  const chartInsights: ForecastInsights = active
    ? { ...insights, history, predictions }
    : insights;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">
            Relatório de Insights — Previsão de série temporal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prevendo{" "}
            <span className="font-medium text-foreground">
              {metrics.target}
            </span>
            {seriesList.length > 0 ? (
              <>
                {" — "}
                {active ? (
                  <>
                    série{" "}
                    <span className="font-medium text-foreground">
                      {active.label}
                    </span>
                  </>
                ) : (
                  <>todas as séries (agregado)</>
                )}
                , frequência {insights.frequencyLabel}.
              </>
            ) : (
              <>
                {" — "}série {insights.frequencyLabel} projetada para os
                próximos períodos.
              </>
            )}
          </p>
        </div>
        {seriesList.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <label
              htmlFor={seriesSelectId}
              className="text-xs font-medium text-muted-foreground"
            >
              Série
            </label>
            <select
              id={seriesSelectId}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="h-9 max-w-56 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value={AGGREGATE_OPTION}>Todas (agregado)</option>
              {seriesList.map((series, index) => (
                <option key={series.id} value={String(index)}>
                  {series.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Resumo: erro médio + margem de confiança */}
      <div className={cn("grid gap-5", hasPredictions && "md:grid-cols-2")}>
        <SectionCard title="A previsão costuma errar">
          <p className="text-4xl font-semibold tabular-nums text-foreground">
            {mape !== null ? `±${formatMape(mape)}` : "—"}
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Erro médio (MAPE)
          </p>
          <p className="mt-3 text-sm text-foreground">{summaryText}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Para medir o erro, treinamos com o início do histórico e testamos
            nas últimas janelas da série, comparando previsão e valor real.
          </p>
          {seasonality && (
            <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <Repeat className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {seasonality.text}
                {seasonality.detected && (
                  <> O modelo usa esse padrão para projetar o futuro.</>
                )}
              </span>
            </p>
          )}
        </SectionCard>
        {hasPredictions && (
          <ConfidenceMarginCard
            predictions={predictions}
            frequencyLabel={insights.frequencyLabel}
          />
        )}
      </div>

      {/* Desempenho preditivo: real x previsto na janela de teste */}
      {backtest && hasBacktest && (
        <SectionCard
          title="Desempenho preditivo"
          subtitle={`Para encontrar os padrões dos seus dados, treinamos o modelo com o início do histórico e validamos nos últimos ${backtest.testPoints} períodos. Veja como ele se saiu.`}
        >
          <BacktestSection
            backtest={backtest}
            frequency={insights.frequency}
            target={metrics.target}
          />
        </SectionCard>
      )}

      {/* Histórico + previsão com seletor de horizonte */}
      {hasPredictions && (
        <SectionCard
          title="Histórico e Previsão"
          subtitle="Linha contínua: valores observados. Linha tracejada: previsão do modelo, com a faixa onde o valor real deve cair em 95% dos casos."
        >
          <ForecastChartSection
            insights={chartInsights}
            target={metrics.target}
            seriesLabel={active?.label}
          />
        </SectionCard>
      )}

      {/* Sazonalidade: impacto de cada período dentro do ciclo */}
      {seasonalBuckets.length > 0 && (
        <SectionCard
          title="Sazonalidade"
          subtitle="Variações que se repetem em intervalos regulares"
        >
          <SeasonalitySection
            buckets={seasonalBuckets}
            target={metrics.target}
          />
        </SectionCard>
      )}

      {/* Séries: uma linha por subsequência do ID Field */}
      {seriesList.length > 0 && (
        <SectionCard
          title="Séries"
          subtitle="Compare a qualidade e a tendência de cada subsequência. Clique numa linha para abrir o relatório dela."
        >
          <SeriesTableSection
            series={seriesList}
            selectedIndex={active ? Number(selected) : null}
            onSelect={(index) => setSelected(String(index))}
            seasonalPeriod={insights.seasonalPeriod}
            excludedSeries={insights.excludedSeries}
            truncatedSeries={insights.truncatedSeries}
          />
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
                (treinado com {metrics.rows.train} períodos, testado nos últimos{" "}
                {metrics.rows.validation})
              </span>
            )}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Algoritmo</th>
                  <th className="px-3 py-2 text-right">MAPE</th>
                  <th className="px-3 py-2 text-right">RMSE</th>
                  <th className="px-3 py-2 text-right">MAE</th>
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
                      {candidate.mape !== undefined
                        ? formatMape(candidate.mape)
                        : "—"}
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
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {candidate.configsTested}
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
            A seleção do vencedor usa MAPE (erro percentual absoluto médio —
            quanto menor, melhor) no backtest das últimas janelas da série.
          </p>
          {seriesList.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Com o campo de identificação, o algoritmo é escolhido uma única
              vez — sobre uma amostra das séries com mais histórico — e depois
              aplicado a todas as {seriesList.length.toLocaleString("pt-BR")}{" "}
              séries, cada uma treinada com os próprios dados. As métricas da
              tabela acima são a média dessa amostra, ponderada pelo tamanho de
              cada série.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

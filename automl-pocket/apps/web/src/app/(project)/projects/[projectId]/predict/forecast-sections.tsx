"use client";

import { useId, useMemo, useState } from "react";

import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  ChevronDown,
  Download,
  Info,
  Minus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { SectionCard } from "./classification-report";

import type {
  ForecastBacktest,
  ForecastInsights,
  ForecastPrediction,
  ForecastSeasonalityBucket,
  ForecastSeriesInsight,
} from "./forecasting-report";

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
}

/** MAPE vem como fração do worker (0.061 → "6,1%"). */
function formatMapeFraction(fraction: number): string {
  return `${(fraction * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatDate(iso: string, frequency: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (frequency === "h") {
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("pt-BR");
}

/** Número para célula de CSV: vírgula decimal e sem separador de milhar. */
function csvNumber(value: number): string {
  return value.toLocaleString("pt-BR", {
    useGrouping: false,
    maximumFractionDigits: 4,
  });
}

/** Minúsculo, sem acento, espaço → hífen — usado nos nomes de arquivo. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * previsao-{target}.csv com o alvo normalizado; com uma série do ID Field
 * selecionada (US-018), o identificador entra no nome:
 * previsao-{target}-{serie}.csv.
 */
function forecastFileName(target: string, seriesLabel?: string): string {
  const slug = slugify(target) || "modelo";
  const seriesSlug = seriesLabel ? slugify(seriesLabel) : "";
  return `previsao-${slug}${seriesSlug ? `-${seriesSlug}` : ""}.csv`;
}

/**
 * CSV da previsão inteira (US-007): separador ";" e vírgula decimal, o mesmo
 * padrão do CSV de predição em lote — abre no Excel pt-BR sem importar nada.
 */
function buildForecastCsv(
  predictions: ForecastPrediction[],
  frequency: string,
): string {
  const escape = (value: string) =>
    /[";\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  const lines = ["data;previsao;minimo;maximo"];
  for (const point of predictions) {
    lines.push(
      [
        formatDate(point.date, frequency),
        csvNumber(point.value),
        csvNumber(point.lower),
        csvNumber(point.upper),
      ]
        .map(escape)
        .join(";"),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 44;
const SPARK_PAD = 4;

/** Unidade natural do horizonte por rótulo de frequência do worker. */
const HORIZON_UNITS: Record<string, [string, string]> = {
  horária: ["hora", "horas"],
  diária: ["dia", "dias"],
  semanal: ["semana", "semanas"],
  mensal: ["mês", "meses"],
  trimestral: ["trimestre", "trimestres"],
  anual: ["ano", "anos"],
};

function horizonSpan(frequencyLabel: string, periods: number): string {
  const [singular, plural] = HORIZON_UNITS[
    frequencyLabel.trim().toLowerCase()
  ] ?? ["período", "períodos"];
  return `${periods.toLocaleString("pt-BR")} ${periods === 1 ? singular : plural}`;
}

/**
 * Card "Margem de confiança" do Resumo (US-003): mede quanto a incerteza
 * cresce do primeiro ao último período previsto. Tudo derivado de
 * `insights.forecast.predictions` — o worker não calcula nada disso.
 */
export function ConfidenceMarginCard({
  predictions,
  frequencyLabel,
}: {
  predictions: ForecastPrediction[];
  frequencyLabel: string;
}) {
  const margin = useMemo(() => {
    const first = predictions[0];
    const last = predictions[predictions.length - 1];
    if (!first || !last) return null;

    const start = (first.upper - first.lower) / 2;
    const end = (last.upper - last.lower) / 2;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

    const bounds = predictions.flatMap((point) => [point.lower, point.upper]);
    const rawMin = Math.min(...bounds);
    const rawMax = Math.max(...bounds);
    const innerWidth = SPARK_WIDTH - SPARK_PAD * 2;
    const innerHeight = SPARK_HEIGHT - SPARK_PAD * 2;
    const toX = (index: number) =>
      SPARK_PAD +
      (predictions.length <= 1
        ? innerWidth
        : (index / (predictions.length - 1)) * innerWidth);
    const toY = (value: number) =>
      SPARK_PAD + (1 - (value - rawMin) / (rawMax - rawMin || 1)) * innerHeight;

    const drawable =
      predictions.length > 1 &&
      Number.isFinite(rawMin) &&
      Number.isFinite(rawMax);
    const bandPath = drawable
      ? [
          ...predictions.map(
            (point, index) =>
              `${index === 0 ? "M" : "L"}${toX(index).toFixed(1)},${toY(point.upper).toFixed(1)}`,
          ),
          ...[...predictions]
            .reverse()
            .map(
              (point, index) =>
                `L${toX(predictions.length - 1 - index).toFixed(1)},${toY(point.lower).toFixed(1)}`,
            ),
          "Z",
        ].join(" ")
      : null;
    const linePath = drawable
      ? predictions
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"}${toX(index).toFixed(1)},${toY(point.value).toFixed(1)}`,
          )
          .join(" ")
      : null;

    return { start, end, growth: end - start, bandPath, linePath };
  }, [predictions]);

  if (!margin) return null;

  const span = horizonSpan(frequencyLabel, predictions.length);

  return (
    <SectionCard title="Margem de confiança">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-4xl font-semibold tabular-nums text-foreground">
            ±{formatNumber(margin.growth)}
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            de aumento ao longo de {span}
          </p>
        </div>
        {margin.bandPath && (
          <svg
            viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
            width={SPARK_WIDTH}
            height={SPARK_HEIGHT}
            className="shrink-0 rounded-md border border-border bg-muted/20"
            role="img"
            aria-label="Evolução da margem de confiança ao longo do horizonte"
          >
            <path
              d={margin.bandPath}
              className="fill-primary/20"
              stroke="none"
            />
            {margin.linePath && (
              <path
                d={margin.linePath}
                fill="none"
                stroke="currentColor"
                className="text-primary"
                strokeWidth={1.25}
              />
            )}
          </svg>
        )}
      </div>
      <p className="mt-3 text-sm text-foreground">
        A margem cresce de ±{formatNumber(margin.start)} a ±
        {formatNumber(margin.end)}.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Margens maiores significam menos certeza do modelo.
      </p>
    </SectionCard>
  );
}

const BT_WIDTH = 560;
const BT_HEIGHT = 220;
const BT_PAD_LEFT = 56;
const BT_PAD_RIGHT = 12;
const BT_PAD_Y = 14;

/**
 * Seção "Desempenho preditivo" (US-004): curva do valor real sobreposta à
 * do valor previsto na janela de backtest do modelo vencedor. Os pontos e
 * as métricas vêm prontos de `insights.forecast.backtest` (worker) — aqui
 * só há escala e desenho.
 */
export function BacktestSection({
  backtest,
  frequency,
  target,
}: {
  backtest: ForecastBacktest;
  frequency: string;
  target: string;
}) {
  const { points } = backtest;

  const chart = useMemo(() => {
    const values = points.flatMap((point) => [point.actual, point.predicted]);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = (rawMax - rawMin || 1) * 0.06;
    const min = rawMin - padding;
    const max = rawMax + padding;

    const innerWidth = BT_WIDTH - BT_PAD_LEFT - BT_PAD_RIGHT;
    const innerHeight = BT_HEIGHT - BT_PAD_Y * 2;
    const toX = (index: number) =>
      BT_PAD_LEFT +
      (points.length <= 1
        ? innerWidth
        : (index / (points.length - 1)) * innerWidth);
    const toY = (value: number) =>
      BT_PAD_Y + (1 - (value - min) / (max - min || 1)) * innerHeight;

    const path = (pick: (point: (typeof points)[number]) => number) =>
      points
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${toX(index).toFixed(1)},${toY(pick(point)).toFixed(1)}`,
        )
        .join(" ");

    return {
      actualPath: path((point) => point.actual),
      predictedPath: path((point) => point.predicted),
      min: rawMin,
      max: rawMax,
      minY: toY(rawMin),
      maxY: toY(rawMax),
    };
  }, [points]);

  const middle = points[Math.floor((points.length - 1) / 2)];
  const axisDates = [points[0], middle, points[points.length - 1]];

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      <div className="min-w-0 flex-1">
        {/* Legenda */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full bg-foreground/60"
              aria-hidden
            />
            Valor real
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary" aria-hidden />
            Previsão
          </span>
        </div>

        <svg
          viewBox={`0 0 ${BT_WIDTH} ${BT_HEIGHT}`}
          className="mt-2 w-full rounded-md border border-border bg-muted/20"
          role="img"
          aria-label={`Valor real e previsto de '${target}' nos ${backtest.testPoints} períodos de teste`}
        >
          {/* Eixo Y: mínimo e máximo observados */}
          {[
            { kind: "max", value: chart.max, y: chart.maxY },
            { kind: "min", value: chart.min, y: chart.minY },
          ].map((tick) => (
            <g key={tick.kind}>
              <line
                x1={BT_PAD_LEFT}
                y1={tick.y}
                x2={BT_WIDTH - BT_PAD_RIGHT}
                y2={tick.y}
                stroke="currentColor"
                className="text-border"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={BT_PAD_LEFT - 6}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {formatNumber(tick.value)}
              </text>
            </g>
          ))}
          {/* Valor real */}
          <path
            d={chart.actualPath}
            fill="none"
            stroke="currentColor"
            className="text-foreground/60"
            strokeWidth={1.5}
          />
          {/* Previsão do modelo */}
          <path
            d={chart.predictedPath}
            fill="none"
            stroke="currentColor"
            className="text-primary"
            strokeWidth={2}
          />
        </svg>
        <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
          {axisDates.map((point, index) => (
            <span key={`${point?.date ?? ""}-${index}`}>
              {point ? formatDate(point.date, frequency) : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Métricas do backtest */}
      <div className="flex shrink-0 flex-row flex-wrap gap-5 md:w-44 md:flex-col md:gap-4">
        <div>
          <p className="text-3xl font-semibold tabular-nums text-foreground">
            ±{formatMapeFraction(backtest.mape)}
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            A previsão costuma errar
          </p>
        </div>
        <div>
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {formatNumber(backtest.rmse)}
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            RMSE
          </p>
        </div>
        <div>
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {formatNumber(backtest.mae)}
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            MAE
          </p>
        </div>
        <p className="w-full rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          RMSE (raiz do erro quadrático médio) mede o quanto as previsões erram
          em média, penalizando mais os erros grandes. Quanto menor, melhor.
        </p>
      </div>
    </div>
  );
}

const SEA_WIDTH = 640;
const SEA_HEIGHT = 260;
const SEA_PAD_LEFT = 48;
const SEA_PAD_RIGHT = 10;
/** Acima disso os rótulos percentuais não caberiam lado a lado (ex.: 24 horas) */
const SEA_DENSE_ITEMS = 12;

/** Impacto vem como fração do worker (0.145 → "+14,5%"). */
function formatSignedPctFraction(fraction: number): string {
  if (fraction === 0) return "0%";
  const pct = (Math.abs(fraction) * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${fraction > 0 ? "+" : "-"}${pct}%`;
}

/**
 * Gráfico de barras de um bucket sazonal: linha de base em 0%, barras verdes
 * acima e vermelhas abaixo, com o impacto rotulado no topo de cada barra.
 * Os impactos vêm prontos do worker (`seasonality.buckets[].items`).
 */
function SeasonalityChart({
  bucket,
  target,
}: {
  bucket: ForecastSeasonalityBucket;
  target: string;
}) {
  const { items } = bucket;

  const chart = useMemo(() => {
    const dense = items.length > SEA_DENSE_ITEMS;
    // Rótulo rotulado na vertical quando há muitas barras: precisa de mais
    // folga acima/abaixo do que o rótulo horizontal
    const labelRoom = dense ? 40 : 18;
    const padTop = labelRoom;
    // + faixa dos rótulos do eixo X, sempre horizontais
    const padBottom = labelRoom + 16;

    const impacts = items.map((item) => item.impact);
    const rawMax = Math.max(0, ...impacts);
    const rawMin = Math.min(0, ...impacts);
    const span = rawMax - rawMin || 1;
    const max = rawMax + span * 0.08;
    const min = rawMin - span * 0.08;

    const innerWidth = SEA_WIDTH - SEA_PAD_LEFT - SEA_PAD_RIGHT;
    const innerHeight = SEA_HEIGHT - padTop - padBottom;
    const slot = items.length > 0 ? innerWidth / items.length : innerWidth;
    const barWidth = Math.max(4, Math.min(36, slot * 0.62));
    const toX = (index: number) => SEA_PAD_LEFT + slot * (index + 0.5);
    const toY = (value: number) =>
      padTop + (1 - (value - min) / (max - min || 1)) * innerHeight;

    const zeroY = toY(0);
    const bars = items.map((item, index) => {
      const tipY = toY(item.impact);
      const positive = item.impact > 0;
      return {
        item,
        centerX: toX(index),
        tipY,
        top: Math.min(tipY, zeroY),
        height: Math.max(1, Math.abs(tipY - zeroY)),
        positive,
        zero: item.impact === 0,
      };
    });

    // Eixo Y em pontos percentuais: extremos observados + a linha de base
    const ticks = [rawMax, rawMin]
      .filter((value) => value !== 0)
      .map((value) => ({ value, y: toY(value) }));

    return { dense, bars, barWidth, zeroY, ticks, padBottom };
  }, [items]);

  return (
    <div>
      <p className="text-sm font-medium text-foreground">
        Impacto {bucket.label} em {target}
      </p>
      <svg
        viewBox={`0 0 ${SEA_WIDTH} ${SEA_HEIGHT}`}
        className="mt-2 w-full rounded-md border border-border bg-muted/20"
        role="img"
        aria-label={`Impacto ${bucket.label} em '${target}', em variação percentual sobre a média da série`}
      >
        {/* Eixo Y: extremos observados */}
        {chart.ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={SEA_PAD_LEFT}
              y1={tick.y}
              x2={SEA_WIDTH - SEA_PAD_RIGHT}
              y2={tick.y}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <text
              x={SEA_PAD_LEFT - 6}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {formatSignedPctFraction(tick.value)}
            </text>
          </g>
        ))}

        {/* Linha de base em 0% */}
        <line
          x1={SEA_PAD_LEFT}
          y1={chart.zeroY}
          x2={SEA_WIDTH - SEA_PAD_RIGHT}
          y2={chart.zeroY}
          stroke="currentColor"
          className="text-muted-foreground/50"
          strokeWidth={1}
        />
        <text
          x={SEA_PAD_LEFT - 6}
          y={chart.zeroY}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-muted-foreground text-[10px] tabular-nums"
        >
          0%
        </text>

        {chart.bars.map((bar) => (
          <g key={bar.item.label}>
            <rect
              x={bar.centerX - chart.barWidth / 2}
              y={bar.top}
              width={chart.barWidth}
              height={bar.height}
              rx={2}
              className={cn(
                bar.zero && "fill-muted-foreground/40",
                bar.positive && "fill-emerald-500",
                !bar.zero && !bar.positive && "fill-red-400",
              )}
            >
              <title>
                {`${bar.item.label}: ${formatSignedPctFraction(bar.item.impact)} (${bar.item.count.toLocaleString("pt-BR")} períodos)`}
              </title>
            </rect>
            {/* Rótulo percentual no topo da barra */}
            <text
              x={bar.centerX}
              y={bar.positive ? bar.tipY - 5 : bar.tipY + 5}
              textAnchor={
                chart.dense ? (bar.positive ? "start" : "end") : "middle"
              }
              dominantBaseline={
                chart.dense ? "middle" : bar.positive ? "auto" : "hanging"
              }
              transform={
                chart.dense
                  ? `rotate(-90 ${bar.centerX} ${bar.positive ? bar.tipY - 5 : bar.tipY + 5})`
                  : undefined
              }
              className="fill-muted-foreground text-[9px] tabular-nums"
            >
              {formatSignedPctFraction(bar.item.impact)}
            </text>
            {/* Eixo X: rótulo do período */}
            <text
              x={bar.centerX}
              y={SEA_HEIGHT - 5}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {bar.item.label}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-2 text-xs text-muted-foreground">
        Cada barra compara a média do período com a média geral da série, já
        descontada a tendência de longo prazo.
      </p>
    </div>
  );
}

/**
 * Seção "Sazonalidade" (US-005): abas por bucket temporal
 * (`insights.forecast.seasonality.buckets`) e o gráfico da aba ativa.
 * A aba selecionada é estado local — nada é recalculado no servidor.
 */
export function SeasonalitySection({
  buckets,
  target,
}: {
  buckets: ForecastSeasonalityBucket[];
  target: string;
}) {
  const [activeKey, setActiveKey] = useState(buckets[0]?.key ?? "");
  const active =
    buckets.find((bucket) => bucket.key === activeKey) ?? buckets[0];

  if (!active) return null;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-5">
      {/* Abas: coluna à esquerda no desktop, linha rolável no mobile */}
      <div
        role="tablist"
        aria-label="Bucket temporal da sazonalidade"
        aria-orientation="vertical"
        className="-mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:w-44 md:flex-col md:overflow-x-visible md:px-0 md:pb-0"
      >
        {buckets.map((bucket) => {
          const selected = bucket.key === active.key;
          return (
            <button
              key={bucket.key}
              type="button"
              role="tab"
              id={`seasonality-tab-${bucket.key}`}
              aria-selected={selected}
              aria-controls={`seasonality-panel-${bucket.key}`}
              onClick={() => setActiveKey(bucket.key)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-left text-xs font-medium whitespace-nowrap transition-colors md:w-full",
                selected
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {bucket.label}
            </button>
          );
        })}
      </div>

      {/* Gráfico da aba ativa */}
      <div
        role="tabpanel"
        id={`seasonality-panel-${active.key}`}
        aria-labelledby={`seasonality-tab-${active.key}`}
        className="min-w-0 flex-1"
      >
        <SeasonalityChart bucket={active} target={target} />
      </div>
    </div>
  );
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 280;
const PAD_X = 12;
const PAD_Y = 14;

/**
 * Gráfico de linha histórico + previsão com banda de IC e seletor de
 * horizonte. Tudo client-side: os horizontes só fatiam `predictions`
 * (já computadas pelo worker), sem novo request nem novo treino.
 */
export function ForecastChartSection({
  insights,
  target,
  seriesLabel,
}: {
  insights: ForecastInsights;
  target: string;
  /** Série ativa do ID Field (US-018): entra no nome do arquivo do CSV. */
  seriesLabel?: string;
}) {
  const { history, predictions, horizons, frequency, frequencyLabel } =
    insights;
  const defaultHorizon = horizons.includes(30) ? 30 : (horizons[0] ?? 30);
  const [horizon, setHorizon] = useState(defaultHorizon);
  // Ligado por padrão: preserva o comportamento anterior ao toggle
  const [showInterval, setShowInterval] = useState(true);
  const intervalToggleId = useId();

  const chart = useMemo(() => {
    const shownPredictions = predictions.slice(0, horizon);
    // Cauda do histórico proporcional ao horizonte, senão a previsão de 7
    // períodos ficaria invisível ao lado de 365 pontos de histórico
    const historyWindow = Math.min(history.length, Math.max(horizon * 3, 30));
    const shownHistory = history.slice(history.length - historyWindow);

    const lastHistory = shownHistory[shownHistory.length - 1];
    // Último ponto do histórico prefixado à previsão: linha e banda contínuas
    const forecastLine = lastHistory
      ? [
          {
            date: lastHistory.date,
            value: lastHistory.value,
            lower: lastHistory.value,
            upper: lastHistory.value,
          },
          ...shownPredictions,
        ]
      : shownPredictions;

    const total = shownHistory.length + shownPredictions.length;
    // Com o IC oculto a banda não entra na escala: senão o gráfico continuaria
    // achatado (e os rótulos de mín/máx citariam limites invisíveis)
    const values = [
      ...shownHistory.map((point) => point.value),
      ...shownPredictions.flatMap((point) =>
        showInterval ? [point.lower, point.value, point.upper] : [point.value],
      ),
    ];
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = (rawMax - rawMin || 1) * 0.06;
    const min = rawMin - padding;
    const max = rawMax + padding;

    const innerWidth = CHART_WIDTH - PAD_X * 2;
    const innerHeight = CHART_HEIGHT - PAD_Y * 2;
    const toX = (index: number) =>
      PAD_X + (total <= 1 ? 0 : (index / (total - 1)) * innerWidth);
    const toY = (value: number) =>
      PAD_Y + (1 - (value - min) / (max - min || 1)) * innerHeight;

    const historyPath = shownHistory
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${toX(index).toFixed(1)},${toY(point.value).toFixed(1)}`,
      )
      .join(" ");

    const boundaryIndex = shownHistory.length - 1;
    const forecastPath = forecastLine
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${toX(boundaryIndex + index).toFixed(1)},${toY(point.value).toFixed(1)}`,
      )
      .join(" ");

    const bandPath =
      forecastLine.length > 1
        ? [
            ...forecastLine.map(
              (point, index) =>
                `${index === 0 ? "M" : "L"}${toX(boundaryIndex + index).toFixed(1)},${toY(point.upper).toFixed(1)}`,
            ),
            ...[...forecastLine]
              .reverse()
              .map(
                (point, index) =>
                  `L${toX(boundaryIndex + forecastLine.length - 1 - index).toFixed(1)},${toY(point.lower).toFixed(1)}`,
              ),
            "Z",
          ].join(" ")
        : null;

    return {
      shownHistory,
      shownPredictions,
      boundaryX: toX(boundaryIndex),
      historyPath,
      forecastPath,
      bandPath,
      min: rawMin,
      max: rawMax,
      toX,
      toY,
      boundaryIndex,
    };
  }, [history, predictions, horizon, showInterval]);

  function downloadCsv() {
    // BOM UTF-8 (utf-8-sig) para o Excel pt-BR abrir acentos corretamente.
    // Exporta `predictions` inteiro, não a fatia do horizonte visível.
    const blob = new Blob(
      [`\ufeff${buildForecastCsv(predictions, frequency)}`],
      {
        type: "text/csv;charset=utf-8",
      },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = forecastFileName(target, seriesLabel);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const firstDate = chart.shownHistory[0]?.date;
  const boundaryDate = chart.shownHistory[chart.shownHistory.length - 1]?.date;
  const lastDate =
    chart.shownPredictions[chart.shownPredictions.length - 1]?.date;

  return (
    <div>
      {/* Seletor de horizonte e toggle do intervalo de confiança */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Previsão de{" "}
          <span className="font-medium text-foreground">{target}</span> para os
          próximos períodos (frequência {frequencyLabel}).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor={intervalToggleId}
            className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground"
          >
            <Checkbox
              id={intervalToggleId}
              checked={showInterval}
              onCheckedChange={(value) => setShowInterval(value === true)}
            />
            Mostrar intervalo de confiança
          </label>
          <div
            className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
            role="group"
            aria-label="Horizonte da previsão"
          >
            {horizons.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setHorizon(option)}
                aria-pressed={horizon === option}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  horizon === option
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option} períodos
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="mt-3">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full rounded-md border border-border bg-muted/20"
          role="img"
          aria-label={`Histórico e previsão de '${target}' para ${horizon} períodos`}
        >
          {/* Banda do intervalo de confiança (95%) */}
          {showInterval && chart.bandPath && (
            <path
              d={chart.bandPath}
              className="fill-primary/15"
              stroke="none"
            />
          )}
          {/* Divisor: fim do histórico, início da previsão */}
          <line
            x1={chart.boundaryX}
            y1={PAD_Y / 2}
            x2={chart.boundaryX}
            y2={CHART_HEIGHT - PAD_Y / 2}
            stroke="currentColor"
            className="text-muted-foreground/40"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          {/* Histórico */}
          <path
            d={chart.historyPath}
            fill="none"
            stroke="currentColor"
            className="text-foreground/70"
            strokeWidth={1.5}
          />
          {/* Previsão (tracejada) */}
          <path
            d={chart.forecastPath}
            fill="none"
            stroke="currentColor"
            className="text-primary"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
          {/* Pontos da previsão em horizontes curtos, com tooltip nativo */}
          {chart.shownPredictions.length <= 30 &&
            chart.shownPredictions.map((point, index) => (
              <circle
                key={point.date}
                cx={chart.toX(chart.boundaryIndex + 1 + index)}
                cy={chart.toY(point.value)}
                r={2.5}
                className="fill-primary"
              >
                <title>
                  {`${formatDate(point.date, frequency)}: ${formatNumber(point.value)}${
                    showInterval
                      ? ` (IC 95%: ${formatNumber(point.lower)} a ${formatNumber(point.upper)})`
                      : ""
                  }`}
                </title>
              </circle>
            ))}
        </svg>
        <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>{firstDate ? formatDate(firstDate, frequency) : ""}</span>
          <span>
            {boundaryDate
              ? `${formatDate(boundaryDate, frequency)} · início da previsão`
              : ""}
          </span>
          <span>{lastDate ? formatDate(lastDate, frequency) : ""}</span>
        </div>
        <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>mín: {formatNumber(chart.min)}</span>
          <span>máx: {formatNumber(chart.max)}</span>
        </div>
      </div>

      {/* Legenda */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-0.5 w-6 rounded-full bg-foreground/70"
            aria-hidden
          />
          Histórico
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-0.5 w-6 rounded-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to right, var(--primary) 0 6px, transparent 6px 10px)",
            }}
            aria-hidden
          />
          Previsão
        </span>
        {showInterval && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-6 rounded-sm bg-primary/15" aria-hidden />
            Intervalo de confiança (95%)
          </span>
        )}
      </div>

      {/* Tabela da previsão */}
      <details className="group mt-3 border-t border-border pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-primary [&::-webkit-details-marker]:hidden">
          <ChevronDown
            className="size-3.5 transition-transform group-open:rotate-180"
            aria-hidden
          />
          <span className="group-open:hidden">Mostrar tabela</span>
          <span className="hidden group-open:inline">Ocultar tabela</span>
        </summary>
        <div className="mt-3 max-h-72 overflow-auto rounded-md border border-border">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2 text-right">Previsão</th>
                {showInterval && (
                  <>
                    <th className="px-3 py-2 text-right">Mínimo (IC 95%)</th>
                    <th className="px-3 py-2 text-right">Máximo (IC 95%)</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {chart.shownPredictions.map((point) => (
                <tr
                  key={point.date}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-3 py-2 tabular-nums text-foreground">
                    {formatDate(point.date, frequency)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                    {formatNumber(point.value)}
                  </td>
                  {showInterval && (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatNumber(point.lower)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatNumber(point.upper)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Rodapé: download da previsão completa */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          O arquivo traz todos os {predictions.length.toLocaleString("pt-BR")}{" "}
          períodos previstos, não só os do gráfico.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={downloadCsv}>
          <Download aria-hidden />
          Baixar previsão (CSV)
        </Button>
      </div>
    </div>
  );
}

/** Colunas ordenáveis da tabela de séries (US-019). */
type SeriesSortKey = "label" | "mape" | "change";

/** Direção inicial de cada coluna: menor MAPE e maior crescimento primeiro. */
const SERIES_SORT_DEFAULT_DIR: Record<SeriesSortKey, "asc" | "desc"> = {
  label: "asc",
  mape: "asc",
  change: "desc",
};

type SeriesRow = {
  /** Índice na lista recebida — é o valor esperado por `onSelect`. */
  index: number;
  series: ForecastSeriesInsight;
  /**
   * Variação entre a média do último ciclo observado e a média do horizonte
   * previsto. `null` quando a base é ~0 (divisão instável) ou falta dado.
   */
  change: number | null;
};

/**
 * Variação percentual entre a média do último ciclo observado (os últimos
 * `cycle` pontos do histórico) e a média de todo o horizonte previsto.
 */
function seriesChange(
  series: ForecastSeriesInsight,
  cycle: number,
): number | null {
  const window = series.history.slice(-Math.max(1, cycle));
  if (window.length === 0 || series.predictions.length === 0) return null;
  const base =
    window.reduce((sum, point) => sum + point.value, 0) / window.length;
  if (Math.abs(base) < 1e-9) return null;
  const forecast =
    series.predictions.reduce((sum, point) => sum + point.value, 0) /
    series.predictions.length;
  return (forecast - base) / Math.abs(base);
}

/** Cabeçalho clicável de coluna ordenável. */
function SeriesSortHeader({
  column,
  label,
  sort,
  onSort,
  align = "right",
}: {
  column: SeriesSortKey;
  label: string;
  sort: { key: SeriesSortKey; dir: "asc" | "desc" } | null;
  onSort: (key: SeriesSortKey) => void;
  align?: "left" | "right";
}) {
  const activeDir = sort?.key === column ? sort.dir : null;
  return (
    <th
      scope="col"
      aria-sort={
        activeDir === null
          ? "none"
          : activeDir === "asc"
            ? "ascending"
            : "descending"
      }
      className={cn(
        "px-3 py-2",
        align === "left" ? "pr-4 pl-0 text-left" : "text-right",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm font-semibold uppercase tracking-wide transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          activeDir !== null && "text-foreground",
        )}
      >
        <ArrowUpDown className="size-3 shrink-0 opacity-60" aria-hidden />
        {label}
      </button>
    </th>
  );
}

/**
 * Seção "Séries" (US-019): uma linha por subsequência do ID Field, com
 * períodos, MAPE e a tendência prevista. Clicar numa linha troca a série
 * ativa do relatório (o seletor da US-018).
 */
export function SeriesTableSection({
  series,
  selectedIndex,
  onSelect,
  seasonalPeriod,
  excludedSeries,
  truncatedSeries,
}: {
  /** Já ordenada por nº de períodos desc — é a ordem default da tabela. */
  series: ForecastSeriesInsight[];
  /** Índice da série ativa; `null` na visão agregada. */
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  seasonalPeriod: number;
  excludedSeries?: number;
  truncatedSeries?: { shown: number; total: number };
}) {
  const [sort, setSort] = useState<{
    key: SeriesSortKey;
    dir: "asc" | "desc";
  } | null>(null);

  const rows = useMemo(() => {
    const cycle = Math.max(1, seasonalPeriod);
    const base: SeriesRow[] = series.map((item, index) => ({
      index,
      series: item,
      change: seriesChange(item, cycle),
    }));
    if (!sort) return base;

    const factor = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sort.key === "label") {
        return a.series.label.localeCompare(b.series.label, "pt-BR") * factor;
      }
      const left = sort.key === "mape" ? a.series.mape : a.change;
      const right = sort.key === "mape" ? b.series.mape : b.change;
      // Séries sem métrica ficam sempre no fim, independente da direção
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return (left - right) * factor;
    });
  }, [series, sort, seasonalPeriod]);

  const toggleSort = (key: SeriesSortKey) => {
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: SERIES_SORT_DEFAULT_DIR[key] },
    );
  };

  return (
    <div>
      {(truncatedSeries || (excludedSeries ?? 0) > 0) && (
        <div className="mb-3 flex flex-col gap-2">
          {truncatedSeries && (
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Mostrando as {truncatedSeries.shown.toLocaleString("pt-BR")}{" "}
                séries com mais histórico, de{" "}
                {truncatedSeries.total.toLocaleString("pt-BR")} encontradas.
              </span>
            </p>
          )}
          {(excludedSeries ?? 0) > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {(excludedSeries ?? 0).toLocaleString("pt-BR")} séries ficaram
                de fora por terem menos de 10 períodos.
              </span>
            </p>
          )}
        </div>
      )}

      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="sticky top-0 z-[1] bg-card">
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <SeriesSortHeader
                column="label"
                label="Identificador"
                sort={sort}
                onSort={toggleSort}
                align="left"
              />
              <th scope="col" className="px-3 py-2 text-right">
                Períodos
              </th>
              <SeriesSortHeader
                column="mape"
                label="MAPE"
                sort={sort}
                onSort={toggleSort}
              />
              <SeriesSortHeader
                column="change"
                label="Variação prevista"
                sort={sort}
                onSort={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = row.index === selectedIndex;
              return (
                <tr
                  key={row.index}
                  onClick={() => onSelect(row.index)}
                  className={cn(
                    "cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/60",
                    selected && "bg-primary/5",
                  )}
                >
                  <td className="py-2.5 pr-4 font-medium text-foreground">
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(row.index);
                      }}
                      className="max-w-56 truncate text-left hover:underline"
                    >
                      {row.series.label}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {row.series.points.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    {row.series.mape !== null
                      ? formatMapeFraction(row.series.mape)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <SeriesChangeCell change={row.change} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        A variação compara a média do último ciclo observado com a média de todo
        o horizonte previsto de cada série.
      </p>
    </div>
  );
}

/** Célula de variação: seta e cor conforme o sinal. */
function SeriesChangeCell({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const positive = change > 0;
  const negative = change < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 font-medium",
        positive && "text-emerald-600 dark:text-emerald-400",
        negative && "text-red-600 dark:text-red-400",
        !positive && !negative && "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {formatSignedPctFraction(change)}
    </span>
  );
}

"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  SampleRow,
  SampleRowValue,
  SampleRows,
  ThresholdChart,
} from "./classification-report";

function formatPctValue(value: number, decimals = 1): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

// --- Explorador de limiar ----------------------------------------------------

// Faixa de incerteza em pontos percentuais ao redor do limiar: linhas com
// probabilidade dentro dela caem no grupo "Incerto"
const UNCERTAIN_BAND_PP = 10;

const CHART_WIDTH = 400;
const CHART_HEIGHT = 96;

const GROUP_STYLES = [
  { key: "unlikely", label: "Improvável", dot: "bg-slate-400" },
  { key: "uncertain", label: "Incerto", dot: "bg-amber-500" },
  { key: "likely", label: "Provável", dot: "bg-emerald-500" },
] as const;

/**
 * Densidades das classes sobre o eixo de probabilidade com slider de limiar;
 * mover o slider reagrupa as linhas em Improvável/Incerto/Provável
 * client-side, sem novo request (US-022).
 */
export function ThresholdSection({ chart }: { chart: ThresholdChart }) {
  const [threshold, setThreshold] = useState(50);

  const total = useMemo(
    () => chart.bins.reduce((acc, bin) => acc + bin.positive + bin.negative, 0),
    [chart.bins],
  );

  const groups = useMemo(() => {
    let unlikely = 0;
    let uncertain = 0;
    let likely = 0;
    for (const bin of chart.bins) {
      const midPct = ((bin.from + bin.to) / 2) * 100;
      const count = bin.positive + bin.negative;
      if (midPct < threshold - UNCERTAIN_BAND_PP) unlikely += count;
      else if (midPct > threshold + UNCERTAIN_BAND_PP) likely += count;
      else uncertain += count;
    }
    return { unlikely, uncertain, likely };
  }, [chart.bins, threshold]);

  const maxCount = Math.max(
    ...chart.bins.map((bin) => Math.max(bin.positive, bin.negative)),
    1,
  );

  const bandFrom =
    (Math.max(threshold - UNCERTAIN_BAND_PP, 0) / 100) * CHART_WIDTH;
  const bandTo =
    (Math.min(threshold + UNCERTAIN_BAND_PP, 100) / 100) * CHART_WIDTH;
  const thresholdX = (threshold / 100) * CHART_WIDTH;

  return (
    <div>
      {/* Gráfico de densidades */}
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Distribuição das linhas de validação por probabilidade prevista de '${chart.positiveClass}'`}
      >
        <rect
          x={bandFrom}
          y={0}
          width={Math.max(bandTo - bandFrom, 0)}
          height={CHART_HEIGHT}
          className="fill-amber-400/15"
        />
        {chart.bins.map((bin) => {
          const x = bin.from * CHART_WIDTH;
          const width = (bin.to - bin.from) * CHART_WIDTH;
          const negativeHeight = (bin.negative / maxCount) * (CHART_HEIGHT - 4);
          const positiveHeight = (bin.positive / maxCount) * (CHART_HEIGHT - 4);
          return (
            <g key={bin.from}>
              <rect
                x={x + width * 0.12}
                y={CHART_HEIGHT - negativeHeight}
                width={width * 0.34}
                height={negativeHeight}
                rx={1}
                className="fill-slate-300"
              />
              <rect
                x={x + width * 0.54}
                y={CHART_HEIGHT - positiveHeight}
                width={width * 0.34}
                height={positiveHeight}
                rx={1}
                className="fill-emerald-500"
              />
            </g>
          );
        })}
        <line
          x1={thresholdX}
          y1={0}
          x2={thresholdX}
          y2={CHART_HEIGHT}
          strokeDasharray="4 3"
          strokeWidth={1.5}
          className="stroke-primary"
        />
        <line
          x1={0}
          y1={CHART_HEIGHT - 0.5}
          x2={CHART_WIDTH}
          y2={CHART_HEIGHT - 0.5}
          strokeWidth={1}
          className="stroke-border"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>

      {/* Legenda */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-500" aria-hidden />
          Linhas que realmente são &lsquo;{chart.positiveClass}&rsquo;
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-slate-300" aria-hidden />
          Demais linhas
        </span>
      </div>

      {/* Slider de limiar */}
      <div className="mt-4">
        <label
          htmlFor="threshold-slider"
          className="flex items-baseline justify-between text-sm font-medium text-foreground"
        >
          Limiar de decisão
          <span className="tabular-nums text-primary">{threshold}%</span>
        </label>
        <input
          id="threshold-slider"
          type="range"
          min={0}
          max={100}
          step={5}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
          className="mt-2 w-full accent-primary"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Linhas até {UNCERTAIN_BAND_PP} pontos percentuais do limiar são
          consideradas incertas.
        </p>
      </div>

      {/* Grupos recalculados client-side */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {GROUP_STYLES.map((group) => {
          const count = groups[group.key];
          return (
            <div
              key={group.key}
              className="rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn("size-2.5 rounded-full", group.dot)}
                  aria-hidden
                />
                <p className="text-sm font-medium text-foreground">
                  {group.label}
                </p>
              </div>
              <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">
                {count.toLocaleString("pt-BR")}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatPctValue(total > 0 ? (count / total) * 100 : 0)} das
                linhas de validação
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Linhas de Exemplo -------------------------------------------------------

const ACTUAL_KEY = "__actual";
const PREDICTED_KEY = "__predicted";
const PROBABILITY_KEY = "__probability";

type SortState = { key: string; dir: 1 | -1 };

function cellValue(row: SampleRow, key: string): SampleRowValue {
  if (key === ACTUAL_KEY) return row.actual;
  if (key === PREDICTED_KEY) return row.predicted;
  if (key === PROBABILITY_KEY) return row.probability;
  return row.values[key] ?? null;
}

function compareValues(a: SampleRowValue, b: SampleRowValue): number {
  if (a === null && b === null) return 0;
  // Vazios sempre por último, independente da direção
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
}

function formatCell(value: SampleRowValue): string {
  if (value === null || value === "") return "—";
  if (typeof value === "number")
    return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return String(value);
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th className={cn("px-3 py-2", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Ordenar por ${label}`}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="max-w-28 truncate">{label}</span>
        {active ? (
          sort.dir === 1 ? (
            <ArrowUp className="size-3 shrink-0" aria-hidden />
          ) : (
            <ArrowDown className="size-3 shrink-0" aria-hidden />
          )
        ) : (
          <ChevronsUpDown
            className="size-3 shrink-0 opacity-50"
            aria-hidden
          />
        )}
      </button>
    </th>
  );
}

/**
 * Tabela de linhas de validação com probabilidade prevista, ordenável por
 * qualquer coluna e com filtro por faixa de probabilidade — tudo client-side
 * (US-022).
 */
export function SampleRowsSection({
  data,
  positiveClass,
}: {
  data: SampleRows;
  positiveClass: string;
}) {
  const [sort, setSort] = useState<SortState>({
    key: PROBABILITY_KEY,
    dir: -1,
  });
  const [minPct, setMinPct] = useState(0);
  const [maxPct, setMaxPct] = useState(100);

  const handleSort = (key: string) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 1 ? -1 : 1 }
        : { key, dir: key === PROBABILITY_KEY ? -1 : 1 },
    );
  };

  const visibleRows = useMemo(() => {
    const filtered = data.rows.filter((row) => {
      const pct = row.probability * 100;
      return pct >= minPct && pct <= maxPct;
    });
    return filtered.sort(
      (a, b) => compareValues(cellValue(a, sort.key), cellValue(b, sort.key)) * sort.dir,
    );
  }, [data.rows, sort, minPct, maxPct]);

  return (
    <div>
      {/* Filtro por faixa de probabilidade */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-40 flex-1">
          <label
            htmlFor="prob-min"
            className="flex items-baseline justify-between text-xs font-medium text-foreground"
          >
            Probabilidade mínima
            <span className="tabular-nums text-muted-foreground">
              {minPct}%
            </span>
          </label>
          <input
            id="prob-min"
            type="range"
            min={0}
            max={100}
            step={5}
            value={minPct}
            onChange={(event) =>
              setMinPct(Math.min(Number(event.target.value), maxPct))
            }
            className="mt-1.5 w-full accent-primary"
          />
        </div>
        <div className="min-w-40 flex-1">
          <label
            htmlFor="prob-max"
            className="flex items-baseline justify-between text-xs font-medium text-foreground"
          >
            Probabilidade máxima
            <span className="tabular-nums text-muted-foreground">
              {maxPct}%
            </span>
          </label>
          <input
            id="prob-max"
            type="range"
            min={0}
            max={100}
            step={5}
            value={maxPct}
            onChange={(event) =>
              setMaxPct(Math.max(Number(event.target.value), minPct))
            }
            className="mt-1.5 w-full accent-primary"
          />
        </div>
        <p className="shrink-0 pb-1 text-xs tabular-nums text-muted-foreground">
          Mostrando {visibleRows.length.toLocaleString("pt-BR")} de{" "}
          {data.rows.length.toLocaleString("pt-BR")} linhas
        </p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {data.columns.map((column) => (
                <SortableHeader
                  key={column}
                  label={column}
                  sortKey={column}
                  sort={sort}
                  onSort={handleSort}
                />
              ))}
              <SortableHeader
                label="Real"
                sortKey={ACTUAL_KEY}
                sort={sort}
                onSort={handleSort}
              />
              <SortableHeader
                label="Previsto"
                sortKey={PREDICTED_KEY}
                sort={sort}
                onSort={handleSort}
              />
              <SortableHeader
                label={`Prob. de '${positiveClass}'`}
                sortKey={PROBABILITY_KEY}
                sort={sort}
                onSort={handleSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr
                key={index}
                className="border-b border-border/60 last:border-0"
              >
                {data.columns.map((column) => (
                  <td
                    key={column}
                    className="max-w-40 truncate px-3 py-2 text-foreground"
                    title={formatCell(cellValue(row, column))}
                  >
                    {formatCell(cellValue(row, column))}
                  </td>
                ))}
                <td className="max-w-40 truncate px-3 py-2 text-foreground">
                  {row.actual}
                </td>
                <td
                  className={cn(
                    "max-w-40 truncate px-3 py-2",
                    row.predicted === row.actual
                      ? "text-foreground"
                      : "font-medium text-red-600",
                  )}
                  title={
                    row.predicted === row.actual
                      ? "O modelo acertou esta linha"
                      : "O modelo errou esta linha"
                  }
                >
                  {row.predicted}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {formatPctValue(row.probability * 100)}
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={data.columns.length + 3}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  Nenhuma linha na faixa de probabilidade selecionada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

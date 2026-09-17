"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, MousePointerClick } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  FactorItem,
  Segment,
  SegmentAttribute,
  TopFactorEntry,
  TopField,
} from "./classification-report";

const INITIAL_FIELDS = 8;

function formatPctValue(value: number, decimals = 1): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

function formatSignedPct(value: number): string {
  const formatted = formatPctValue(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Pill de impacto direcional: verde positivo, vermelho negativo. */
function ImpactPill({ impact }: { impact: number }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        impact > 0 && "bg-emerald-100 text-emerald-700",
        impact < 0 && "bg-red-100 text-red-700",
        impact === 0 && "bg-muted text-muted-foreground",
      )}
    >
      {formatSignedPct(impact)}
    </span>
  );
}

function FactorRow({
  factor,
  positiveClass,
}: {
  factor: FactorItem;
  positiveClass: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">
          {factor.label}
        </p>
        <ImpactPill impact={factor.impact} />
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            factor.impact >= 0 ? "bg-emerald-500" : "bg-red-400",
          )}
          style={{
            width: `${Math.min(Math.max(factor.outcomeRate * 100, 1), 100)}%`,
          }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {factor.count.toLocaleString("pt-BR")} linhas (
        {formatPctValue(factor.pct)}) · taxa de &lsquo;{positiveClass}&rsquo;:{" "}
        {formatPctValue(factor.outcomeRate * 100)}
      </p>
    </div>
  );
}

/**
 * Campos Principais: barras horizontais com % de contribuição, "+ ver mais"
 * e painel de faixas/impacto ao clicar num campo (US-021). Sem `topFactors`
 * (regressão, US-023), vira uma lista estática de barras, sem painel.
 */
export function TopFieldsSection({
  topFields,
  topFactors = [],
  positiveClass,
}: {
  topFields: TopField[];
  topFactors?: TopFactorEntry[];
  positiveClass?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const interactive = topFactors.length > 0;
  const visible = expanded ? topFields : topFields.slice(0, INITIAL_FIELDS);
  const hidden = topFields.length - INITIAL_FIELDS;
  const maxPct = Math.max(...topFields.map((field) => field.pct), 1);
  const selectedEntry = selected
    ? topFactors.find((entry) => entry.column === selected)
    : undefined;

  const fieldList = (
    <div>
      <div className="flex flex-col gap-1">
        {visible.map((field) => {
          const isSelected = selected === field.column;
          const content = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">
                  {field.column}
                </p>
                <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatPctValue(field.pct)}
                </p>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(Math.max((field.pct / maxPct) * 100, 1), 100)}%`,
                  }}
                />
              </div>
            </>
          );
          if (!interactive) {
            return (
              <div key={field.column} className="px-2 py-1.5">
                {content}
              </div>
            );
          }
          return (
            <button
              key={field.column}
              type="button"
              onClick={() => setSelected(isSelected ? null : field.column)}
              title={`Ver detalhes de ${field.column}`}
              className={cn(
                "rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
                isSelected && "bg-primary/5 hover:bg-primary/5",
              )}
            >
              {content}
            </button>
          );
        })}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 inline-flex items-center gap-1 px-2 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3.5" aria-hidden /> ver menos
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" aria-hidden /> + ver mais (
              {hidden})
            </>
          )}
        </button>
      )}
    </div>
  );

  if (!interactive) return fieldList;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {fieldList}

      {/* Painel do campo selecionado */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        {selected === null ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center">
            <MousePointerClick
              className="size-5 text-muted-foreground"
              aria-hidden
            />
            <p className="max-w-60 text-xs text-muted-foreground">
              Clique em um campo para ver as faixas de valor e o impacto de
              cada uma no desfecho.
            </p>
          </div>
        ) : selectedEntry && selectedEntry.factors.length > 0 ? (
          <div>
            <p className="text-sm font-semibold text-foreground">
              {selectedEntry.column}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Taxa média geral de &lsquo;{positiveClass}&rsquo;:{" "}
              {formatPctValue(selectedEntry.overallRate * 100)}. Impacto em
              pontos percentuais vs. essa média.
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {selectedEntry.factors.map((factor) => (
                <FactorRow
                  key={factor.label}
                  factor={factor}
                  positiveClass={positiveClass ?? ""}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-32 flex-col items-center justify-center text-center">
            <p className="max-w-64 text-xs text-muted-foreground">
              O detalhamento de faixas está disponível apenas para os campos
              com maior contribuição
              {topFactors.length > 0 && (
                <>
                  {" "}
                  (
                  {topFactors
                    .map((entry) => entry.column)
                    .join(", ")}
                  )
                </>
              )}
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Fatores Principais: valores/faixas dos campos líderes com frequência e impacto ±% (US-021). */
export function TopFactorsSection({
  entries,
  positiveClass,
}: {
  entries: TopFactorEntry[];
  positiveClass: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {entries.map((entry) => (
        <div key={entry.column}>
          <p className="text-sm font-semibold text-foreground">
            {entry.column}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Taxa média geral de &lsquo;{positiveClass}&rsquo;:{" "}
            {formatPctValue(entry.overallRate * 100)}
          </p>
          <div className="mt-3 flex flex-col gap-4">
            {entry.factors.map((factor) => (
              <FactorRow
                key={factor.label}
                factor={factor}
                positiveClass={positiveClass}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const LEVEL_STYLES: Record<
  Segment["level"],
  { dot: string; stroke: string }
> = {
  high: { dot: "bg-rose-500", stroke: "stroke-rose-500" },
  medium: { dot: "bg-amber-500", stroke: "stroke-amber-500" },
  low: { dot: "bg-emerald-500", stroke: "stroke-emerald-500" },
  all: { dot: "bg-primary", stroke: "stroke-primary" },
};

/** Donut do tamanho do segmento (% do dataset). */
function Donut({ pct, strokeClass }: { pct: number; strokeClass: string }) {
  // r = 100 / 2π → circunferência 100, o dasharray vira % direto
  const radius = 15.9155;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3.5"
          className="stroke-muted"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(Math.max(pct, 0), 100)} 100`}
          className={strokeClass}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums text-foreground">
        {formatPctValue(pct, 0)}
      </span>
    </div>
  );
}

function attributeValues(attribute: SegmentAttribute): {
  segment: string;
  overall: string;
} {
  if (attribute.kind === "number") {
    return {
      segment: `média ${formatNumber(attribute.segmentMean ?? 0)}`,
      overall: formatNumber(attribute.overallMean ?? 0),
    };
  }
  return {
    segment: `'${attribute.value}' em ${formatPctValue(attribute.segmentPct ?? 0)}`,
    overall: formatPctValue(attribute.overallPct ?? 0),
  };
}

/** Segmentos: cards alto/médio/baixo com donut, taxa vs. média e atributos-chave (US-021). */
export function SegmentsSection({
  segments,
  positiveClass,
}: {
  segments: Segment[];
  positiveClass: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {segments.map((segment) => {
        const styles = LEVEL_STYLES[segment.level] ?? LEVEL_STYLES.all;
        return (
          <div
            key={segment.level}
            className="flex flex-col rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn("size-2.5 rounded-full", styles.dot)}
                aria-hidden
              />
              <p className="text-sm font-semibold text-foreground">
                {segment.label}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <Donut pct={segment.sizePct} strokeClass={styles.stroke} />
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  <span className="font-medium tabular-nums">
                    {segment.size.toLocaleString("pt-BR")}
                  </span>{" "}
                  linhas
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Taxa de &lsquo;{positiveClass}&rsquo;:{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatPctValue(segment.outcomeRate * 100)}
                  </span>
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <ImpactPill impact={segment.vsOverall} />
                  <span className="text-xs text-muted-foreground">
                    vs. média geral (
                    {formatPctValue(segment.overallRate * 100)})
                  </span>
                </div>
              </div>
            </div>
            {segment.attributes.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Atributos-chave
                </p>
                <ul className="mt-2 text-xs">
                  {segment.attributes.map((attribute) => {
                    const values = attributeValues(attribute);
                    return (
                      <li
                        key={attribute.column}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-baseline gap-2 border-b border-border/60 py-1.5 last:border-0"
                      >
                        <span
                          className="truncate font-medium text-foreground"
                          title={attribute.column}
                        >
                          {attribute.column}
                        </span>
                        <span
                          className="truncate text-muted-foreground"
                          title={attribute.text}
                        >
                          {values.segment}
                        </span>
                        <span className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                          geral {values.overall}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

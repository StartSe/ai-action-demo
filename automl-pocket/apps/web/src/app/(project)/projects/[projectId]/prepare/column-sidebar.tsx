"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ColumnStats, PrepareColumn } from "./prepare-view";

function numberPtBr(value: number, maxDigits = 2): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: maxDigits });
}

function formatBinEdge(edge: number | string): string {
  if (typeof edge === "number") return numberPtBr(edge);
  // Bordas de histograma de datas vêm como ISO; remove hora meia-noite
  return edge.replace(/T\d{2}:\d{2}:\d{2}(\.\d+)?(Z)?$/, "");
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

/** Distribuição completa: barras % para categóricas, histograma para numéricas/datas. */
function DistributionSection({ stats }: { stats: ColumnStats }) {
  const distribution = stats.distribution;
  if (!distribution) {
    return (
      <p className="text-xs text-muted-foreground">
        Sem distribuição calculada para esta coluna.
      </p>
    );
  }

  if (distribution.kind === "categories") {
    return (
      <div className="flex flex-col gap-1.5">
        {distribution.items.map((item) => (
          <div key={item.label} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-foreground" title={item.label}>
                {item.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {numberPtBr(item.pct, 1)}%
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${Math.min(Math.max(item.pct, 1), 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const maxCount = Math.max(...distribution.bins.map((bin) => bin.count), 1);
  const first = distribution.bins[0];
  const last = distribution.bins[distribution.bins.length - 1];
  return (
    <div>
      <div className="flex h-24 items-end gap-0.5">
        {distribution.bins.map((bin, index) => (
          <div
            key={index}
            className="flex-1 rounded-sm bg-primary/70"
            style={{
              height: `${Math.max((bin.count / maxCount) * 100, bin.count > 0 ? 4 : 1)}%`,
            }}
            title={`${formatBinEdge(bin.from)} a ${formatBinEdge(bin.to)}: ${numberPtBr(bin.count, 0)} (${numberPtBr(bin.pct, 1)}%)`}
          />
        ))}
      </div>
      {first && last && (
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>{formatBinEdge(first.from)}</span>
          <span>{formatBinEdge(last.to)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Sidebar direita com detalhes da coluna selecionada: KPIs, distribuição e
 * correlações em ordem decrescente de força (clicar troca a coluna exibida).
 */
export function ColumnSidebar({
  column,
  onClose,
  onSelectColumn,
}: {
  column: PrepareColumn;
  onClose: () => void;
  onSelectColumn: (name: string) => void;
}) {
  const stats = column.stats;
  const correlations = column.correlations ?? [];

  return (
    <aside
      className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card"
      aria-label={`Detalhes da coluna ${column.name}`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
        <h2
          className="truncate text-sm font-semibold text-foreground"
          title={column.name}
        >
          {column.name}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onClose}
          aria-label="Fechar detalhes da coluna"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="flex flex-col gap-5 px-4 py-4">
        {stats ? (
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Linhas" value={numberPtBr(stats.count, 0)} />
            <Kpi label="Vazias" value={numberPtBr(stats.empty, 0)} />
            <Kpi label="Únicos" value={numberPtBr(stats.unique, 0)} />
            {stats.numeric && (
              <>
                <Kpi label="Mín" value={numberPtBr(stats.numeric.min)} />
                <Kpi label="Máx" value={numberPtBr(stats.numeric.max)} />
                <Kpi label="Média" value={numberPtBr(stats.numeric.mean)} />
                <Kpi label="Mediana" value={numberPtBr(stats.numeric.median)} />
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Estatísticas indisponíveis para esta coluna.
          </p>
        )}

        {stats && (
          <div className="flex flex-col gap-2">
            <SectionTitle>Distribuição</SectionTitle>
            <DistributionSection stats={stats} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <SectionTitle>Correlações</SectionTitle>
          {correlations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sem correlações calculadas para esta coluna.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {correlations.map((correlation) => {
                const strength = Math.min(Math.abs(correlation.pct), 100);
                const sign = correlation.pct < 0 ? "-" : "+";
                return (
                  <button
                    key={correlation.column}
                    type="button"
                    onClick={() => onSelectColumn(correlation.column)}
                    className="rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                    title={`Ver detalhes de ${correlation.column}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="truncate text-xs text-foreground"
                        title={correlation.column}
                      >
                        {correlation.column}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5",
                          "text-[10px] font-semibold tabular-nums text-emerald-700",
                        )}
                      >
                        {sign}
                        {numberPtBr(strength, 1)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500/80"
                        style={{ width: `${Math.max(strength, 1)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

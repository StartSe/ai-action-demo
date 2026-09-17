"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { LayoutWarningBanner } from "@/components/app/layout-warning-banner";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LayoutWarning } from "@/db/schema";
import { numberPtBr } from "@/lib/format";
import { cn } from "@/lib/utils";

import { changeColumnType, undoLastTransform } from "./actions";
import { CleanDatasetDialog } from "./clean-dataset-dialog";
import { ColumnSidebar } from "./column-sidebar";
import { VersionChips, type VersionChip } from "./version-chips";

export type ColumnType = "number" | "category" | "text" | "date" | "id";

// Shape gravado pelo worker em dataset_columns.stats (US-010)
export type ColumnStats = {
  count: number;
  empty: number;
  unique: number;
  // Valores não vazios que falharam a conversão de tipo (US-049); datasets
  // antigos não têm o campo — tratar como 0
  invalidCount?: number;
  numeric?: { min: number; max: number; mean: number; median: number };
  distribution?:
    | {
        kind: "categories";
        items: { label: string; count: number; pct: number }[];
      }
    | {
        kind: "histogram";
        bins: {
          from: number | string;
          to: number | string;
          count: number;
          pct: number;
        }[];
      };
};

// Shape gravado pelo worker em dataset_columns.correlations (US-010)
type ColumnCorrelation = {
  column: string;
  method: "pearson" | "eta" | "cramers_v";
  value: number;
  pct: number;
};

export type PrepareColumn = {
  name: string;
  type: ColumnType;
  stats: ColumnStats | null;
  correlations: ColumnCorrelation[] | null;
};

export type SampleRow = Record<string, unknown>;

// Versão ativa das transformações (dataset_versions), vinda do server component
export type PrepareVersion = {
  id: string;
  kind: "original" | "clean" | "type_change";
  convertedNulls: number | null;
};

const TYPE_BADGE: Record<
  ColumnType,
  { label: string; className: string; dotClassName: string }
> = {
  category: {
    label: "Categoria",
    className: "bg-orange-100 text-orange-700",
    dotClassName: "bg-orange-500",
  },
  number: {
    label: "Número",
    className: "bg-emerald-100 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  text: {
    label: "Texto",
    className: "bg-blue-100 text-blue-700",
    dotClassName: "bg-blue-500",
  },
  date: {
    label: "Data",
    className: "bg-purple-100 text-purple-700",
    dotClassName: "bg-purple-500",
  },
  id: {
    label: "ID",
    className: "bg-gray-100 text-gray-600",
    dotClassName: "bg-gray-400",
  },
};

// Ordem dos tipos no dropdown do cabeçalho
const TYPE_ORDER: ColumnType[] = ["number", "text", "category", "date", "id"];

const COLUMN_WIDTH = 184;
const INDEX_WIDTH = 48;
const ROW_HEIGHT = 34;

// Paginação da grade (US-009): datasets maiores que a amostra de 500 linhas
// navegam o Parquet completo em páginas de 100 via /api/datasets/{id}/rows
const PAGE_SIZE = 100;
const SAMPLE_ROWS = 500;

// Polling do reprocessamento: cadência de 2,5s com timeout de ~2min sem
// nenhuma mudança observada no servidor (B10b)
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_TICKS = 48;

function formatCellValue(value: unknown, type: ColumnType): string {
  if (value == null || value === "") return "";
  if (type === "number" && typeof value === "number") {
    return value.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
  }
  // Datas do sample vêm como ISO; remove hora meia-noite para leitura
  if (type === "date" && typeof value === "string") {
    return value.replace(/T00:00:00(\.000)?(Z)?$/, "");
  }
  return String(value);
}

/**
 * Badge de tipo do cabeçalho como dropdown: escolher outro tipo dispara a
 * server action que enfileira o reprocessamento da coluna no worker.
 */
function TypeBadgeDropdown({
  column,
  disabled,
  isPending,
  onChangeType,
}: {
  column: PrepareColumn;
  disabled: boolean;
  isPending: boolean;
  onChangeType: (column: string, newType: ColumnType) => void;
}) {
  const badge = TYPE_BADGE[column.type];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          badgeVariants({ variant: "secondary" }),
          "pointer-events-auto relative z-[2] h-auto shrink-0 cursor-pointer gap-1 rounded px-1.5 py-0.5 text-[10px] leading-none",
          badge.className,
          isPending && "animate-pulse",
        )}
        aria-label={`Alterar tipo da coluna ${column.name} (atual: ${badge.label})`}
      >
        {isPending && (
          <Loader2 className="size-2.5! animate-spin" aria-hidden />
        )}
        {badge.label}
        <ChevronDown className="size-2.5!" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={column.type}
          onValueChange={(value) =>
            onChangeType(column.name, value as ColumnType)
          }
        >
          {TYPE_ORDER.map((type) => (
            <DropdownMenuRadioItem key={type} value={type}>
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  TYPE_BADGE[type].dotClassName,
                )}
                aria-hidden
              />
              {TYPE_BADGE[type].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Extremos exibidos na base do mini-histograma: números em pt-BR (compactos
 * quando grandes); datas (bins com from/to string) sem a hora meia-noite.
 */
function formatHistogramBound(value: number | string | undefined): string {
  if (value == null) return "";
  if (typeof value === "number") {
    const compact = Math.abs(value) >= 10_000;
    return value.toLocaleString("pt-BR", {
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 2,
    });
  }
  return String(value).replace(/T00:00:00(\.000)?(Z)?$/, "");
}

/**
 * Mini-distribuição do cabeçalho: categóricas em duas linhas por item (rótulo
 * + % em cima, barra em largura total embaixo); mini-histograma com mín/máx na
 * base para numéricas/datas; colunas id/text mostram únicos.
 */
function MiniDistribution({ column }: { column: PrepareColumn }) {
  const distribution = column.stats?.distribution;

  if (distribution?.kind === "categories") {
    const items = distribution.items.slice(0, 3);
    return (
      <div className="flex flex-1 flex-col justify-center gap-1">
        {items.map((item) => (
          <div
            key={item.label}
            title={`${item.label}: ${numberPtBr(item.count)} (${item.pct.toLocaleString("pt-BR")}%)`}
          >
            <div className="flex items-baseline justify-between gap-2 text-xs leading-tight">
              <span
                className="truncate text-muted-foreground"
                title={item.label}
              >
                {item.label}
              </span>
              <span className="shrink-0 tabular-nums text-foreground">
                {item.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                %
              </span>
            </div>
            <span className="mt-0.5 block h-2 w-full overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${Math.max(item.pct, 2)}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (distribution?.kind === "histogram") {
    const maxCount = Math.max(...distribution.bins.map((bin) => bin.count), 1);
    const min = column.stats?.numeric?.min ?? distribution.bins[0]?.from;
    const max =
      column.stats?.numeric?.max ??
      distribution.bins[distribution.bins.length - 1]?.to;
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-1">
        <div className="flex min-h-0 flex-1 items-end gap-px">
          {distribution.bins.map((bin, index) => (
            <span
              key={index}
              className="flex-1 rounded-sm bg-primary/70"
              style={{
                height: `${Math.max((bin.count / maxCount) * 100, bin.count > 0 ? 6 : 2)}%`,
              }}
              title={`${bin.from} a ${bin.to}: ${numberPtBr(bin.count)} (${bin.pct.toLocaleString("pt-BR")}%)`}
            />
          ))}
        </div>
        <div className="flex items-baseline justify-between gap-2 text-xs leading-none tabular-nums text-muted-foreground">
          <span className="truncate">{formatHistogramBound(min)}</span>
          <span className="truncate">{formatHistogramBound(max)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-end pb-1 text-xs leading-none text-muted-foreground">
      {column.stats
        ? `${numberPtBr(column.stats.unique)} valores únicos`
        : "Sem distribuição"}
    </div>
  );
}

export function PrepareView({
  datasetId,
  fileName,
  rowCount,
  columnCount,
  columns,
  rows,
  status,
  currentVersion,
  versions,
  lastTransformError,
  updatedAt,
  layoutWarnings,
  layoutReviewHref,
}: {
  datasetId: string;
  fileName: string;
  rowCount: number | null;
  columnCount: number | null;
  columns: PrepareColumn[];
  rows: SampleRow[];
  status: "ready" | "profiling";
  currentVersion: PrepareVersion | null;
  versions: VersionChip[];
  lastTransformError: string | null;
  updatedAt: string;
  /** Avisos de estrutura ruim do profiling (US-028) — banner acima da grade. */
  layoutWarnings: LayoutWarning[];
  layoutReviewHref: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedColumnName, setSelectedColumnName] = useState<string | null>(
    null,
  );
  const selectedColumn =
    columns.find((column) => column.name === selectedColumnName) ?? null;

  // Transformação disparada nesta sessão: guarda a coluna (null = limpeza), a
  // versão ativa e o updated_at do dataset no momento do clique — a conclusão
  // é detectada quando o servidor volta a "ready" com updated_at diferente
  // (cobre também o job que termina SEM criar versão: erro ou "sem mudanças")
  const [pendingTransform, setPendingTransform] = useState<{
    column: string | null;
    versionId: string | null;
    updatedAt: string;
  } | null>(null);
  const [isEnqueuing, startTransition] = useTransition();
  // B10b: polling expirou sem observar mudança no servidor
  const [pollTimedOut, setPollTimedOut] = useState(false);
  // Banner de erro de transformação (B10a): dismissível por mensagem
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const processing = status !== "ready";
  const typeChangeDisabled =
    (processing && !pollTimedOut) || isEnqueuing || pendingTransform != null;
  const transformError =
    lastTransformError && lastTransformError !== dismissedError
      ? lastTransformError
      : null;

  // Polling: enquanto o worker reprocessa, atualiza o server component até o
  // status voltar a "ready". `status`/`updatedAt` nas deps zeram o contador a
  // cada mudança observada — o timeout só dispara após ~2min parado (B10b).
  useEffect(() => {
    if (pollTimedOut || (!processing && !pendingTransform)) return;
    let ticks = 0;
    const interval = setInterval(() => {
      ticks += 1;
      if (ticks >= POLL_TIMEOUT_TICKS) {
        setPollTimedOut(true);
        setPendingTransform(null);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [processing, pendingTransform, pollTimedOut, status, updatedAt, router]);

  // Conclusão da transformação: o servidor voltou a "ready" com updated_at
  // diferente do capturado no clique. Versão nova ⇒ sucesso (no type_change,
  // avisa sobre convertedNulls); mesma versão sem erro ⇒ "sem mudanças" (B6);
  // erro ⇒ o banner de last_transform_error comunica (sem toast).
  useEffect(() => {
    if (!pendingTransform || processing) return;
    if (updatedAt === pendingTransform.updatedAt) return;
    const versionChanged =
      (currentVersion?.id ?? null) !== pendingTransform.versionId;
    if (versionChanged && currentVersion) {
      if (currentVersion.kind === "type_change") {
        const convertedNulls = currentVersion.convertedNulls ?? 0;
        if (convertedNulls > 0) {
          toast.warning(
            convertedNulls === 1
              ? "1 valor não pôde ser convertido e virou nulo."
              : `${numberPtBr(convertedNulls)} valores não puderam ser convertidos e viraram nulos.`,
          );
        } else {
          toast.success("Tipo da coluna atualizado.");
        }
      } else if (currentVersion.kind === "clean") {
        toast.success("Limpeza de dados aplicada.");
      }
    } else if (!lastTransformError) {
      toast.info(
        "Nenhuma alteração foi necessária — seus dados já estavam limpos.",
      );
    }
    setPendingTransform(null);
  }, [
    pendingTransform,
    processing,
    currentVersion,
    updatedAt,
    lastTransformError,
  ]);

  function handleUndo() {
    if (typeChangeDisabled) return;
    startTransition(async () => {
      const result = await undoLastTransform(datasetId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.reprofiling
          ? "Transformação desfeita. Reprocessando o dataset original..."
          : "Transformação desfeita.",
      );
      router.refresh();
    });
  }

  function handleChangeType(column: string, newType: ColumnType) {
    if (typeChangeDisabled) return;
    const current = columns.find((item) => item.name === column);
    if (!current || current.type === newType) return;
    startTransition(async () => {
      const result = await changeColumnType(datasetId, column, newType);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setPendingTransform({
        column,
        versionId: currentVersion?.id ?? null,
        updatedAt,
      });
      setDismissedError(null);
      setPollTimedOut(false);
      router.refresh();
    });
  }

  // Paginação (US-009): datasets maiores que a amostra navegam o Parquet
  // completo em páginas de 100. Páginas cobertas pela amostra em memória
  // renderizam na hora; as demais buscam do endpoint /rows (com cache por
  // página, invalidado quando uma transformação muda o dataset).
  const paginated = rowCount != null && rowCount > SAMPLE_ROWS;
  const pageCount = paginated ? Math.ceil(rowCount / PAGE_SIZE) : 1;
  const [pageIndex, setPageIndex] = useState(0);
  const [pageRows, setPageRows] = useState<SampleRow[] | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageRetry, setPageRetry] = useState(0);
  const pageCacheRef = useRef(new Map<number, SampleRow[]>());

  const pageStart = pageIndex * PAGE_SIZE;
  const pageEnd = paginated
    ? Math.min(pageStart + PAGE_SIZE, rowCount)
    : rows.length;
  // Página inteiramente contida na amostra já em memória (primeiras páginas)
  const pageInSample = paginated && pageEnd <= rows.length;

  // Transformação concluída muda updatedAt: o Parquet ativo pode ter outro
  // conteúdo — descarta o cache de páginas e volta para a primeira
  useEffect(() => {
    pageCacheRef.current.clear();
    setPageIndex(0);
    setPageRows(null);
    setPageError(null);
  }, [updatedAt]);

  useEffect(() => {
    if (!paginated || pageInSample) return;
    const cached = pageCacheRef.current.get(pageIndex);
    if (cached) {
      setPageRows(cached);
      return;
    }
    const controller = new AbortController();
    setPageRows(null);
    setPageLoading(true);
    setPageError(null);
    fetch(
      `/api/datasets/${datasetId}/rows?page=${pageIndex + 1}&pageSize=${PAGE_SIZE}`,
      {
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            body?.error ?? "Não foi possível carregar as linhas.",
          );
        }
        return response.json() as Promise<{ rows: SampleRow[] }>;
      })
      .then((data) => {
        pageCacheRef.current.set(pageIndex, data.rows);
        setPageRows(data.rows);
        setPageLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPageError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as linhas.",
        );
        setPageLoading(false);
      });
    return () => controller.abort();
  }, [paginated, pageInSample, pageIndex, datasetId, pageRetry]);

  function goToPage(nextIndex: number) {
    setPageIndex(Math.min(Math.max(nextIndex, 0), pageCount - 1));
    containerRef.current?.scrollTo({ top: 0 });
  }

  const displayRows = useMemo<SampleRow[]>(() => {
    if (!paginated) return rows;
    if (pageInSample) return rows.slice(pageStart, pageEnd);
    return pageRows ?? [];
  }, [paginated, pageInSample, rows, pageStart, pageEnd, pageRows]);

  const columnDefs = useMemo<ColumnDef<SampleRow>[]>(
    () =>
      columns.map((column) => ({
        id: column.name,
        accessorFn: (row) => row[column.name],
        size: COLUMN_WIDTH,
        meta: column,
      })),
    [columns],
  );

  // Ordenação client-side da amostra (500 linhas) via setas do cabeçalho.
  // Decisão US-009: com paginação a ordenação fica DESABILITADA (tooltip no
  // cabeçalho) — ordenar no servidor exigiria ler e ordenar o Parquet inteiro
  // a cada troca de página (hyparquet não tem ordenação nativa), o que
  // estoura o orçamento de < 2s em datasets grandes.
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: displayRows,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    // Numéricas ordenariam desc primeiro por padrão; asc primeiro em tudo
    sortDescFirst: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const tableRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const totalWidth = INDEX_WIDTH + columns.length * COLUMN_WIDTH;

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Subheader: dataset + ações */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {fileName}
            </p>
            <p className="text-xs text-muted-foreground">
              {rowCount != null && columnCount != null
                ? `${numberPtBr(rowCount)} linhas, ${numberPtBr(columnCount)} colunas`
                : "Dimensões indisponíveis"}
            </p>
          </div>
          <VersionChips
            versions={versions}
            disabled={typeChangeDisabled}
            onUndo={handleUndo}
          />
          {processing && !pollTimedOut && (
            <span
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              role="status"
            >
              <Loader2
                className="size-3.5 animate-spin text-primary"
                aria-hidden
              />
              Aplicando transformação...
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <CleanDatasetDialog
              datasetId={datasetId}
              rowCount={rowCount}
              columns={columns}
              rows={rows}
              disabled={typeChangeDisabled}
              onEnqueued={() => {
                setPendingTransform({
                  column: null,
                  versionId: currentVersion?.id ?? null,
                  updatedAt,
                });
                setDismissedError(null);
                setPollTimedOut(false);
                router.refresh();
              }}
            />
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/datasets/${datasetId}/download`}>
                <Download className="size-3.5" aria-hidden />
                Baixar
              </a>
            </Button>
          </div>
        </div>

        {/* US-028: estrutura suspeita depois do profiling — a grade continua
            utilizável; "Revisar planilha" reprocessa com outras escolhas */}
        <LayoutWarningBanner
          warnings={layoutWarnings}
          reviewHref={layoutReviewHref}
          className="shrink-0"
        />

        {/* B10a: falha recuperável de transformação — grade permanece intacta */}
        {transformError && (
          <div className="flex shrink-0 items-start gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="flex-1">{transformError}</p>
            <button
              type="button"
              onClick={() => setDismissedError(transformError)}
              className="rounded p-0.5 transition-colors hover:bg-destructive/10"
              aria-label="Dispensar aviso"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* B10b: polling expirou sem resposta do servidor */}
        {pollTimedOut && (
          <div className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            <p className="flex-1">
              A transformação está demorando mais do que o esperado. Verifique
              sua conexão e tente novamente.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPollTimedOut(false);
                router.refresh();
              }}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Grade virtualizada (amostra até 500 linhas; paginada em 100 acima
            disso — US-009) + sidebar de detalhes */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div ref={containerRef} className="flex-1 overflow-auto bg-card">
            <div style={{ width: totalWidth, minWidth: "100%" }}>
              <div
                className="sticky top-0 z-10 flex border-b border-border bg-card"
                style={{ width: totalWidth }}
              >
                <div
                  className="flex h-[128px] shrink-0 items-start justify-center border-r border-border bg-muted/30 pt-2 text-[10px] font-medium text-muted-foreground"
                  style={{ width: INDEX_WIDTH }}
                >
                  #
                </div>
                {table.getFlatHeaders().map((header) => {
                  const column = header.column.columnDef.meta as PrepareColumn;
                  const sorted = header.column.getIsSorted();
                  return (
                    // Padrão stretched button: overlay clicável abre a sidebar e
                    // o badge de tipo e a seta de ordenação (z-[2]) mantêm o
                    // próprio clique — evita <button> dentro de <button>
                    <div
                      key={header.id}
                      className={cn(
                        "relative flex h-[128px] shrink-0 flex-col gap-1 border-r border-border px-2.5 py-2 text-left transition-colors hover:bg-muted/40",
                        selectedColumn?.name === column.name && "bg-primary/5",
                      )}
                      style={{ width: header.getSize() }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedColumnName((current) =>
                            current === column.name ? null : column.name,
                          )
                        }
                        className="absolute inset-0 z-[1] cursor-pointer"
                        title={`Ver detalhes de ${column.name}`}
                        aria-label={`Ver detalhes de ${column.name}`}
                      />
                      <div className="pointer-events-none flex w-full items-center justify-between gap-1.5">
                        <span
                          className="truncate text-sm font-semibold text-foreground"
                          title={column.name}
                        >
                          {column.name}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {paginated ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  tabIndex={0}
                                  className="pointer-events-auto relative z-[2] rounded p-0.5 text-muted-foreground/50"
                                  aria-label={`Ordenação indisponível para ${column.name}`}
                                >
                                  <ChevronsUpDown
                                    className="pointer-events-none size-3.5"
                                    aria-hidden
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="max-w-56"
                              >
                                Ordenação indisponível em datasets paginados —
                                as linhas são carregadas por página.
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className={cn(
                                "pointer-events-auto relative z-[2] cursor-pointer rounded p-0.5 transition-colors hover:bg-muted hover:text-foreground",
                                sorted
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                              )}
                              title={`Ordenar por ${column.name}`}
                              aria-label={`Ordenar por ${column.name}`}
                            >
                              {sorted === "asc" ? (
                                <ArrowUp className="size-3.5" aria-hidden />
                              ) : sorted === "desc" ? (
                                <ArrowDown className="size-3.5" aria-hidden />
                              ) : (
                                <ChevronsUpDown
                                  className="size-3.5"
                                  aria-hidden
                                />
                              )}
                            </button>
                          )}
                          <TypeBadgeDropdown
                            column={column}
                            disabled={typeChangeDisabled}
                            isPending={pendingTransform?.column === column.name}
                            onChangeType={handleChangeType}
                          />
                        </div>
                      </div>
                      <div className="pointer-events-none flex min-h-0 flex-1 flex-col">
                        <MiniDistribution column={column} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="relative"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  return (
                    <div
                      key={row.id}
                      className="absolute left-0 top-0 flex border-b border-border/60"
                      style={{
                        width: totalWidth,
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        className="flex shrink-0 items-center justify-center border-r border-border bg-muted/30 text-[10px] tabular-nums text-muted-foreground"
                        style={{ width: INDEX_WIDTH }}
                      >
                        {(paginated ? pageStart : 0) + virtualRow.index + 1}
                      </div>
                      {row.getVisibleCells().map((cell) => {
                        const column = cell.column.columnDef
                          .meta as PrepareColumn;
                        const value = formatCellValue(
                          cell.getValue(),
                          column.type,
                        );
                        return (
                          <div
                            key={cell.id}
                            className={cn(
                              "flex shrink-0 items-center truncate border-r border-border/60 px-2.5 text-xs",
                              value === "" && "text-muted-foreground/50",
                              column.type === "number" &&
                                "justify-end tabular-nums",
                            )}
                            style={{ width: cell.column.getSize() }}
                            title={value}
                          >
                            <span className="truncate">
                              {value === "" ? "—" : value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Página fora da amostra sendo buscada do endpoint (US-009) */}
              {paginated && pageLoading && (
                <div
                  className="sticky left-0 flex h-40 w-full items-center justify-center gap-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <Loader2
                    className="size-4 animate-spin text-primary"
                    aria-hidden
                  />
                  Carregando linhas...
                </div>
              )}
              {paginated && pageError && !pageLoading && (
                <div className="sticky left-0 flex h-40 w-full flex-col items-center justify-center gap-2 text-sm text-destructive">
                  <p className="flex items-center gap-2">
                    <AlertCircle className="size-4 shrink-0" aria-hidden />
                    {pageError}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPageRetry((tick) => tick + 1)}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}
            </div>
          </div>

          {selectedColumn && (
            <ColumnSidebar
              column={selectedColumn}
              onClose={() => setSelectedColumnName(null)}
              onSelectColumn={setSelectedColumnName}
            />
          )}
        </div>

        {/* Rodapé de paginação (US-009) — oculto em datasets <= 500 linhas */}
        {paginated && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-4 py-2">
            <p
              className="text-xs tabular-nums text-muted-foreground"
              role="status"
            >
              {displayRows.length > 0 && !pageLoading
                ? `Linhas ${numberPtBr(pageStart + 1)}–${numberPtBr(pageEnd)} de ${numberPtBr(rowCount)}`
                : `${numberPtBr(rowCount)} linhas`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageIndex === 0 || pageLoading}
                onClick={() => goToPage(pageIndex - 1)}
              >
                <ChevronLeft className="size-3.5" aria-hidden />
                Anterior
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                Página {numberPtBr(pageIndex + 1)} de {numberPtBr(pageCount)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageIndex >= pageCount - 1 || pageLoading}
                onClick={() => goToPage(pageIndex + 1)}
              >
                Próxima
                <ChevronRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Search,
  TableProperties,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import type { LayoutWarning } from "@/db/schema";
import {
  describeLayoutWarnings,
  layoutReviewHref,
} from "@/lib/dataset-layout-form";
import {
  DATASET_STATUS_LABEL,
  type DatasetStatus,
  isDatasetProcessing,
} from "@/lib/dataset-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteConfirmDialog } from "@/components/app/delete-confirm-dialog";
import {
  ExpectedFormatNotice,
  TemplateDownloadLinks,
} from "@/components/app/template-download-links";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeDate, numberPtBr } from "@/lib/format";

import { CreateProjectDialog } from "../projects/create-project-dialog";
import { deleteDataset } from "./actions";

export type DatasetRowData = {
  id: string;
  fileName: string;
  format: "csv" | "xlsx" | "json";
  rowCount: number | null;
  columnCount: number | null;
  status: DatasetStatus;
  errorMessage: string | null;
  updatedAt: string;
  /** Nomes dos projetos que usam este dataset (aviso antes de excluir). */
  linkedProjects: string[];
  /** Avisos de estrutura ruim do profiling (US-028); vazio = formato ok. */
  layoutWarnings: LayoutWarning[];
};

// null = status que não é "em processamento" (badge próprio abaixo)
const PROCESSING_LABEL = {
  uploading: DATASET_STATUS_LABEL.uploading,
  parsing: DATASET_STATUS_LABEL.parsing,
  needs_review: null,
  profiling: DATASET_STATUS_LABEL.profiling,
  ready: null,
  error: null,
} satisfies Record<DatasetStatus, string | null>;

type SortKey = "name" | "updatedAt";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

export function DatasetsView({ datasets }: { datasets: DatasetRowData[] }) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<DatasetRowData | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(null);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = datasets.filter(
      (dataset) =>
        !normalized || dataset.fileName.toLowerCase().includes(normalized),
    );
    if (!sort) return filtered;
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") {
        return direction * a.fileName.localeCompare(b.fileName, "pt-BR");
      }
      return direction * (Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
    });
  }, [datasets, query, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  // Enquanto algum dataset ainda está sendo processado pelo worker, a lista
  // se atualiza sozinha por polling (router.refresh re-busca o server component)
  const hasProcessing = datasets.some((d) => isDatasetProcessing(d.status));
  useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(interval);
  }, [hasProcessing, router]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Datasets{" "}
          <span className="text-base font-normal text-muted-foreground">
            ({datasets.length})
          </span>
        </h1>
        {datasets.length > 0 && (
          <div className="relative ml-auto">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar datasets"
              maxLength={100}
              className="w-56 bg-card pl-9"
              aria-label="Buscar datasets por nome"
            />
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Todos os arquivos enviados pela sua organização, em um só lugar.
      </p>

      {datasets.length === 0 ? (
        <EmptyState />
      ) : visible.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-medium text-foreground">
            Nenhum dataset encontrado
          </p>
          <p className="text-sm text-muted-foreground">
            Tente buscar por outro nome.
          </p>
        </div>
      ) : (
        <TooltipProvider>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <SortableHeader
                    label="Nome"
                    sortKey="name"
                    sort={sort}
                    onToggle={toggleSort}
                  />
                  <th className="px-4 py-3 font-semibold">Formato</th>
                  <th className="px-4 py-3 font-semibold">Dimensões</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <SortableHeader
                    label="Atualizado"
                    sortKey="updatedAt"
                    sort={sort}
                    onToggle={toggleSort}
                  />
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((dataset) => (
                  <DatasetRow
                    key={dataset.id}
                    dataset={dataset}
                    onDelete={() => setDeleteTarget(dataset)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      )}

      <DeleteDialog
        dataset={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onToggle: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  const Icon = !active
    ? ChevronsUpDown
    : sort.dir === "asc"
      ? ArrowUp
      : ArrowDown;
  return (
    <th
      className="px-4 py-3 font-semibold"
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
      }
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
      >
        {label}
        <Icon
          className={active ? "size-3.5" : "size-3.5 opacity-50"}
          aria-hidden
        />
      </button>
    </th>
  );
}

function StatusBadge({ dataset }: { dataset: DatasetRowData }) {
  const processing = PROCESSING_LABEL[dataset.status];
  if (processing) {
    return (
      <Badge className="border-transparent bg-muted text-muted-foreground">
        <Loader2 className="animate-spin" aria-hidden />
        {processing}
      </Badge>
    );
  }
  if (dataset.status === "needs_review") {
    // O worker parou antes do parse: abas/cabeçalho/orientação precisam ser
    // confirmados na tela "Revisar planilha" (US-027). O botão não depende da
    // flag LAYOUT_REVIEW_ENABLED: um dataset já pausado precisa de saída.
    return (
      <span className="flex flex-col items-start gap-1.5">
        <Badge className="border-transparent bg-amber-100 text-amber-800">
          {DATASET_STATUS_LABEL.needs_review}
        </Badge>
        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
          <Link href={layoutReviewHref(dataset.id)}>
            <TableProperties data-icon="inline-start" aria-hidden />
            Revisar planilha
          </Link>
        </Button>
      </span>
    );
  }
  if (dataset.status === "error") {
    return (
      <span className="flex flex-col items-start gap-1">
        <Tooltip>
          {/* Trigger é um botão focável: a mensagem de erro abre por hover e teclado */}
          <TooltipTrigger
            className="inline-flex cursor-help"
            aria-label="Ver detalhes do erro"
          >
            <Badge variant="destructive">
              <AlertCircle aria-hidden />
              Erro
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {dataset.errorMessage ?? "Erro ao processar o arquivo"}
          </TooltipContent>
        </Tooltip>
        {/* Junto da mensagem de erro, o caminho de volta: um exemplo que funciona */}
        <TemplateDownloadLinks
          source="error"
          className="whitespace-nowrap text-xs text-muted-foreground"
        />
      </span>
    );
  }
  if (dataset.layoutWarnings.length > 0) {
    // Pronto, mas o profiling achou estrutura suspeita (US-028): o mesmo
    // atalho do banner do Prepare — a rota aceita ready com avisos
    return (
      <span className="flex flex-col items-start gap-1.5">
        <Tooltip>
          <TooltipTrigger
            className="inline-flex cursor-help"
            aria-label="Ver detalhes do aviso"
          >
            <Badge className="border-transparent bg-amber-100 text-amber-800">
              <AlertTriangle aria-hidden />
              Formato suspeito
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            Parece que a planilha não está no formato esperado: encontramos{" "}
            {describeLayoutWarnings(dataset.layoutWarnings)}.
          </TooltipContent>
        </Tooltip>
        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
          <Link href={layoutReviewHref(dataset.id)}>
            <TableProperties data-icon="inline-start" aria-hidden />
            Revisar planilha
          </Link>
        </Button>
      </span>
    );
  }
  return (
    <Badge className="border-transparent bg-emerald-100 text-emerald-700">
      {DATASET_STATUS_LABEL.ready}
    </Badge>
  );
}

function DatasetRow({
  dataset,
  onDelete,
}: {
  dataset: DatasetRowData;
  onDelete: () => void;
}) {
  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="max-w-[280px] px-4 py-3">
        <span className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileSpreadsheet className="size-4" aria-hidden />
          </span>
          <span
            className="truncate font-medium text-foreground"
            title={dataset.fileName}
          >
            {dataset.fileName}
          </span>
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {dataset.format.toUpperCase()}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {dataset.rowCount != null && dataset.columnCount != null
          ? `${numberPtBr(dataset.rowCount)} × ${numberPtBr(dataset.columnCount)}`
          : "—"}
      </td>
      <td className="px-4 py-3">
        <StatusBadge dataset={dataset} />
      </td>
      <td className="px-4 py-3 text-muted-foreground" suppressHydrationWarning>
        {formatRelativeDate(dataset.updatedAt)}
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center justify-end gap-1">
          {dataset.status === "ready" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon-sm">
                  <a
                    href={`/api/datasets/${dataset.id}/download`}
                    download
                    aria-label={`Baixar ${dataset.fileName} em CSV`}
                  >
                    <Download aria-hidden />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Baixar CSV</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                aria-label={`Excluir ${dataset.fileName}`}
              >
                <Trash2 aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Excluir dataset</TooltipContent>
          </Tooltip>
        </span>
      </td>
    </tr>
  );
}

function EmptyState() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="mt-16 flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Database className="size-6" aria-hidden />
      </span>
      <div>
        <p className="text-base font-semibold text-foreground">
          Nenhum dataset ainda
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Os arquivos enviados nos seus projetos aparecem aqui. Crie um projeto
          e envie uma planilha para começar.
        </p>
      </div>
      <ExpectedFormatNotice className="max-w-md text-left" />
      <Button onClick={() => setCreateOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Criar projeto
      </Button>
      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function DeleteDialog({
  dataset,
  onClose,
}: {
  dataset: DatasetRowData | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!dataset) return;
    startTransition(async () => {
      const result = await deleteDataset(dataset.id);
      if (result?.error) {
        setError(result.error);
      } else {
        onClose();
        toast.success(`Dataset "${dataset.fileName}" excluído.`);
      }
    });
  }

  return (
    <DeleteConfirmDialog
      open={dataset !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
      title="Excluir dataset?"
      pending={pending}
      error={error}
      onConfirm={handleDelete}
      description={
        <>
          <p>
            O arquivo <strong>{dataset?.fileName}</strong> e o histórico de
            treinamentos associado serão excluídos permanentemente. Essa ação
            não pode ser desfeita.
          </p>
          {dataset && dataset.linkedProjects.length > 0 ? (
            <p
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              Atenção: este dataset está em uso{" "}
              {dataset.linkedProjects.length === 1
                ? "pelo projeto"
                : "pelos projetos"}{" "}
              <strong>{dataset.linkedProjects.join(", ")}</strong>.{" "}
              {dataset.linkedProjects.length === 1
                ? "Esse projeto perderá a fonte de dados"
                : "Esses projetos perderão a fonte de dados"}{" "}
              (modelos já treinados são mantidos).
            </p>
          ) : null}
        </>
      }
    />
  );
}

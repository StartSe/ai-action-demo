"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { DeleteConfirmDialog } from "@/components/app/delete-confirm-dialog";
import {
  ExpectedFormatNotice,
  TemplateDownloadLinks,
} from "@/components/app/template-download-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type DatasetStatus,
  isDatasetProcessing,
  isDatasetSelectable,
} from "@/lib/dataset-status";
import { formatRelativeDate, numberPtBr } from "@/lib/format";

import { deleteDataset } from "@/app/(app)/datasets/actions";
import { selectDataset } from "./actions";

export type DatasetListItem = {
  id: string;
  fileName: string;
  rowCount: number | null;
  columnCount: number | null;
  status: DatasetStatus;
  errorMessage: string | null;
  updatedAt: string;
};

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".json"];

// null = não está em processamento (needs_review nem chega aqui: a página
// filtra na query e o picker ignora por segurança — ver `listed`)
const PROCESSING_LABEL = {
  uploading: "Enviando...",
  parsing: "Processando arquivo...",
  needs_review: null,
  profiling: "Analisando colunas...",
  ready: null,
  error: null,
} satisfies Record<DatasetStatus, string | null>;

// Progresso aproximado de cada etapa do pipeline (upload → parse → profile)
const PROCESSING_PROGRESS = {
  uploading: 15,
  parsing: 50,
  needs_review: null,
  profiling: 85,
  ready: null,
  error: null,
} satisfies Record<DatasetStatus, number | null>;

export function DatasetPicker({
  projectId,
  datasets,
  maxUploadMb,
}: {
  projectId: string;
  datasets: DatasetListItem[];
  maxUploadMb: number;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DatasetListItem | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  // Último arquivo que passou na validação local mas falhou no envio —
  // "Tentar novamente" reenvia direto, sem reabrir o seletor de arquivos
  const retryFileRef = useRef<File | null>(null);

  // Enquanto algum dataset ainda está sendo processado pelo worker, a lista
  // se atualiza sozinha por polling (router.refresh re-busca o server component)
  const hasProcessing = datasets.some((d) => isDatasetProcessing(d.status));
  useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(interval);
  }, [hasProcessing, router]);

  // Seletor de vínculo: datasets selecionáveis + os com erro (mostrados só
  // para reenviar/excluir). needs_review fica de fora até o usuário revisar.
  const listed = useMemo(
    () =>
      datasets.filter(
        (d) => isDatasetSelectable(d.status) || d.status === "error",
      ),
    [datasets],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return listed;
    return listed.filter((d) => d.fileName.toLowerCase().includes(term));
  }, [listed, search]);

  async function uploadFile(file: File) {
    setError(null);
    retryFileRef.current = null;

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError(
        "Formato não suportado. Envie um arquivo .csv, .xlsx, .xls ou .json.",
      );
      return;
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      setError(`Arquivo muito grande. O limite é ${maxUploadMb} MB.`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/datasets/upload", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        datasetId?: string;
      } | null;
      if (!response.ok) {
        retryFileRef.current = file;
        setError(body?.error ?? "Falha ao enviar o arquivo. Tente novamente.");
        return;
      }
      router.refresh();
      // Upload dentro de um projeto seleciona o dataset recém-enviado direto:
      // selectDataset grava projects.datasetId e redireciona para /prepare
      // (o parse pode não ter terminado — prepare-pending.tsx cobre a espera)
      if (projectId && body?.datasetId) {
        selectById(body.datasetId);
      }
    } catch {
      retryFileRef.current = file;
      setError(
        "Falha ao enviar o arquivo. Verifique sua conexão e tente novamente.",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRetryUpload() {
    const file = retryFileRef.current;
    if (file) {
      void uploadFile(file);
    } else {
      // Erro de validação local (formato/tamanho): precisa escolher outro arquivo
      setError(null);
      fileInputRef.current?.click();
    }
  }

  function handleDelete() {
    const dataset = deleteTarget;
    if (!dataset || deletingId) return;
    setDeleteError(null);
    setDeletingId(dataset.id);
    startTransition(async () => {
      const result = await deleteDataset(dataset.id);
      setDeletingId(null);
      if (result?.error) {
        setDeleteError(result.error);
      } else {
        setDeleteTarget(null);
        toast.success(`Dataset "${dataset.fileName}" excluído.`);
        router.refresh();
      }
    });
  }

  function selectById(datasetId: string) {
    setSelectingId(datasetId);
    startTransition(async () => {
      const result = await selectDataset(projectId, datasetId);
      // redirect() interrompe a action em caso de sucesso; aqui só chega erro
      if (result?.error) {
        setError(result.error);
        setSelectingId(null);
      }
    });
  }

  function handleSelect(dataset: DatasetListItem) {
    if (isPending) return;
    setError(null);
    selectById(dataset.id);
  }

  return (
    <div
      className="mt-8"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void uploadFile(file);
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Buscar dataset..."
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
            aria-label="Buscar dataset por nome"
          />
        </div>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
          {uploading ? "Enviando..." : "+ Enviar dataset"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />
      </div>

      <ExpectedFormatNotice className="mt-3" />

      {error ? (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
        >
          <div className="text-sm">
            <p className="text-destructive">{error}</p>
            <TemplateDownloadLinks
              source="error"
              className="mt-0.5 block text-xs text-muted-foreground"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRetryUpload}
            disabled={uploading}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <div
        className={`mt-4 rounded-xl border ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        {filtered.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl px-6 py-14 text-center"
          >
            <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Upload className="size-5" aria-hidden />
            </span>
            <span className="text-sm font-medium text-foreground">
              {listed.length === 0
                ? "Arraste um arquivo aqui ou clique para enviar"
                : "Nenhum dataset corresponde à busca"}
            </span>
            <span className="text-xs text-muted-foreground">
              CSV, Excel (.xlsx, .xls) ou JSON — até {maxUploadMb} MB
            </span>
          </button>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((dataset) => {
              const processing = PROCESSING_LABEL[dataset.status];

              if (dataset.status === "error") {
                // Dataset com falha não é selecionável: mostra o erro e
                // oferece reenviar outro arquivo ou excluir o registro
                return (
                  <li
                    key={dataset.id}
                    className="flex w-full flex-wrap items-center gap-4 px-4 py-3.5"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                      <FileSpreadsheet className="size-4.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className="truncate text-sm font-medium text-foreground"
                          title={dataset.fileName}
                        >
                          {dataset.fileName}
                        </span>
                        <Badge
                          variant="outline"
                          className="border-destructive/40 text-destructive"
                        >
                          Erro
                        </Badge>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs">
                        <AlertCircle
                          className="size-3 shrink-0 text-destructive"
                          aria-hidden
                        />
                        <span className="text-destructive">
                          {dataset.errorMessage ??
                            "Erro ao processar o arquivo"}
                        </span>
                      </span>
                      <TemplateDownloadLinks
                        source="error"
                        className="mt-1 block text-xs text-muted-foreground"
                      />
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        <Upload className="size-3.5" aria-hidden />
                        Reenviar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget(dataset)}
                        disabled={deletingId !== null}
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        {deletingId === dataset.id ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Trash2 className="size-3.5" aria-hidden />
                        )}
                        Excluir
                      </Button>
                    </span>
                  </li>
                );
              }

              return (
                <li key={dataset.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(dataset)}
                    disabled={isPending}
                    aria-busy={isPending && selectingId === dataset.id}
                    className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {isPending && selectingId === dataset.id ? (
                        <Loader2
                          className="size-4.5 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <FileSpreadsheet className="size-4.5" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm font-medium text-foreground"
                        title={dataset.fileName}
                      >
                        {dataset.fileName}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {processing ? (
                          <>
                            <Loader2
                              className="size-3 animate-spin"
                              aria-hidden
                            />
                            {processing}
                          </>
                        ) : dataset.rowCount != null &&
                          dataset.columnCount != null ? (
                          `${numberPtBr(dataset.rowCount)} linhas, ${numberPtBr(dataset.columnCount)} colunas`
                        ) : (
                          "Sem informações de linhas e colunas"
                        )}
                      </span>
                      {processing ? (
                        <span
                          role="progressbar"
                          aria-label={`Progresso do processamento: ${processing}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={
                            PROCESSING_PROGRESS[dataset.status] ?? 0
                          }
                          className="mt-1.5 block h-1 w-44 max-w-full overflow-hidden rounded-full bg-primary/15"
                        >
                          <span
                            className="block h-full rounded-full bg-primary transition-[width] duration-700"
                            style={{
                              width: `${PROCESSING_PROGRESS[dataset.status] ?? 0}%`,
                            }}
                          />
                        </span>
                      ) : null}
                    </span>
                    <span
                      suppressHydrationWarning
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {formatRelativeDate(dataset.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteError(null);
            setDeleteTarget(null);
          }
        }}
        title="Excluir dataset?"
        pending={deletingId !== null}
        error={deleteError}
        onConfirm={handleDelete}
        description={
          <p>
            O arquivo <strong>{deleteTarget?.fileName}</strong> e o histórico de
            treinamentos associado serão excluídos permanentemente. Essa ação
            não pode ser desfeita.
          </p>
        }
      />
    </div>
  );
}

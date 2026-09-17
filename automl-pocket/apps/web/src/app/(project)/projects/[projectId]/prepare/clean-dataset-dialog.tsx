"use client";

import { useMemo, useState, useTransition } from "react";
import { Eraser, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { cleanDataset } from "./actions";
import { estimateCleanImpact, type CleanOperationKey } from "./clean-preview";
import type { PrepareColumn, SampleRow } from "./prepare-view";

// Ordem de exibição das 8 operações (a ordem de aplicação é fixa no worker);
// exportada para o tooltip dos chips de versão (version-chips.tsx)
export const OPERATIONS: {
  key: CleanOperationKey;
  label: string;
  hint: string;
  defaultChecked: boolean;
}[] = [
  {
    key: "standardize_dates",
    label: "Padronizar colunas de data",
    hint: "Converte datas para o formato ISO 8601",
    defaultChecked: true,
  },
  {
    key: "remove_unexpected_nulls",
    label: "Remover nulos inesperados",
    hint: "Remove linhas com nulo em colunas preenchidas em ≥99%",
    defaultChecked: true,
  },
  {
    key: "group_excess_categories",
    label: "Substituir categorias excedentes por “Outros”",
    hint: "Mantém as 32 categorias mais frequentes por coluna",
    defaultChecked: true,
  },
  {
    key: "remove_constant_columns",
    label: "Remover colunas constantes",
    hint: "Colunas com um único valor não ajudam o modelo",
    defaultChecked: true,
  },
  {
    key: "remove_illegible_numeric_columns",
    label: "Remover colunas numéricas majoritariamente ilegíveis",
    hint: "Colunas numéricas com ≥99% de valores ilegíveis ou vazios",
    defaultChecked: true,
  },
  {
    key: "remove_illegible_date_columns",
    label: "Remover colunas de data majoritariamente ilegíveis",
    hint: "Colunas de data com ≥99% de valores ilegíveis ou vazios",
    defaultChecked: true,
  },
  {
    key: "remove_empty_columns",
    label: "Remover colunas majoritariamente vazias",
    hint: "Colunas com ≥99% de valores vazios",
    defaultChecked: true,
  },
  {
    key: "flag_outliers",
    label: "Marcar outliers",
    hint: "Cria uma coluna “<nome>_outlier” por coluna numérica",
    defaultChecked: false,
  },
];

const DEFAULT_CHECKED: Record<CleanOperationKey, boolean> = Object.fromEntries(
  OPERATIONS.map((operation) => [operation.key, operation.defaultChecked]),
) as Record<CleanOperationKey, boolean>;

/**
 * Modal "Limpar dataset": 8 operações guiadas com preview de impacto estimado
 * a partir das stats do perfilamento; aplicar enfileira dataset:transform
 * kind clean no worker.
 */
export function CleanDatasetDialog({
  datasetId,
  rowCount,
  columns,
  rows,
  disabled,
  onEnqueued,
}: {
  datasetId: string;
  rowCount: number | null;
  columns: PrepareColumn[];
  rows: SampleRow[];
  disabled: boolean;
  onEnqueued: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] =
    useState<Record<CleanOperationKey, boolean>>(DEFAULT_CHECKED);
  const [showPreview, setShowPreview] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(
    () =>
      new Set<CleanOperationKey>(
        OPERATIONS.filter((operation) => checked[operation.key]).map(
          (operation) => operation.key,
        ),
      ),
    [checked],
  );

  // Recalcula em sincronia com as checkboxes enquanto o preview está aberto
  const impact = useMemo(
    () =>
      showPreview
        ? estimateCleanImpact(columns, rows, rowCount, selected)
        : null,
    [showPreview, columns, rows, rowCount, selected],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setChecked(DEFAULT_CHECKED);
      setShowPreview(false);
    }
  }

  function handleApply() {
    if (selected.size === 0) {
      toast.error("Selecione ao menos uma operação de limpeza.");
      return;
    }
    startTransition(async () => {
      const result = await cleanDataset(datasetId, [...selected]);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      onEnqueued();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Eraser className="size-3.5" aria-hidden />
          Limpar
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border py-4 pr-12 pl-6">
          <DialogTitle>Limpar dataset</DialogTitle>
          <DialogDescription>
            Selecione as operações de limpeza. Uma nova versão do dataset será
            criada — o arquivo original é preservado.
          </DialogDescription>
        </DialogHeader>

        {/* Único container com scroll: header/footer ficam fixos */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3 px-6 py-4">
            {OPERATIONS.map((operation) => (
              <label
                key={operation.key}
                className="flex cursor-pointer items-start gap-2.5"
              >
                <Checkbox
                  checked={checked[operation.key]}
                  onCheckedChange={(value) =>
                    setChecked((current) => ({
                      ...current,
                      [operation.key]: value === true,
                    }))
                  }
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium leading-none text-foreground">
                    {operation.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {operation.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {impact && (
            <div className="mx-6 mb-4 rounded-md border border-border bg-muted/40 px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Sparkles className="size-3.5 text-primary" aria-hidden />
                Impacto estimado
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {OPERATIONS.filter((operation) =>
                  impact.has(operation.key),
                ).map((operation) => {
                  const lines = impact.get(operation.key)!;
                  return (
                    <li key={operation.key} className="text-xs">
                      <span className="font-medium text-foreground">
                        {operation.label}:
                      </span>{" "}
                      {lines.length === 0 ? (
                        <span className="italic text-muted-foreground">
                          sem efeito neste dataset
                        </span>
                      ) : (
                        <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
                          {lines.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
                {impact.size === 0 && (
                  <li className="text-xs italic text-muted-foreground">
                    Nenhuma operação selecionada.
                  </li>
                )}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Estimativa calculada a partir do perfilamento — o resultado
                exato pode variar.
              </p>
            </div>
          )}
        </div>

        {/* mx-0/mb-0 neutralizam o -mx-4 -mb-4 do dialog.tsx (content usa p-0) */}
        <DialogFooter className="mx-0 mb-0 border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowPreview((current) => !current)}
          >
            {showPreview ? "Ocultar preview" : "Pré-visualizar"}
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={isPending || selected.size === 0}
          >
            {isPending && (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            )}
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

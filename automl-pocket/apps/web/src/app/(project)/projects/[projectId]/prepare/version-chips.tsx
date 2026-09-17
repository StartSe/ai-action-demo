"use client";

import { X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { OPERATIONS } from "./clean-dataset-dialog";

// Uma transformação aplicada (dataset_versions), da mais antiga à atual
export type VersionChip = {
  id: string;
  kind: "original" | "clean" | "type_change";
  label: string;
  params: unknown;
};

// Mesmos rótulos de tipo do TypeBadgeDropdown/TYPE_LABELS do worker
const TYPE_LABELS: Record<string, string> = {
  number: "Número",
  text: "Texto",
  category: "Categoria",
  date: "Data",
  id: "ID",
};

const OPERATION_LABELS: Record<string, string> = Object.fromEntries(
  OPERATIONS.map((operation) => [operation.key, operation.label]),
);

/** Descrição do tooltip do chip, derivada dos params da versão. */
function describeVersion(version: VersionChip): string {
  if (version.kind === "type_change") {
    const params = (version.params ?? {}) as {
      column?: string;
      newType?: string;
      convertedNulls?: number;
    };
    const typeLabel = TYPE_LABELS[params.newType ?? ""] ?? params.newType;
    let text = `Coluna “${params.column}” convertida para ${typeLabel}.`;
    if (typeof params.convertedNulls === "number" && params.convertedNulls > 0) {
      text +=
        params.convertedNulls === 1
          ? " 1 valor inconversível virou nulo."
          : ` ${params.convertedNulls.toLocaleString("pt-BR")} valores inconversíveis viraram nulos.`;
    }
    return text;
  }
  if (version.kind === "clean") {
    const params = (version.params ?? {}) as { operations?: string[] };
    const labels = (params.operations ?? []).map(
      (operation) => OPERATION_LABELS[operation] ?? operation,
    );
    return labels.length > 0
      ? `Operações aplicadas: ${labels.join("; ")}.`
      : version.label;
  }
  return version.label;
}

const CHIP_CLASS =
  "inline-flex max-w-56 items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] leading-4 text-muted-foreground";

/**
 * Chips das transformações aplicadas (US-039): um por versão, em ordem de
 * aplicação. Só o último pode ser desfeito ('×' com confirmação); os
 * anteriores têm tooltip descrevendo a transformação.
 */
export function VersionChips({
  versions,
  disabled,
  onUndo,
}: {
  versions: VersionChip[];
  disabled: boolean;
  onUndo: () => void;
}) {
  if (versions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {versions.map((version, index) => {
        const isLast = index === versions.length - 1;
        if (!isLast) {
          return (
            <Tooltip key={version.id}>
              <TooltipTrigger asChild>
                <span className={CHIP_CLASS} tabIndex={0}>
                  <span className="truncate">{version.label}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                {describeVersion(version)}
              </TooltipContent>
            </Tooltip>
          );
        }
        return (
          <AlertDialog key={version.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(CHIP_CLASS, "pr-1")} tabIndex={0}>
                  <span className="truncate">{version.label}</span>
                  <AlertDialogTrigger
                    disabled={disabled}
                    className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Desfazer transformação: ${version.label}`}
                  >
                    <X className="size-3" aria-hidden />
                  </AlertDialogTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                {describeVersion(version)}
              </TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Desfazer transformação?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{version.label}” será desfeita e o dataset voltará à versão
                  anterior. Essa ação não pode ser revertida.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onUndo}>Desfazer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { DatasetStatus } from "@/lib/dataset-status";

// null = status que a página do Prepare trata em outra tela (nunca chega aqui)
const STATUS_LABEL = {
  uploading: "Enviando arquivo...",
  parsing: "Processando arquivo...",
  needs_review: null,
  profiling: "Analisando colunas e correlações...",
  ready: null,
  error: null,
} satisfies Record<DatasetStatus, string | null>;

/**
 * Skeleton da grade enquanto o worker processa o dataset; o polling atualiza
 * o server component e a grade real substitui esta tela quando ficar "ready".
 */
export function PreparePending({ status }: { status: DatasetStatus }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          {STATUS_LABEL[status] ?? "Processando dataset..."}
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-card p-0">
        <div className="flex border-b border-border">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex h-[92px] w-46 shrink-0 flex-col gap-2 border-r border-border px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3.5 w-12" />
              </div>
              <Skeleton className="mt-auto h-8 w-full" />
            </div>
          ))}
        </div>
        {Array.from({ length: 14 }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex border-b border-border/60">
            {Array.from({ length: 6 }).map((_, colIndex) => (
              <div
                key={colIndex}
                className="flex h-[34px] w-46 shrink-0 items-center border-r border-border/60 px-2.5"
              >
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

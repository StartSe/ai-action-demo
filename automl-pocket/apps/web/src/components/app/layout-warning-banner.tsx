import Link from "next/link";
import { AlertTriangle, TableProperties } from "lucide-react";

import { TemplateDownloadLinks } from "@/components/app/template-download-links";
import { Button } from "@/components/ui/button";
import type { LayoutWarning } from "@/db/schema";
import { describeLayoutWarnings } from "@/lib/dataset-layout-form";
import { cn } from "@/lib/utils";

/**
 * Banner amarelo "Parece que a planilha não está no formato esperado"
 * (US-028): aparece em dataset `ready` cujo profiling deixou avisos em
 * `layout_diagnosis.warnings`. "Revisar planilha" reabre a tela da US-026
 * (`layoutReviewHref`) — a rota aceita `ready` com avisos e reprocessa com as
 * escolhas — e o link da planilha modelo mostra o formato que funciona.
 * Client-safe (só tipos + helpers puros): serve ao Prepare e à lista.
 */
export function LayoutWarningBanner({
  warnings,
  reviewHref,
  className,
}: {
  warnings: LayoutWarning[];
  reviewHref: string;
  className?: string;
}) {
  if (warnings.length === 0) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900",
        className,
      )}
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Parece que a planilha não está no formato esperado
        </p>
        <p className="text-amber-800">
          Encontramos {describeLayoutWarnings(warnings)}. Confira a aba, a linha
          do cabeçalho e a orientação antes de treinar.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <TemplateDownloadLinks
          source="layout_warning"
          className="whitespace-nowrap text-xs text-amber-800 [&_a]:text-amber-900"
        />
        <Button
          asChild
          size="sm"
          variant="outline"
          className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
        >
          <Link href={reviewHref}>
            <TableProperties data-icon="inline-start" aria-hidden />
            Revisar planilha
          </Link>
        </Button>
      </div>
    </div>
  );
}

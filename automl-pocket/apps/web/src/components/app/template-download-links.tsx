import { Download } from "lucide-react";

import {
  templateDownloadHref,
  type TemplateSource,
} from "@/lib/template-links";

const TEMPLATE_DOWNLOAD_LABEL = "Baixar planilha modelo";

/**
 * "Baixar planilha modelo (.xlsx | .csv)" — links para a rota autenticada
 * de download (US-026). `source` identifica na auditoria de onde veio o clique;
 * `label` troca só o texto antes dos formatos (ex.: "Baixar planilha de
 * exemplo" no banner dos primeiros passos).
 */
export function TemplateDownloadLinks({
  source,
  label = TEMPLATE_DOWNLOAD_LABEL,
  className,
}: {
  source: TemplateSource;
  label?: string;
  className?: string;
}) {
  const linkClass =
    "font-medium text-primary underline-offset-4 hover:underline";
  return (
    <span className={className}>
      <Download className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
      {label} (
      <a
        href={templateDownloadHref("xlsx", source)}
        download
        className={linkClass}
        aria-label="Baixar planilha modelo em Excel (.xlsx)"
      >
        .xlsx
      </a>
      {" | "}
      <a
        href={templateDownloadHref("csv", source)}
        download
        className={linkClass}
        aria-label="Baixar planilha modelo em CSV (.csv)"
      >
        .csv
      </a>
      )
    </span>
  );
}

/** Bloco fixo com o formato esperado da planilha + links do modelo. */
export function ExpectedFormatNotice({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground ${className ?? ""}`}
    >
      <p>
        <span className="font-medium text-foreground">Formato esperado:</span>{" "}
        primeira linha com o nome das características, uma linha por exemplo
        (cliente, venda, mês), uma única aba.
      </p>
      <TemplateDownloadLinks source="upload" className="mt-1 block" />
    </div>
  );
}

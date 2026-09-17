/**
 * Endereços da planilha modelo (US-026). Módulo sem dependências para poder
 * ser importado por componentes client — `spreadsheet-template.ts` puxa o
 * exceljs e fica só no servidor.
 */

export const TEMPLATE_FORMATS = ["csv", "xlsx"] as const;
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number];

/**
 * De onde veio o clique: tela de upload, mensagem de erro do parse, rodapé
 * da tela "Revisar planilha" (US-027) ou banner de estrutura ruim de um
 * dataset pronto (US-028).
 */
export const TEMPLATE_SOURCES = [
  "upload",
  "error",
  "review",
  "layout_warning",
] as const;
export type TemplateSource = (typeof TEMPLATE_SOURCES)[number];

export const TEMPLATE_DOWNLOAD_PATH = "/api/templates/planilha-modelo";

export function templateDownloadHref(
  format: TemplateFormat,
  source: TemplateSource,
): string {
  const params = new URLSearchParams({ format, source });
  return `${TEMPLATE_DOWNLOAD_PATH}?${params.toString()}`;
}

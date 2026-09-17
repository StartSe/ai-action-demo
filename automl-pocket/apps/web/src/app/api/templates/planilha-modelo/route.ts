import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit, requestMeta } from "@/lib/audit";
import { withNoStore } from "@/lib/http-headers";
import { internalApiPolicy, optionsNoCors } from "@/lib/internal-api";
import { getApiUser } from "@/lib/session";
import {
  CHURN_TEMPLATE,
  TEMPLATE_CONTENT_TYPES,
  TEMPLATE_FORMATS,
  buildTemplateCsv,
  buildTemplateXlsx,
} from "@/lib/spreadsheet-template";
import { TEMPLATE_SOURCES } from "@/lib/template-links";

const querySchema = z.object({
  format: z.enum(TEMPLATE_FORMATS),
  source: z.enum(TEMPLATE_SOURCES).default("upload"),
});

/**
 * GET /api/templates/planilha-modelo?format=csv|xlsx&source=upload|error
 * Planilha modelo no formato esperado pelo upload (US-026). Exige sessão.
 */
export async function GET(request: Request) {
  // Rota interna (mesma política das demais rotas com sessão — US-019)
  const denied = await internalApiPolicy(request);
  if (denied) return withNoStore(denied);

  const requestHeaders = await headers();
  const auth = await getApiUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const searchParams = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    format: searchParams.get("format") ?? undefined,
    source: searchParams.get("source") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Formato inválido. Use format=csv ou format=xlsx." },
      { status: 400 },
    );
  }
  const { format, source } = parsed.data;

  const template = CHURN_TEMPLATE;
  const body =
    format === "csv"
      ? buildTemplateCsv(template)
      : await buildTemplateXlsx(template);

  await logAudit({
    action: "dataset.template_download",
    orgId: user.orgId,
    userId: user.id,
    metadata: { format, source, template: template.key },
    ...requestMeta(requestHeaders),
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": TEMPLATE_CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${template.fileName}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}

// Preflight sem nenhum Access-Control-*: cross-origin falha no navegador
export const OPTIONS = optionsNoCors;

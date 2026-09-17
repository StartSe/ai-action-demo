import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { datasetColumns } from "@/db/schema";
import { requestMeta } from "@/lib/audit";
import { getActiveParquetPath, readParquetRows } from "@/lib/datasets";
import { withNoStore } from "@/lib/http-headers";
import { internalApiPolicy, optionsNoCors } from "@/lib/internal-api";
import { findDatasetScoped } from "@/lib/org-scope";
import { getApiUser } from "@/lib/session";

const paramsSchema = z.object({ datasetId: z.uuid() });

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});

/**
 * Leitura paginada do dataset completo a partir do Parquet da versão ativa
 * (US-009). A grade do Prepare serve a primeira página da amostra em memória
 * e busca as demais aqui.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ datasetId: string }> },
) {
  // Rota interna: outro site não pode ler linhas do dataset (US-019)
  const denied = await internalApiPolicy(request);
  if (denied) return withNoStore(denied);

  // Linhas do dataset são por org: nunca cacheáveis (Cache-Control: no-store)
  return withNoStore(await readRows(request, context));
}

// Preflight sem nenhum Access-Control-*: cross-origin falha no navegador
export const OPTIONS = optionsNoCors;

async function readRows(
  request: Request,
  { params }: { params: Promise<{ datasetId: string }> },
): Promise<Response> {
  const requestHeaders = await headers();
  const auth = await getApiUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Dataset não encontrado." },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Parâmetros de paginação inválidos." },
      { status: 400 },
    );
  }
  const { page, pageSize } = parsedQuery.data;

  const db = getDb();
  // Escopo de org injetado pelo helper; negação (outra org) é auditada
  const dataset = await findDatasetScoped(user, parsedParams.data.datasetId, {
    meta: requestMeta(requestHeaders),
  });
  if (!dataset) {
    return NextResponse.json(
      { error: "Dataset não encontrado." },
      { status: 404 },
    );
  }

  // Durante o re-profiling de uma transformação a grade continua visível, por
  // isso "profiling" também serve páginas (do parquet da versão ativa)
  const activeParquetPath = await getActiveParquetPath(dataset);
  if (
    (dataset.status !== "ready" && dataset.status !== "profiling") ||
    !activeParquetPath
  ) {
    return NextResponse.json(
      { error: "O dataset ainda está sendo processado." },
      { status: 409 },
    );
  }

  const columns = await db
    .select({ name: datasetColumns.name })
    .from(datasetColumns)
    .where(eq(datasetColumns.datasetId, dataset.id))
    .orderBy(asc(datasetColumns.position));
  const names = columns.map((column) => column.name);

  const rowStart = (page - 1) * pageSize;
  let rows: Record<string, unknown>[];
  try {
    rows = await readParquetRows(
      activeParquetPath,
      names,
      rowStart,
      rowStart + pageSize,
    );
  } catch (error) {
    console.error("Falha ao ler o Parquet para paginação:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as linhas. Tente novamente." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    rows,
    page,
    pageSize,
    total: dataset.rowCount,
  });
}

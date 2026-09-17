import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { z } from "zod";

import { getDb } from "@/db";
import { datasetColumns } from "@/db/schema";
import { logAudit, requestMeta } from "@/lib/audit";
import { getActiveParquetPath } from "@/lib/datasets";
import { withNoStore } from "@/lib/http-headers";
import { internalApiPolicy, optionsNoCors } from "@/lib/internal-api";
import { findDatasetScoped } from "@/lib/org-scope";
import { getApiUser } from "@/lib/session";

const paramsSchema = z.object({ datasetId: z.uuid() });

const ORIGINAL_CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json; charset=utf-8",
};

function contentDisposition(fileName: string): string {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function toCsvValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    // Datas sem componente de hora saem como YYYY-MM-DD
    return value.toISOString().replace(/T00:00:00\.000Z$/, "");
  }
  if (typeof value === "bigint") return value.toString();
  return String(value);
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ datasetId: string }> },
) {
  // Rota interna: outro site não pode baixar o dataset (US-019)
  const denied = await internalApiPolicy(request);
  if (denied) return withNoStore(denied);

  // Dados do dataset são por org: nunca cacheáveis (Cache-Control: no-store)
  return withNoStore(await downloadDataset(request, context));
}

// Preflight sem nenhum Access-Control-*: cross-origin falha no navegador
export const OPTIONS = optionsNoCors;

async function downloadDataset(
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
  const { datasetId } = parsedParams.data;

  const db = getDb();
  // Escopo de org injetado pelo helper; negação (outra org) é auditada
  const dataset = await findDatasetScoped(user, datasetId, {
    meta: requestMeta(requestHeaders),
  });

  if (!dataset) {
    return NextResponse.json(
      { error: "Dataset não encontrado." },
      { status: 404 },
    );
  }
  const uploadDir = process.env.UPLOAD_DIR ?? "uploads";

  // ?original=true → arquivo enviado pela usuária, intacto (US-040); o
  // download padrão reflete a versão ativa das transformações do Prepare
  const original =
    new URL(request.url).searchParams.get("original") === "true";
  if (original) {
    const originalFile = path.join(
      /*turbopackIgnore: true*/ uploadDir,
      dataset.filePath,
    );
    let size: number;
    try {
      size = (await stat(originalFile)).size;
    } catch {
      return NextResponse.json(
        { error: "Arquivo original não encontrado." },
        { status: 404 },
      );
    }

    await logAudit({
      action: "dataset.download",
      orgId: user.orgId,
      userId: user.id,
      resourceType: "dataset",
      resourceId: dataset.id,
      metadata: { fileName: dataset.fileName, original: true },
      ...requestMeta(requestHeaders),
    });

    const stream = Readable.toWeb(
      createReadStream(originalFile),
    ) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        "Content-Type":
          ORIGINAL_CONTENT_TYPES[dataset.format] ??
          "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": contentDisposition(dataset.fileName),
      },
    });
  }

  // Versão ativa das transformações do Prepare (fallback: parquet original)
  const activeParquetPath = await getActiveParquetPath(dataset);
  if (dataset.status !== "ready" || !activeParquetPath) {
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

  const parquetFile = path.join(
    /*turbopackIgnore: true*/ uploadDir,
    activeParquetPath,
  );

  let records: Record<string, unknown>[];
  try {
    const file = await asyncBufferFromFile(parquetFile);
    records = await parquetReadObjects({ file, columns: names });
  } catch (error) {
    console.error("Falha ao ler o Parquet para download:", error);
    return NextResponse.json(
      { error: "Não foi possível gerar o arquivo. Tente novamente." },
      { status: 500 },
    );
  }

  const lines = [names.map(escapeCsv).join(",")];
  for (const record of records) {
    lines.push(
      names.map((name) => escapeCsv(toCsvValue(record[name]))).join(","),
    );
  }
  // BOM para o Excel abrir UTF-8 (acentos pt-BR) corretamente
  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";

  await logAudit({
    action: "dataset.download",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "dataset",
    resourceId: dataset.id,
    metadata: { fileName: dataset.fileName, rowCount: dataset.rowCount },
    ...requestMeta(requestHeaders),
  });

  const baseName =
    dataset.fileName.replace(/\.[^.]+$/, "").trim() || "dataset";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition(`${baseName}.csv`),
    },
  });
}

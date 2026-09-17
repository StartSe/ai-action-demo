import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { datasets } from "@/db/schema";
import { logAudit, requestMeta } from "@/lib/audit";
import { withNoStore } from "@/lib/http-headers";
import { internalApiPolicy, optionsNoCors } from "@/lib/internal-api";
import { enqueueDatasetParse } from "@/lib/queue";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  FORMAT_BY_EXTENSION,
  maxUploadBytes,
  uploadFileSchema,
  validateFileSignature,
} from "@/lib/upload-validation";
import { getApiUser } from "@/lib/session";

export async function POST(request: Request) {
  // Rota interna: outro site não pode disparar upload (US-019). Antes da
  // sessão, para contar também tentativas anônimas no modo report.
  const denied = await internalApiPolicy(request);
  if (denied) return withNoStore(denied);

  // Resposta por usuário (id do dataset, erros de validação): Cache-Control: no-store
  return withNoStore(await uploadDataset(request));
}

// Preflight sem nenhum Access-Control-*: cross-origin falha no navegador
export const OPTIONS = optionsNoCors;

async function uploadDataset(request: Request): Promise<Response> {
  const requestHeaders = await headers();
  const auth = await getApiUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const rateLimited = await enforceRateLimit("upload", user.id, {
    limit: 15,
    windowSec: 60,
  });
  if (rateLimited) return rateLimited;

  let file: File | null = null;
  try {
    const formData = await request.formData();
    const entry = formData.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    // Body não é multipart válido — cai na validação abaixo
  }
  if (!file || file.size === 0) {
    return NextResponse.json(
      { error: "Nenhum arquivo foi enviado." },
      { status: 400 },
    );
  }

  const parsed = uploadFileSchema.safeParse({
    fileName: file.name,
    size: file.size,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Arquivo inválido." },
      { status: 400 },
    );
  }

  const extension = path.extname(parsed.data.fileName).toLowerCase();
  const format = FORMAT_BY_EXTENSION[extension];
  if (!format) {
    return NextResponse.json(
      {
        error:
          "Formato não suportado. Envie um arquivo .csv, .xlsx, .xls ou .json.",
      },
      { status: 400 },
    );
  }

  const limit = maxUploadBytes();
  if (file.size > limit) {
    return NextResponse.json(
      {
        error: `Arquivo muito grande. O limite é ${Math.floor(limit / (1024 * 1024))} MB.`,
      },
      { status: 413 },
    );
  }

  // Conteúdo precisa bater com a extensão (magic bytes), não só o nome
  const buffer = Buffer.from(await file.arrayBuffer());
  const signatureError = validateFileSignature(buffer, extension);
  if (signatureError) {
    return NextResponse.json({ error: signatureError }, { status: 400 });
  }

  // Arquivo gravado com nome UUID no volume de uploads
  const uploadDir = process.env.UPLOAD_DIR ?? "uploads";
  const storedName = `${randomUUID()}${extension}`;
  const absolutePath = path.join(
    /*turbopackIgnore: true*/ uploadDir,
    storedName,
  );
  await mkdir(/*turbopackIgnore: true*/ uploadDir, { recursive: true });
  await writeFile(absolutePath, buffer);

  const db = getDb();
  const [dataset] = await db
    .insert(datasets)
    .values({
      orgId: user.orgId,
      createdBy: user.id,
      fileName: file.name,
      format,
      status: "parsing",
      filePath: storedName,
      // Tamanho do arquivo original; o worker soma os parquets
      sizeBytes: file.size,
    })
    .returning({ id: datasets.id });

  const meta = requestMeta(requestHeaders);
  await logAudit({
    action: "dataset.upload",
    orgId: user.orgId,
    userId: user.id,
    resourceType: "dataset",
    resourceId: dataset.id,
    metadata: { fileName: file.name, format, sizeBytes: file.size },
    ...meta,
  });

  try {
    await enqueueDatasetParse(dataset.id);
  } catch (error) {
    console.error("Falha ao enfileirar dataset:parse:", error);
    await db
      .update(datasets)
      .set({
        status: "error",
        errorMessage:
          "Não foi possível iniciar o processamento do arquivo. Tente enviar novamente.",
      })
      .where(eq(datasets.id, dataset.id));
    await unlink(absolutePath).catch(() => {});
    return NextResponse.json(
      {
        error:
          "Não foi possível iniciar o processamento do arquivo. Tente novamente.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ datasetId: dataset.id }, { status: 201 });
}

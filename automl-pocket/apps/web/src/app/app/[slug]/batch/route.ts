import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit, requestMeta } from "@/lib/audit";
import { findPublishedWebAppBySlug } from "@/lib/deployments";
import { withNoStore } from "@/lib/http-headers";
import { internalApiPolicy, optionsNoCors } from "@/lib/internal-api";
import {
  PREDICTION_TIMEOUT_MESSAGE,
  runBatchPrediction,
} from "@/lib/predictions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PREDICT_BATCH_RATE_LIMIT } from "@/lib/rate-limit-policy";
import { removeFileQuiet } from "@/lib/uploads";
import {
  maxUploadBytes,
  uploadFileSchema,
  validateFileSignature,
} from "@/lib/upload-validation";

const UNAVAILABLE_MESSAGE = "Este formulário não está mais disponível.";
const GENERIC_MESSAGE =
  "Não foi possível processar o arquivo. Tente novamente.";

// Só planilhas no lote (o Web App não aceita .json, diferente do upload interno)
const BATCH_EXTENSIONS = new Set([".csv", ".xlsx", ".xls"]);

const BATCH_DIR = "batches";

// Arquivos órfãos (ex.: processo caiu antes do finally) expiram em 1h
const STALE_AFTER_MS = 60 * 60 * 1000;

function batchDir(): string {
  return path.join(
    /*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "uploads",
    BATCH_DIR,
  );
}

/** Varredura best-effort dos temporários expirados do lote. */
async function sweepStaleBatchFiles(dir: string): Promise<void> {
  try {
    const now = Date.now();
    const entries = await readdir(dir);
    await Promise.all(
      entries.map(async (name) => {
        const filePath = path.join(dir, name);
        const info = await stat(filePath).catch(() => null);
        if (info?.isFile() && now - info.mtimeMs > STALE_AFTER_MS) {
          await removeFileQuiet(filePath);
        }
      }),
    );
  } catch {
    // Diretório ainda não existe ou volume indisponível — nada a varrer
  }
}

/**
 * Predição em lote da página pública do Web App (US-045): recebe um
 * CSV/XLSX/XLS, roda model:predict-batch no worker e devolve o CSV com a
 * coluna "predicao" (+ "probabilidade" na classificação). Os arquivos de
 * entrada e saída são temporários e removidos ao final da requisição.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/app/[slug]/batch">,
) {
  // O formulário público é servido pelo próprio app: outro site não pode
  // disparar predições em lote por ele (US-019)
  const denied = await internalApiPolicy(request);
  if (denied) return withNoStore(denied);

  const requestHeaders = await headers();
  const meta = requestMeta(requestHeaders);

  // Superfície pública sem sessão: a chave é o IP; o limite vem da política
  // única de rate limit (US-011)
  const rateLimited = await enforceRateLimit(
    "webapp-batch",
    meta.ip ?? "unknown",
    PREDICT_BATCH_RATE_LIMIT,
  );
  if (rateLimited) return rateLimited;

  const { slug } = await ctx.params;
  const webApp = await findPublishedWebAppBySlug(slug);
  if (!webApp) {
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 404 });
  }

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
  if (!BATCH_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: "Formato não suportado. Envie um arquivo .csv, .xlsx ou .xls." },
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

  const dir = batchDir();
  await sweepStaleBatchFiles(dir);

  // Entrada e saída com nome UUID, relativos ao UPLOAD_DIR (o worker resolve)
  const id = randomUUID();
  const inputPath = `${BATCH_DIR}/${id}${extension}`;
  const outputPath = `${BATCH_DIR}/${id}-predicoes.csv`;
  await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  await writeFile(path.join(dir, `${id}${extension}`), buffer);

  try {
    const result = await runBatchPrediction(
      webApp.model.id,
      inputPath,
      outputPath,
    );
    const output = await readFile(path.join(dir, `${id}-predicoes.csv`));

    // Auditoria sem os dados enviados — só o deployment, a origem e o volume
    await logAudit({
      action: "webapp.predict_batch",
      orgId: webApp.deployment.orgId,
      resourceType: "deployment",
      resourceId: webApp.deployment.id,
      metadata: {
        projectId: webApp.deployment.projectId,
        projectName: webApp.projectName,
        type: "web_app",
        rows: result.rows,
      },
      ...meta,
    });

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="predicoes.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // runBatchPrediction já entrega mensagens em português (worker/timeout)
    const message = error instanceof Error ? error.message : GENERIC_MESSAGE;
    const status = message === PREDICTION_TIMEOUT_MESSAGE ? 504 : 422;
    return NextResponse.json({ error: message }, { status });
  } finally {
    // Temporários do lote nunca sobrevivem à requisição
    await removeFileQuiet(path.join(dir, `${id}${extension}`));
    await removeFileQuiet(path.join(dir, `${id}-predicoes.csv`));
  }
}

// Preflight sem nenhum Access-Control-*: cross-origin falha no navegador
export const OPTIONS = optionsNoCors;

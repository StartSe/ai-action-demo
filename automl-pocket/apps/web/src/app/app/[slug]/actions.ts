"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { logAudit, requestMeta } from "@/lib/audit";
import { findPublishedWebAppBySlug } from "@/lib/deployments";
import { runPrediction, type Prediction } from "@/lib/predictions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PREDICT_RATE_LIMIT } from "@/lib/rate-limit-policy";
import type { DeploymentFormField } from "@/components/deployment-form";

const UNAVAILABLE_MESSAGE = "Este formulário não está mais disponível.";
const GENERIC_MESSAGE =
  "Não foi possível calcular a predição. Tente novamente.";

const inputSchema = z.object({
  slug: z.string().max(128),
  values: z.record(z.string().max(300), z.string().max(1000)),
});

export type PublicPredictResult =
  { ok: true; prediction: Prediction } | { ok: false; error: string };

/** Valor cru do formulário → valor da linha p/ o pipeline (vazio vira nulo). */
function toRowValue(
  field: DeploymentFormField,
  raw: string | undefined,
): unknown {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (field.type === "number") {
    // input type=number envia ponto decimal; aceita vírgula de colagem manual
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return value;
}

/**
 * Predição pública do Web App (US-044): resolve o deployment publicado pelo
 * slug, aplica rate limit por IP e roda a inferência síncrona da US-042.
 * Só os campos selecionados na configuração entram na linha — o restante
 * vira nulo no worker.
 */
export async function predictPublicWebApp(
  slug: string,
  values: Record<string, string>,
): Promise<PublicPredictResult> {
  const parsed = inputSchema.safeParse({ slug, values });
  if (!parsed.success) return { ok: false, error: GENERIC_MESSAGE };

  const meta = requestMeta(await headers());
  // Superfície pública sem sessão: a chave é o IP; o limite vem da política
  // única de rate limit (US-011)
  const limited = await enforceRateLimit(
    "webapp-predict",
    meta.ip ?? "unknown",
    PREDICT_RATE_LIMIT,
  );
  if (limited) {
    const body = (await limited.json()) as { error?: string };
    return { ok: false, error: body.error ?? GENERIC_MESSAGE };
  }

  const ctx = await findPublishedWebAppBySlug(parsed.data.slug);
  if (!ctx) return { ok: false, error: UNAVAILABLE_MESSAGE };

  const row = Object.fromEntries(
    ctx.formFields.map((field) => [
      field.name,
      toRowValue(field, parsed.data.values[field.name]),
    ]),
  );

  try {
    const [prediction] = await runPrediction(ctx.model.id, [row]);
    if (!prediction) return { ok: false, error: GENERIC_MESSAGE };

    // Auditoria sem os dados enviados — só o deployment e a origem
    await logAudit({
      action: "webapp.predict",
      orgId: ctx.deployment.orgId,
      resourceType: "deployment",
      resourceId: ctx.deployment.id,
      metadata: {
        projectId: ctx.deployment.projectId,
        projectName: ctx.projectName,
        type: "web_app",
        // Predição individual do formulário: sempre 1 linha
        rows: 1,
      },
      ...meta,
    });

    return { ok: true, prediction };
  } catch (error) {
    // runPrediction já converte timeout/falha do worker p/ mensagem em pt
    return {
      ok: false,
      error: error instanceof Error ? error.message : GENERIC_MESSAGE,
    };
  }
}

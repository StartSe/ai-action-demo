import { headers } from "next/headers";
import type { NextRequest } from "next/server";

import { recordApiAuthFailure } from "@/lib/api-auth-failures";
import { handleApiPredict } from "@/lib/api-predict";
import { logAudit, requestLogContext, requestMeta } from "@/lib/audit";
import { touchDeploymentLastUsed } from "@/lib/deployment-last-used";
import { findPublishedApiDeploymentByKeyHash } from "@/lib/deployments";
import { withPublicApiHeaders } from "@/lib/http-headers";
import { runPrediction } from "@/lib/predictions";
import { enforceRateLimit } from "@/lib/rate-limit";
// Por chave (hash), não por IP: cada integração tem a própria janela
import { PREDICT_RATE_LIMIT } from "@/lib/rate-limit-policy";

/**
 * Endpoint público de predição do deployment de API (US-046).
 * Header Authorization: Bearer <chave> (ou api_key no body, compat que será
 * descontinuada — US-030) + body { rows: [{coluna: valor}] } →
 * { predictions: [...] }. A lógica (e os erros 401/422/429/504) vive em
 * src/lib/api-predict.ts.
 */
export async function POST(request: NextRequest) {
  try {
    return await predict(request);
  } catch (error) {
    // Falha inesperada (infra): log com a URL higienizada (US-039) — nunca
    // `request.url` cru nem o body, que carregam a chave
    console.error(
      "[api/v1/predict] falha inesperada:",
      requestLogContext(request),
      error,
    );
    return withPublicApiHeaders(
      Response.json(
        { error: "Não foi possível processar a requisição. Tente novamente." },
        { status: 500 },
      ),
    );
  }
}

async function predict(request: NextRequest): Promise<Response> {
  // Predições são por chave/deployment: nunca cacheáveis (no-store) e sempre
  // com X-Content-Type-Options: nosniff (US-040)
  return withPublicApiHeaders(
    await handleApiPredict(request, {
      rateLimit: (keyHash) =>
        enforceRateLimit("api-predict", keyHash, PREDICT_RATE_LIMIT),
      findDeploymentByKeyHash: findPublishedApiDeploymentByKeyHash,
      // Toda falha de autenticação: api.auth_failed + contagem por IP (US-021)
      onAuthFailed: (attemptedKey) =>
        recordApiAuthFailure({
          channel: "api",
          attemptedKey,
          headers: request.headers,
        }),
      predict: runPrediction,
      audit: async (target, rowCount, keyLocation) => {
        // Auditoria sem os dados enviados — só o deployment, a origem, o volume
        // e onde a chave veio (header|body), para medir a migração do body
        const meta = requestMeta(await headers());
        await Promise.all([
          logAudit({
            action: "api.predict",
            orgId: target.orgId,
            resourceType: "deployment",
            resourceId: target.deploymentId,
            metadata: {
              projectId: target.projectId,
              projectName: target.projectName,
              type: "api",
              rows: rowCount,
              keyLocation,
            },
            ...meta,
          }),
          // "Último uso" da chave (US-038), no máximo 1 UPDATE/min por deployment
          touchDeploymentLastUsed(target.deploymentId, meta.ip),
        ]);
      },
    }),
  );
}

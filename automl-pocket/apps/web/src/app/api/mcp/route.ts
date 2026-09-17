import { headers } from "next/headers";
import type { NextRequest } from "next/server";

import { recordApiAuthFailure } from "@/lib/api-auth-failures";
import { logAudit, requestLogContext, requestMeta } from "@/lib/audit";
import { touchDeploymentLastUsed } from "@/lib/deployment-last-used";
import { findPublishedMcpDeploymentByKeyHash } from "@/lib/deployments";
import { withPublicApiHeaders } from "@/lib/http-headers";
import { handleMcpRequest } from "@/lib/mcp-predict";
import { runPrediction } from "@/lib/predictions";
import { enforceRateLimit } from "@/lib/rate-limit";
// Por chave (hash), não por IP: cada cliente MCP tem a própria janela.
// O handshake gasta ~3 requests (initialize/initialized/tools-list) — cabe
// com folga nos 30/min da predição individual.
import { PREDICT_RATE_LIMIT } from "@/lib/rate-limit-policy";

/**
 * Endpoint MCP do deployment (US-047): Streamable HTTP stateless autenticado
 * por Authorization: Bearer <api_key>. A lógica (e os erros 401/429) vive em
 * src/lib/mcp-predict.ts.
 */
export async function POST(request: NextRequest) {
  try {
    return await mcp(request);
  } catch (error) {
    // Falha inesperada (infra): log com a URL higienizada (US-039) — o
    // `?token=` é a chave do deployment e não pode ir para stdout
    console.error(
      "[api/mcp] falha inesperada:",
      requestLogContext(request),
      error,
    );
    return withPublicApiHeaders(
      Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Erro interno. Tente novamente." },
          id: null,
        },
        { status: 500 },
      ),
    );
  }
}

async function mcp(request: NextRequest): Promise<Response> {
  // Respostas MCP são por chave/deployment: nunca cacheáveis (no-store) e
  // sempre com nosniff (US-040)
  return withPublicApiHeaders(
    await handleMcpRequest(request, {
      rateLimit: (keyHash) =>
        enforceRateLimit("mcp-predict", keyHash, PREDICT_RATE_LIMIT),
      findDeploymentByKeyHash: findPublishedMcpDeploymentByKeyHash,
      // Toda falha de autenticação: api.auth_failed + contagem por IP (US-021)
      onAuthFailed: (attemptedKey) =>
        recordApiAuthFailure({
          channel: "mcp",
          attemptedKey,
          headers: request.headers,
        }),
      predict: runPrediction,
      audit: async (target, keyLocation) => {
        // Auditoria sem os dados enviados — só o deployment, a origem e onde
        // a chave veio (header|query), para medir quem ainda usa ?token=
        const meta = requestMeta(await headers());
        await Promise.all([
          logAudit({
            action: "mcp.predict",
            orgId: target.orgId,
            resourceType: "deployment",
            resourceId: target.deploymentId,
            metadata: {
              projectId: target.projectId,
              projectName: target.projectName,
              type: "mcp",
              // A tool predict sempre envia 1 linha por chamada
              rows: 1,
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

// Stateless: sem stream SSE aberto por GET nem sessão para encerrar (DELETE)
function methodNotAllowed() {
  return withPublicApiHeaders(
    Response.json(
      { error: "Método não suportado. Use POST." },
      { status: 405, headers: { Allow: "POST" } },
    ),
  );
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}

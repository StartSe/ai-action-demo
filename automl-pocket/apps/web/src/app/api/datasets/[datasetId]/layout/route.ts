import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { getDb } from "@/db";
import { datasets } from "@/db/schema";
import { logAudit, requestMeta } from "@/lib/audit";
import {
  LAYOUT_REVIEWED_ACTION,
  handleDatasetLayout,
} from "@/lib/dataset-layout";
import { withNoStore } from "@/lib/http-headers";
import { internalApiPolicy, optionsNoCors } from "@/lib/internal-api";
import { findDatasetScoped } from "@/lib/org-scope";
import { enqueueDatasetParse } from "@/lib/queue";
import { getApiUser } from "@/lib/session";

/**
 * Escolhas da tela "Revisar planilha" (US-025): body
 * { sheets, combine, headerRow, transpose } → grava parse_options, volta o
 * dataset a "parsing" e reenfileira o dataset:parse. A lógica (validação,
 * elegibilidade por status, checagem contra o diagnóstico e os erros 4xx)
 * vive em src/lib/dataset-layout.ts; aqui só entram as bordas reais.
 * Confirmação bem-sucedida grava `dataset.layout_reviewed` (US-028).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ datasetId: string }> },
) {
  // Rota interna: outro site não pode reprocessar datasets (US-019). Antes da
  // sessão, para contar também tentativas anônimas no modo report.
  const denied = await internalApiPolicy(request);
  if (denied) return withNoStore(denied);

  const params = await context.params;
  // Estado do dataset é por org: nunca cacheável (Cache-Control: no-store)
  return withNoStore(
    await handleDatasetLayout(request, params, {
      getApiUser,
      findDataset: async (viewer, datasetId) => {
        // Negação (outra org) é auditada pelo helper com ip/user-agent
        const dataset = await findDatasetScoped(viewer, datasetId, {
          meta: requestMeta(await headers()),
        });
        return dataset ?? null;
      },
      saveOptions: async (datasetId, options) => {
        // Revisão a partir de ready (banner de avisos, US-028) descarta a
        // versão ativa: o reparse regrava o Parquet original e as
        // transformações antigas não valem mais para a nova estrutura
        await getDb()
          .update(datasets)
          .set({
            parseOptions: options,
            status: "parsing",
            errorMessage: null,
            currentVersionId: null,
          })
          .where(eq(datasets.id, datasetId));
      },
      enqueueParse: enqueueDatasetParse,
      markEnqueueFailed: async (datasetId, message) => {
        await getDb()
          .update(datasets)
          .set({ status: "error", errorMessage: message })
          .where(eq(datasets.id, datasetId));
      },
      audit: async (event) => {
        await logAudit({
          action: LAYOUT_REVIEWED_ACTION,
          orgId: event.orgId,
          userId: event.userId,
          resourceType: "dataset",
          resourceId: event.datasetId,
          ...requestMeta(await headers()),
          metadata: event.metadata,
        });
      },
    }),
  );
}

// Preflight sem nenhum Access-Control-*: cross-origin falha no navegador
export const OPTIONS = optionsNoCors;

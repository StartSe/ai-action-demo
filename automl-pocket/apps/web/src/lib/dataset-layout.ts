import { NextResponse } from "next/server";
import { z } from "zod";

import type {
  DatasetParseOptions,
  DatasetStatus,
  LayoutDiagnosis,
} from "@/db/schema";
import type { Viewer } from "@/lib/org-scope";
import type { SessionUser } from "@/lib/session";

/**
 * Lógica da rota POST /api/datasets/[datasetId]/layout (US-025): a tela
 * "Revisar planilha" envia as escolhas de abas/cabeçalho/orientação, a rota
 * grava `parse_options`, volta o dataset a "parsing" e reenfileira o
 * dataset:parse — o worker aplica as opções (com LAYOUT_REVIEW_ENABLED ligada
 * ou não) e nunca pausa de novo, porque `parse_options` deixou de ser NULL.
 *
 * As bordas (sessão, busca escopada por org, UPDATE e fila) chegam por
 * `DatasetLayoutDeps`, no mesmo padrão de src/lib/api-predict.ts, para o
 * teste rodar sem banco/Redis. A rota em
 * src/app/api/datasets/[datasetId]/layout/route.ts liga as dependências reais.
 *
 * Validações que respondem 400 ANTES de gastar um job do worker, espelhando
 * as mensagens de apps/worker/jobs/parsing.py:
 * - aba escolhida que não está no diagnóstico → "A aba 'X' não existe…";
 * - combine=true com abas de grupos diferentes (layout_diagnosis.groups) →
 *   "As abas X e Y têm colunas diferentes e não podem ser combinadas.".
 * Sem diagnóstico gravado (dataset anterior à US-023) a rota confia no worker.
 *
 * Ao confirmar (opções gravadas E job enfileirado), o evento
 * `dataset.layout_reviewed` vai para audit_logs com `layoutReviewedMetadata`
 * — só números/booleanos das escolhas, nunca conteúdo do arquivo (US-028).
 */

// Limite de abas do diagnóstico (layout.MAX_SHEETS) vive no módulo
// client-safe, que a tela de revisão importa; aqui só re-exporta.
import {
  MAX_LAYOUT_SHEETS,
  hasLayoutWarnings,
} from "@/lib/dataset-layout-form";

export { MAX_LAYOUT_SHEETS };

export const LAYOUT_REVIEWED_ACTION = "dataset.layout_reviewed";

export const LAYOUT_INVALID_MESSAGE =
  "Escolhas de layout inválidas. Recarregue a página e tente novamente.";

export const LAYOUT_NOT_REVIEWABLE_MESSAGE =
  "Este dataset não está aguardando revisão de layout.";

export const LAYOUT_ENQUEUE_FAILED_MESSAGE =
  "Não foi possível reiniciar o processamento do arquivo. Tente novamente.";

export const DATASET_NOT_FOUND_MESSAGE = "Dataset não encontrado.";

/** Mesma mensagem que o worker usa para aba inexistente (parsing._read_excel). */
export function missingSheetMessage(sheet: string): string {
  return `A aba '${sheet}' não existe na planilha ou está vazia.`;
}

/** Mesma mensagem que o worker usa em `combine` com fingerprints diferentes. */
export function incompatibleSheetsMessage(
  first: string,
  other: string,
): string {
  return `As abas ${first} e ${other} têm colunas diferentes e não podem ser combinadas.`;
}

export const layoutOptionsSchema = z.object({
  sheets: z
    .array(z.string().trim().min(1).max(255))
    .min(1)
    .max(MAX_LAYOUT_SHEETS),
  combine: z.boolean(),
  headerRow: z.number().int().min(0).max(10_000),
  transpose: z.boolean(),
});

/** O que o handler precisa saber do dataset (subconjunto da linha de `datasets`). */
export type LayoutDatasetRow = {
  id: string;
  status: DatasetStatus;
  layoutDiagnosis: LayoutDiagnosis | null;
  parseOptions: DatasetParseOptions | null;
};

export type DatasetLayoutDeps = {
  /** Usuário da sessão (getApiUser em produção): 401/403 prontos ou o user. */
  getApiUser(): Promise<
    { ok: true; user: SessionUser } | { ok: false; response: Response }
  >;
  /** Dataset por id restrito à org do viewer (findDatasetScoped em produção). */
  findDataset(
    viewer: Viewer,
    datasetId: string,
  ): Promise<LayoutDatasetRow | null>;
  /**
   * Grava parse_options, volta status para "parsing" e limpa error_message
   * numa única escrita — o worker lê a linha inteira ao pegar o job.
   */
  saveOptions(datasetId: string, options: DatasetParseOptions): Promise<void>;
  /** Reenfileira dataset:parse (enqueueDatasetParse em produção). */
  enqueueParse(datasetId: string): Promise<void>;
  /**
   * Falha ao enfileirar: marca status "error" com mensagem em pt-BR. As
   * opções ficam gravadas, então o dataset continua elegível a nova tentativa
   * (status error + parse_options preenchido).
   */
  markEnqueueFailed(datasetId: string, message: string): Promise<void>;
  /**
   * Auditoria dataset.layout_reviewed depois de gravar e enfileirar (logAudit
   * em produção — nunca lança). Recebe só a metadata resumida das escolhas.
   */
  audit(event: LayoutReviewedEvent): Promise<void>;
};

/** Metadata durável do evento dataset.layout_reviewed (sem dados do arquivo). */
export type LayoutReviewedMetadata = {
  /** O que o worker tinha sugerido (null sem diagnóstico gravado). */
  needsReview: boolean | null;
  /** Quantidade de abas escolhidas (não os nomes). */
  sheets: number;
  combined: boolean;
  headerRow: number;
  transposed: boolean;
};

export type LayoutReviewedEvent = {
  userId: string;
  orgId: string;
  datasetId: string;
  metadata: LayoutReviewedMetadata;
};

export function layoutReviewedMetadata(
  options: DatasetParseOptions,
  diagnosis: LayoutDiagnosis | null,
): LayoutReviewedMetadata {
  return {
    needsReview: diagnosis ? diagnosis.needsReview : null,
    sheets: options.sheets.length,
    combined: options.combine,
    headerRow: options.headerRow,
    transposed: options.transpose,
  };
}

/**
 * Dataset elegível: parado em needs_review; em error depois de um parse que
 * já rodou com opções do usuário (a tela de revisão deixa tentar de novo com
 * outras escolhas); ou ready com avisos de estrutura ruim do profiling
 * (`layout_diagnosis.warnings`, US-028 — o banner "Revisar planilha" reabre a
 * tela e o reparse com as opções sobrescreve o dataset). Error do parse
 * automático (sem opções) NÃO entra — esse fluxo é o de reenvio do arquivo.
 */
export function isLayoutReviewable(
  dataset: Pick<
    LayoutDatasetRow,
    "status" | "parseOptions" | "layoutDiagnosis"
  >,
): boolean {
  if (dataset.status === "needs_review") return true;
  if (dataset.status === "ready")
    return hasLayoutWarnings(dataset.layoutDiagnosis);
  return dataset.status === "error" && dataset.parseOptions !== null;
}

/**
 * Valida as escolhas contra o diagnóstico gravado. Devolve a mensagem de
 * erro (a mesma que o worker produziria) ou null quando está tudo certo.
 * Sem diagnóstico não há como validar aqui: o worker decide.
 */
export function validateAgainstDiagnosis(
  options: DatasetParseOptions,
  diagnosis: LayoutDiagnosis | null,
): string | null {
  if (!diagnosis) return null;

  const known = new Set(diagnosis.sheets.map((sheet) => sheet.name));
  // csv: o diagnóstico tem a aba única "csv" e o worker ignora `sheets`;
  // não há como o usuário escolher outra aba, então só valida planilhas
  // com abas reais (diagnóstico vazio, de json, também passa direto)
  if (known.size === 0) return null;
  for (const sheet of options.sheets) {
    if (!known.has(sheet)) return missingSheetMessage(sheet);
  }

  if (options.combine && options.sheets.length > 1) {
    const groupOf = new Map<string, number>();
    diagnosis.groups.forEach((group, index) => {
      for (const sheet of group.sheets) groupOf.set(sheet, index);
    });
    const [first, ...others] = options.sheets;
    const firstGroup = groupOf.get(first);
    for (const other of others) {
      if (groupOf.get(other) !== firstGroup) {
        return incompatibleSheetsMessage(first, other);
      }
    }
  }

  return null;
}

/** Remove abas repetidas mantendo a ordem da primeira ocorrência. */
function uniqueSheets(sheets: string[]): string[] {
  return Array.from(new Set(sheets));
}

export async function handleDatasetLayout(
  request: Request,
  params: { datasetId: string },
  deps: DatasetLayoutDeps,
): Promise<Response> {
  const auth = await deps.getApiUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  // id inválido responde igual a dataset inexistente: não revela nada
  if (!z.uuid().safeParse(params.datasetId).success) {
    return NextResponse.json(
      { error: DATASET_NOT_FOUND_MESSAGE },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: LAYOUT_INVALID_MESSAGE },
      { status: 400 },
    );
  }
  const parsed = layoutOptionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: LAYOUT_INVALID_MESSAGE },
      { status: 400 },
    );
  }
  const options: DatasetParseOptions = {
    sheets: uniqueSheets(parsed.data.sheets),
    combine: parsed.data.combine,
    headerRow: parsed.data.headerRow,
    transpose: parsed.data.transpose,
  };

  // Escopo de org injetado pelo helper; outra org = 404 (e auditado lá)
  const dataset = await deps.findDataset(
    { id: user.id, orgId: user.orgId },
    params.datasetId,
  );
  if (!dataset) {
    return NextResponse.json(
      { error: DATASET_NOT_FOUND_MESSAGE },
      { status: 404 },
    );
  }

  if (!isLayoutReviewable(dataset)) {
    return NextResponse.json(
      { error: LAYOUT_NOT_REVIEWABLE_MESSAGE },
      { status: 409 },
    );
  }

  const invalid = validateAgainstDiagnosis(options, dataset.layoutDiagnosis);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  await deps.saveOptions(dataset.id, options);

  try {
    await deps.enqueueParse(dataset.id);
  } catch (error) {
    console.error("Falha ao reenfileirar dataset:parse após revisão:", error);
    await deps.markEnqueueFailed(dataset.id, LAYOUT_ENQUEUE_FAILED_MESSAGE);
    return NextResponse.json(
      { error: LAYOUT_ENQUEUE_FAILED_MESSAGE },
      { status: 500 },
    );
  }

  // Só depois de gravar E enfileirar: o evento registra revisões que de fato
  // vão reprocessar (o Success Metric do PRD compara com dataset.upload)
  await deps.audit({
    userId: user.id,
    orgId: user.orgId,
    datasetId: dataset.id,
    metadata: layoutReviewedMetadata(options, dataset.layoutDiagnosis),
  });

  return NextResponse.json(
    { datasetId: dataset.id, status: "parsing" as const },
    { status: 202 },
  );
}

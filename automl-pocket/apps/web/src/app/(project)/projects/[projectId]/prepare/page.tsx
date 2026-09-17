import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { datasetColumns, datasetVersions } from "@/db/schema";
import { layoutReviewHref, layoutWarnings } from "@/lib/dataset-layout-form";
import { findDatasetScoped, findProjectScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

import { PreparePending } from "./prepare-pending";
import {
  PrepareView,
  type PrepareColumn,
  type PrepareVersion,
  type SampleRow,
} from "./prepare-view";
import type { VersionChip } from "./version-chips";

export const metadata = { title: "Preparar dados" };

export default async function PreparePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { user } = await requireSession();
  const db = getDb();

  // Layout pai já audita a negação deste projectId
  const project = await findProjectScoped(user, projectId, {
    auditDenied: false,
  });
  if (!project) notFound();
  if (!project.datasetId) redirect(`/projects/${project.id}`);

  // Id vem do próprio projeto (não de input do usuário) — sem auditoria
  const dataset = await findDatasetScoped(user, project.datasetId, {
    auditDenied: false,
  });
  if (!dataset) redirect(`/projects/${project.id}`);

  if (dataset.status === "error") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-6 py-24 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Não foi possível processar o dataset
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dataset.errorMessage ?? "Erro ao processar o arquivo."}
          </p>
        </div>
        <Button asChild>
          <Link href={`/projects/${project.id}/datasets`}>
            Escolher outro dataset
          </Link>
        </Button>
      </div>
    );
  }

  if (dataset.status === "needs_review") {
    // O worker pausou antes do parse (LAYOUT_REVIEW_ENABLED): quem chegou
    // aqui pelo upload cai direto na tela "Revisar planilha" (US-027), que
    // volta para este Prepare ao terminar. Não é loop: aquela página só
    // redireciona quando o dataset NÃO está mais em needs_review.
    redirect(layoutReviewHref(dataset.id, project.id));
  }

  if (dataset.status !== "ready" && dataset.status !== "profiling") {
    return <PreparePending status={dataset.status} />;
  }

  const columns = await db
    .select({
      name: datasetColumns.name,
      type: datasetColumns.type,
      stats: datasetColumns.stats,
      correlations: datasetColumns.correlations,
    })
    .from(datasetColumns)
    .where(eq(datasetColumns.datasetId, dataset.id))
    .orderBy(asc(datasetColumns.position));

  // Profiling inicial (sem colunas ainda) mostra o skeleton; re-profiling de
  // uma transformação mantém a grade visível com estado de processamento
  if (dataset.status === "profiling" && columns.length === 0) {
    return <PreparePending status={dataset.status} />;
  }

  // Cadeia linear de transformações (da mais antiga à ativa): caminha de
  // current_version_id até a original implícita via parent_version_id. O
  // último elemento é a versão ativa, usada pelo client para detectar a
  // conclusão de uma transformação (e avisar sobre convertedNulls).
  const versionChain: VersionChip[] = [];
  let currentVersion: PrepareVersion | null = null;
  if (dataset.currentVersionId) {
    const versionRows = await db
      .select({
        id: datasetVersions.id,
        parentVersionId: datasetVersions.parentVersionId,
        kind: datasetVersions.kind,
        label: datasetVersions.label,
        params: datasetVersions.params,
      })
      .from(datasetVersions)
      .where(eq(datasetVersions.datasetId, dataset.id));
    const byId = new Map(versionRows.map((version) => [version.id, version]));
    let cursor: string | null = dataset.currentVersionId;
    while (cursor) {
      const version = byId.get(cursor);
      if (!version) break;
      versionChain.unshift({
        id: version.id,
        kind: version.kind,
        label: version.label,
        params: version.params,
      });
      cursor = version.parentVersionId;
    }
    const active = versionChain[versionChain.length - 1];
    if (active) {
      const params = active.params as { convertedNulls?: unknown } | null;
      currentVersion = {
        id: active.id,
        kind: active.kind,
        convertedNulls:
          typeof params?.convertedNulls === "number"
            ? params.convertedNulls
            : null,
      };
    }
  }

  const rows = Array.isArray(dataset.sample)
    ? (dataset.sample as SampleRow[])
    : [];

  return (
    <PrepareView
      datasetId={dataset.id}
      fileName={dataset.fileName}
      rowCount={dataset.rowCount}
      columnCount={dataset.columnCount}
      columns={columns as PrepareColumn[]}
      rows={rows}
      status={dataset.status}
      currentVersion={currentVersion}
      versions={versionChain}
      lastTransformError={dataset.lastTransformError}
      updatedAt={dataset.updatedAt.toISOString()}
      layoutWarnings={layoutWarnings(dataset.layoutDiagnosis)}
      layoutReviewHref={layoutReviewHref(dataset.id, project.id)}
    />
  );
}

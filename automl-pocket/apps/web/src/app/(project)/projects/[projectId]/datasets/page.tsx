import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { getDb } from "@/db";
import { datasets } from "@/db/schema";
import { findProjectScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

import { DatasetPicker, type DatasetListItem } from "./dataset-picker";

export default async function ProjectDatasetsPage({
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

  const rows = await db
    .select({
      id: datasets.id,
      fileName: datasets.fileName,
      rowCount: datasets.rowCount,
      columnCount: datasets.columnCount,
      status: datasets.status,
      errorMessage: datasets.errorMessage,
      updatedAt: datasets.updatedAt,
    })
    .from(datasets)
    // needs_review fica fora do seletor de vínculo: o usuário precisa revisar
    // a planilha (US-027) antes de usá-la num projeto
    .where(
      and(eq(datasets.orgId, user.orgId), ne(datasets.status, "needs_review")),
    )
    .orderBy(desc(datasets.updatedAt));

  const items: DatasetListItem[] = rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
  }));

  const maxUploadMb = Number(process.env.MAX_UPLOAD_MB);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href={`/projects/${project.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar para fontes de dados
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Selecione um dataset
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Envie uma planilha nova ou reaproveite um dataset já enviado.
      </p>

      <DatasetPicker
        projectId={project.id}
        datasets={items}
        maxUploadMb={
          Number.isFinite(maxUploadMb) && maxUploadMb > 0 ? maxUploadMb : 10
        }
      />
    </div>
  );
}

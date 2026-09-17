import { and, desc, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import { datasets, projects } from "@/db/schema";
import { layoutWarnings } from "@/lib/dataset-layout-form";
import { requireSession } from "@/lib/session";

import { DatasetsView, type DatasetRowData } from "./datasets-view";

export const metadata = { title: "Datasets" };

export default async function DatasetsPage() {
  const { user } = await requireSession();
  const db = getDb();

  const [rows, linkedProjects] = await Promise.all([
    db
      .select({
        id: datasets.id,
        fileName: datasets.fileName,
        format: datasets.format,
        rowCount: datasets.rowCount,
        columnCount: datasets.columnCount,
        status: datasets.status,
        errorMessage: datasets.errorMessage,
        updatedAt: datasets.updatedAt,
        layoutDiagnosis: datasets.layoutDiagnosis,
      })
      .from(datasets)
      .where(eq(datasets.orgId, user.orgId))
      .orderBy(desc(datasets.updatedAt)),
    db
      .select({
        datasetId: projects.datasetId,
        name: projects.name,
      })
      .from(projects)
      .where(
        and(eq(projects.orgId, user.orgId), isNotNull(projects.datasetId)),
      ),
  ]);

  const projectsByDataset = new Map<string, string[]>();
  for (const project of linkedProjects) {
    if (!project.datasetId) continue;
    const list = projectsByDataset.get(project.datasetId) ?? [];
    list.push(project.name);
    projectsByDataset.set(project.datasetId, list);
  }

  const items: DatasetRowData[] = rows.map(({ layoutDiagnosis, ...row }) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
    linkedProjects: projectsByDataset.get(row.id) ?? [],
    // Só os códigos vão ao client (o diagnóstico inteiro tem o preview da planilha)
    layoutWarnings: layoutWarnings(layoutDiagnosis),
  }));

  return <DatasetsView datasets={items} />;
}

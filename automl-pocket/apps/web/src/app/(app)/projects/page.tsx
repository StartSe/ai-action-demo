import { asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { datasetColumns, datasets, models, projects } from "@/db/schema";
import { requireSession } from "@/lib/session";

import { ProjectsView, type ProjectCardData } from "./projects-view";

export const metadata = { title: "Projetos" };

const PREVIEW_COLUMNS = 4;
const PREVIEW_ROWS = 5;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function ProjectsPage() {
  const { user } = await requireSession();
  const db = getDb();

  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.orgId, user.orgId))
    .orderBy(desc(projects.updatedAt));

  const projectIds = projectRows.map((p) => p.id);
  const datasetIds = [
    ...new Set(
      projectRows
        .map((p) => p.datasetId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const [datasetRows, columnRows, modelRows] = await Promise.all([
    datasetIds.length
      ? db
          .select({ id: datasets.id, sample: datasets.sample })
          .from(datasets)
          .where(inArray(datasets.id, datasetIds))
      : Promise.resolve([]),
    datasetIds.length
      ? db
          .select({
            datasetId: datasetColumns.datasetId,
            name: datasetColumns.name,
          })
          .from(datasetColumns)
          .where(inArray(datasetColumns.datasetId, datasetIds))
          .orderBy(asc(datasetColumns.position))
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({ projectId: models.projectId })
          .from(models)
          .where(inArray(models.projectId, projectIds))
      : Promise.resolve([]),
  ]);

  const samplesByDataset = new Map(datasetRows.map((d) => [d.id, d.sample]));
  const columnsByDataset = new Map<string, string[]>();
  for (const col of columnRows) {
    const list = columnsByDataset.get(col.datasetId) ?? [];
    list.push(col.name);
    columnsByDataset.set(col.datasetId, list);
  }
  const projectsWithModel = new Set(modelRows.map((m) => m.projectId));

  const cards: ProjectCardData[] = projectRows.map((project) => {
    let preview: ProjectCardData["preview"] = null;

    if (project.datasetId) {
      const sample = samplesByDataset.get(project.datasetId);
      const sampleRows = Array.isArray(sample)
        ? (sample as Record<string, unknown>[])
        : [];
      let columns = (columnsByDataset.get(project.datasetId) ?? []).slice(
        0,
        PREVIEW_COLUMNS,
      );
      if (!columns.length && sampleRows.length) {
        columns = Object.keys(sampleRows[0]).slice(0, PREVIEW_COLUMNS);
      }
      if (columns.length) {
        preview = {
          columns,
          rows: sampleRows
            .slice(0, PREVIEW_ROWS)
            .map((row) => columns.map((col) => formatCell(row[col]))),
        };
      }
    }

    return {
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt.toISOString(),
      archived: project.archivedAt !== null,
      hasModel: projectsWithModel.has(project.id),
      preview,
    };
  });

  return <ProjectsView projects={cards} />;
}

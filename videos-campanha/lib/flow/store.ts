import { abrirBanco } from "../store";
import type { Project, Asset } from "./model";
function db() {
  const d = abrirBanco();
  d.exec(
    `CREATE TABLE IF NOT EXISTS creative_projects(id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS creative_assets(id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS creative_jobs(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, node_id TEXT NOT NULL, body TEXT NOT NULL);`,
  );
  return d;
}
export function projects(): Project[] {
  return (
    db().prepare("SELECT body FROM creative_projects").all() as {
      body: string;
    }[]
  )
    .map((r) => JSON.parse(r.body))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function project(id: string): Project | undefined {
  const r = db()
    .prepare("SELECT body FROM creative_projects WHERE id=?")
    .get(id) as { body: string } | undefined;
  return r ? JSON.parse(r.body) : undefined;
}
export function save(p: Project) {
  const old = project(p.id);
  if (old && old.revision !== p.revision)
    throw new Error(
      "Este projeto foi alterado em outra aba. Reabra para carregar a versão atual.",
    );
  p = {
    ...p,
    revision: (old?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  db()
    .prepare("INSERT OR REPLACE INTO creative_projects VALUES (?,?)")
    .run(p.id, JSON.stringify(p));
  return p;
}
export function remove(id: string) {
  db().prepare("DELETE FROM creative_projects WHERE id=?").run(id);
}
export function assets(): Asset[] {
  return (
    db()
      .prepare("SELECT body FROM creative_assets ORDER BY rowid DESC")
      .all() as { body: string }[]
  ).map((r) => JSON.parse(r.body));
}
export function addAsset(a: Asset) {
  db()
    .prepare("INSERT OR REPLACE INTO creative_assets VALUES (?,?)")
    .run(a.id, JSON.stringify(a));
  return a;
}
export type Job = {
  id: string;
  projectId: string;
  nodeId: string;
  requestId?: string;
  signature?: string;
  status: "submitting" | "pending" | "completed" | "failed" | "uncertain";
  error?: string;
  asset?: Asset;
  prompt: string;
  kind: "image" | "video";
  title: string;
  createdAt: string;
};
export function job(id: string): Job | undefined {
  const r = db()
    .prepare("SELECT body FROM creative_jobs WHERE id=?")
    .get(id) as { body: string } | undefined;
  return r ? JSON.parse(r.body) : undefined;
}
export function saveJob(j: Job) {
  db()
    .prepare("INSERT OR REPLACE INTO creative_jobs VALUES (?,?,?,?)")
    .run(j.id, j.projectId, j.nodeId, JSON.stringify(j));
  return j;
}
export function jobs(projectId: string): Job[] {
  return (
    db()
      .prepare(
        "SELECT body FROM creative_jobs WHERE project_id=? ORDER BY rowid DESC",
      )
      .all(projectId) as { body: string }[]
  ).map((r) => JSON.parse(r.body));
}

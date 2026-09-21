import { randomUUID } from "node:crypto";
import { abrirBanco } from "./store";
import { AppError } from "./api";
import {
  countNodes,
  type MindMap,
  type MindNode,
  type MapCard,
  type Job,
} from "./types";

function db() {
  const d = abrirBanco();
  d.exec(
    "CREATE TABLE IF NOT EXISTS maps (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, body TEXT NOT NULL)",
  );
  return d;
}
export function validateTree(
  value: unknown,
  validRefs?: Set<string>,
): MindNode {
  let count = 0;
  const ids = new Set<string>();
  function visit(raw: unknown, depth: number): MindNode {
    if (++count > 180 || depth > 7 || !raw || typeof raw !== "object")
      throw new AppError("O mapa excedeu o limite de 180 tópicos ou 7 níveis.");
    const node = raw as Record<string, unknown>;
    if (
      typeof node.label !== "string" ||
      !node.label.trim() ||
      node.label.length > 160 ||
      !Array.isArray(node.children)
    )
      throw new AppError(
        "A estrutura do mapa é inválida. Tente gerar novamente.",
      );
    const id =
      typeof node.id === "string" &&
      /^[\w-]{1,80}$/.test(node.id) &&
      !ids.has(node.id)
        ? node.id
        : randomUUID();
    ids.add(id);
    return {
      id,
      label: node.label.trim(),
      note: typeof node.note === "string" ? node.note.slice(0, 2400) : "",
      refs: Array.isArray(node.refs)
        ? node.refs
            .filter(
              (r): r is string =>
                typeof r === "string" &&
                r.length < 80 &&
                (!validRefs || validRefs.has(r)),
            )
            .slice(0, 8)
        : [],
      children: node.children.map((c) => visit(c, depth + 1)),
    };
  }
  return visit(value, 0);
}
export function listMaps(): MapCard[] {
  return (db().prepare("SELECT body FROM maps").all() as { body: string }[])
    .map((row) => {
      const m = JSON.parse(row.body) as MindMap;
      return {
        id: m.id,
        title: m.title,
        summary: m.summary,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        favorite: m.favorite,
        demo: m.demo,
        kind: m.source.kind,
        nodes: countNodes(m.root),
        branches: m.root.children.map((n) => n.label),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function getMap(id: string): MindMap {
  const row = db().prepare("SELECT body FROM maps WHERE id=?").get(id) as
    | { body: string }
    | undefined;
  if (!row) throw new AppError("Mapa não encontrado.", 404);
  return JSON.parse(row.body);
}
export function createMap(map: MindMap) {
  db()
    .prepare("INSERT INTO maps(id,body) VALUES (?,?)")
    .run(map.id, JSON.stringify(map));
  return map;
}
export function saveMap(id: string, patch: Partial<MindMap>, revision: number) {
  const map = getMap(id);
  if (map.revision !== revision)
    throw new AppError(
      "Este mapa foi alterado em outra aba. Recarregue antes de salvar.",
      409,
    );
  if (patch.root)
    map.root = validateTree(
      patch.root,
      new Set(map.source.segments.map((s) => s.id)),
    );
  if (typeof patch.title === "string" && patch.title.trim())
    map.title = patch.title.trim().slice(0, 160);
  if (typeof patch.favorite === "boolean") map.favorite = patch.favorite;
  if (patch.messages) map.messages = patch.messages.slice(-40);
  map.revision++;
  map.updatedAt = new Date().toISOString();
  db()
    .prepare("UPDATE maps SET body=? WHERE id=?")
    .run(JSON.stringify(map), id);
  return map;
}
export function deleteMap(id: string) {
  getMap(id);
  db().prepare("DELETE FROM maps WHERE id=?").run(id);
  return { ok: true };
}
export function saveJob(job: Job) {
  db()
    .prepare(
      "INSERT INTO jobs(id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    )
    .run(job.id, JSON.stringify(job));
  return job;
}
export function getJob(id: string): Job {
  const row = db().prepare("SELECT body FROM jobs WHERE id=?").get(id) as
    | { body: string }
    | undefined;
  if (!row) throw new AppError("Geração não encontrada.", 404);
  return JSON.parse(row.body);
}
export function recoverJobs() {
  for (const row of db().prepare("SELECT body FROM jobs").all() as {
    body: string;
  }[]) {
    const job = JSON.parse(row.body) as Job;
    if (job.status === "running")
      saveJob({
        ...job,
        status: "error",
        error:
          "O servidor reiniciou durante a geração. Envie a fonte novamente.",
        phase: "Geração interrompida",
        updatedAt: new Date().toISOString(),
      });
  }
}

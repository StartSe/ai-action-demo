import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { abrirBanco, getConfig } from "./store";
import { BrainError, string } from "./api";
import {
  DEFAULT_RULES,
  type Note,
  type Kind,
  type Message,
  type Action,
} from "./types";

let ready = false;
export function db() {
  const d = abrirBanco();
  if (!ready) {
    d.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT NOT NULL, sources TEXT NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, revision INTEGER NOT NULL, demo INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(note_id TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY(note_id,revision));
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, sources TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY, name TEXT NOT NULL, args TEXT NOT NULL, status TEXT NOT NULL, result TEXT, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, started TEXT NOT NULL);
    `);
    ready = true;
  }
  return d;
}
function decode(row: Record<string, unknown>): Note {
  return {
    ...row,
    tags: JSON.parse(String(row.tags)),
    sources: JSON.parse(String(row.sources)),
    demo: !!row.demo,
  } as Note;
}
export function notes(): Note[] {
  return (
    db()
      .prepare("SELECT * FROM notes ORDER BY updated DESC, rowid DESC")
      .all() as Record<string, unknown>[]
  ).map(decode);
}
export function note(id: string): Note {
  const r = db().prepare("SELECT * FROM notes WHERE id=?").get(id);
  if (!r) throw new BrainError("Memória não encontrada.", 404);
  return decode(r);
}
export function links(n: Note, all: Note[]) {
  const names = [...n.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map(
    (m) => m[1].toLocaleLowerCase(),
  );
  return all.filter(
    (x) =>
      x.id !== n.id &&
      (names.includes(x.title.toLocaleLowerCase()) || n.sources.includes(x.id)),
  );
}
export function markdown(n: Note) {
  const all = notes();
  return `---\nid: ${JSON.stringify(n.id)}\ntitle: ${JSON.stringify(n.title)}\naliases: ${JSON.stringify([n.title])}\ntags: ${JSON.stringify(n.tags)}\ncreated: ${n.created}\nupdated: ${n.updated}\nrevision: ${n.revision}\n---\n\n# ${n.title}\n\n${n.content}\n\n${
    n.sources.length
      ? "## Fontes\n\n" +
        n.sources
          .map((id) => {
            const s = all.find((x) => x.id === id);
            return s ? `- [[${s.title}]]` : `- ${id}`;
          })
          .join("\n")
      : ""
  }\n`;
}
export function mirror(n: Note) {
  const dir = join(
    process.env.DATA_DIR || join(process.cwd(), "data"),
    "vault",
    n.kind,
  );
  mkdirSync(dir, { recursive: true });
  const path = join(dir, n.id + ".md");
  writeFileSync(path + ".tmp", markdown(n), { mode: 0o600 });
  renameSync(path + ".tmp", path);
}
export function save(input: {
  kind: Kind;
  title: string;
  content: string;
  tags?: string[];
  sources?: string[];
  demo?: boolean;
  id?: string;
  revision?: number;
  status?: string;
}): Note {
  const old = input.id ? note(input.id) : undefined;
  if (old && input.revision !== old.revision)
    throw new BrainError(
      "Esta página mudou. Reabra para editar a versão mais recente.",
      409,
    );
  if (old && old.kind === "raw")
    throw new BrainError(
      "A fonte original é preservada. Capture uma nova versão.",
    );
  if (!["raw", "wiki", "outputs"].includes(input.kind))
    throw new BrainError("Pasta inválida.");
  const title = string(input.title, 140).replace(/[\n\r]/g, " ");
  if (
    input.kind === "wiki" &&
    notes().some(
      (n) =>
        n.kind === "wiki" &&
        n.id !== old?.id &&
        n.title.toLocaleLowerCase() === title.toLocaleLowerCase(),
    )
  )
    throw new BrainError(
      "Já existe uma página com esse título. Edite a página existente.",
      409,
    );
  const sources = Array.isArray(input.sources)
    ? [...new Set(input.sources)].filter((id) => typeof id === "string")
    : [];
  sources.forEach((id) => note(id));
  const now = new Date().toISOString();
  const n: Note = {
    id: old?.id || randomUUID(),
    kind: old?.kind || input.kind,
    title,
    content: string(input.content),
    tags: Array.isArray(input.tags)
      ? input.tags
          .filter((t) => typeof t === "string")
          .map((t) => t.slice(0, 40))
          .slice(0, 12)
      : [],
    sources,
    status:
      input.status || old?.status || (input.kind === "raw" ? "inbox" : "ready"),
    created: old?.created || now,
    updated: now,
    revision: (old?.revision || 0) + 1,
    demo: old?.demo ?? !!input.demo,
  };
  const changed = [n];
  if (old && old.title !== n.title) {
    for (const other of notes()) {
      if (other.id === n.id || other.kind === "raw") continue;
      const content = other.content
        .replaceAll(`[[${old.title}]]`, `[[${n.title}]]`)
        .replaceAll(`[[${old.title}|`, `[[${n.title}|`);
      if (content !== other.content)
        changed.push({
          ...other,
          content,
          revision: other.revision + 1,
          updated: now,
        });
    }
  }
  db().exec("BEGIN IMMEDIATE");
  try {
    for (const item of changed) {
      db()
        .prepare("INSERT OR REPLACE INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          item.id,
          item.kind,
          item.title,
          item.content,
          JSON.stringify(item.tags),
          JSON.stringify(item.sources),
          item.status,
          item.created,
          item.updated,
          item.revision,
          +item.demo,
        );
      db()
        .prepare("INSERT INTO revisions VALUES(?,?,?)")
        .run(item.id, item.revision, JSON.stringify(item));
    }
    db().exec("COMMIT");
  } catch (e) {
    db().exec("ROLLBACK");
    throw e;
  }
  // SQLite is authoritative. Exports rebuild Markdown even if a mirror was interrupted.
  try {
    for (const item of changed) mirror(item);
  } catch {
    console.error(
      "Não foi possível atualizar o espelho Markdown; conteúdo preservado no banco.",
    );
  }
  return n;
}
export function revisions(id: string) {
  note(id);
  return (
    db()
      .prepare(
        "SELECT snapshot FROM revisions WHERE note_id=? ORDER BY revision DESC",
      )
      .all(id) as { snapshot: string }[]
  ).map((r) => JSON.parse(r.snapshot) as Note);
}
export function markOrganized(id: string) {
  db()
    .prepare("UPDATE notes SET status='organized' WHERE id=? AND kind='raw'")
    .run(id);
}
export function clearDemo() {
  const all = notes();
  const keep = new Set(all.filter((n) => !n.demo).flatMap((n) => n.sources));
  let previous = -1;
  while (previous !== keep.size) {
    previous = keep.size;
    for (const n of all)
      if (keep.has(n.id)) n.sources.forEach((id) => keep.add(id));
  }
  const removed = all.filter((n) => n.demo && !keep.has(n.id));
  db().exec("BEGIN IMMEDIATE");
  try {
    for (const n of removed) {
      db().prepare("DELETE FROM revisions WHERE note_id=?").run(n.id);
      db().prepare("DELETE FROM notes WHERE id=?").run(n.id);
    }
    db().exec("COMMIT");
  } catch (e) {
    db().exec("ROLLBACK");
    throw e;
  }
  for (const n of removed) {
    try {
      unlinkSync(
        join(
          process.env.DATA_DIR || join(process.cwd(), "data"),
          "vault",
          n.kind,
          n.id + ".md",
        ),
      );
    } catch {
      /* The database remains authoritative. */
    }
  }
  return {
    removed: removed.length,
    preserved: all.filter((n) => n.demo && keep.has(n.id)).length,
  };
}
export function message(
  role: Message["role"],
  content: string,
  sources: string[] = [],
) {
  const m: Message = {
    id: randomUUID(),
    role,
    content,
    sources,
    created: new Date().toISOString(),
  };
  db()
    .prepare("INSERT INTO messages VALUES(?,?,?,?,?)")
    .run(m.id, role, content, JSON.stringify(sources), m.created);
  return m;
}
export function messages(): Message[] {
  return (
    db()
      .prepare(
        "SELECT * FROM (SELECT rowid,* FROM messages ORDER BY rowid DESC LIMIT 100) ORDER BY rowid",
      )
      .all() as Record<string, unknown>[]
  ).map((r) => ({ ...r, sources: JSON.parse(String(r.sources)) }) as Message);
}
export function actions(): Action[] {
  // Route bundles can initialize separately. Only expire stale operations, never
  // release another route's active lock or replay an external side effect.
  db()
    .prepare(
      "UPDATE actions SET status='failed',result=? WHERE status='running' AND created < ?",
    )
    .run(
      "Execução interrompida. Confira o resultado no serviço antes de repetir.",
      new Date(Date.now() - 600000).toISOString(),
    );
  return (
    db()
      .prepare("SELECT * FROM actions ORDER BY created DESC LIMIT 50")
      .all() as Record<string, unknown>[]
  ).map((r) => ({ ...r, args: JSON.parse(String(r.args)) }) as Action);
}
export function propose(name: string, args: Record<string, unknown>) {
  const a: Action = {
    id: randomUUID(),
    name,
    args,
    status: "pending",
    created: new Date().toISOString(),
  };
  db()
    .prepare("INSERT INTO actions VALUES(?,?,?,?,?,?)")
    .run(a.id, name, JSON.stringify(args), a.status, null, a.created);
  return a;
}
export function rules() {
  return getConfig("BRAIN_RULES") || DEFAULT_RULES;
}
export function state() {
  return {
    notes: notes(),
    messages: messages(),
    actions: actions(),
    rules: rules(),
  };
}
export async function exclusive<T>(
  id: string,
  fn: () => Promise<T>,
): Promise<T> {
  db()
    .prepare("DELETE FROM jobs WHERE started < ?")
    .run(new Date(Date.now() - 600000).toISOString());
  try {
    db()
      .prepare("INSERT INTO jobs VALUES(?,?)")
      .run(id, new Date().toISOString());
  } catch {
    throw new BrainError(
      "Já estou trabalhando nesse pedido. Aguarde a conclusão.",
      409,
    );
  }
  try {
    return await fn();
  } finally {
    db().prepare("DELETE FROM jobs WHERE id=?").run(id);
  }
}
export function retrieve(query: string, all = notes(), limit = 12): Note[] {
  const terms =
    query
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .match(/[\p{L}\p{N}]{3,}/gu) || [];
  const rank = all
    .map((n) => {
      const text = (n.title + " " + n.tags.join(" ") + " " + n.content)
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "");
      return {
        n,
        score: terms.reduce(
          (s, t) =>
            s +
            (text.includes(t) ? 1 : 0) +
            (n.title.toLocaleLowerCase().includes(t) ? 3 : 0),
          0,
        ),
      };
    })
    .sort((a, b) => b.score - a.score);
  return rank.slice(0, limit).map((x) => x.n);
}

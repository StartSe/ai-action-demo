import { randomUUID } from "node:crypto";
import { db, note } from "./brain";
import { BrainError, string } from "./api";
import { connected } from "./motor";
import { captureAccess, type CaptureAccess } from "./capture-permissions";
import { recurrence, nextOccurrence } from "./recurrence";
import type {
  CaptureTask,
  CaptureSchedule,
  CaptureState,
  CaptureQuery,
  CapturePagination,
  Recurrence,
} from "./capture-types";

export type StoredTask = Omit<CaptureTask, "sources" | "pages" | "steps"> & {
  access: string;
  owner: string | null;
  leaseUntil: string | null;
};
export type CaptureStep = {
  taskId: string;
  key: string;
  name: string;
  args: string;
  content: string;
  sourceId: string | null;
  pageId: string | null;
  created: string;
};
let ready = false;
export function captureDb() {
  const d = db();
  if (!ready) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS capture_tasks (
        id TEXT PRIMARY KEY, instruction TEXT NOT NULL, status TEXT NOT NULL,
        phase TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
        created TEXT NOT NULL, updated TEXT NOT NULL, finished TEXT,
        scheduleId TEXT, parentId TEXT, attempts INTEGER NOT NULL DEFAULT 0,
        access TEXT NOT NULL, owner TEXT, leaseUntil TEXT
      );
      CREATE INDEX IF NOT EXISTS capture_queue ON capture_tasks(status,created);
      CREATE TABLE IF NOT EXISTS capture_steps (
        taskId TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL, args TEXT NOT NULL,
        content TEXT NOT NULL, sourceId TEXT, pageId TEXT, created TEXT NOT NULL,
        PRIMARY KEY(taskId,key)
      );
      CREATE TABLE IF NOT EXISTS capture_schedules (
        id TEXT PRIMARY KEY, instruction TEXT NOT NULL, recurrence TEXT NOT NULL, access TEXT NOT NULL,
        enabled INTEGER NOT NULL, nextRun TEXT NOT NULL, lastRun TEXT, created TEXT NOT NULL
      );
    `);
    ready = true;
  }
  return d;
}
export function storedTask(id: string): StoredTask {
  const task = captureDb()
    .prepare("SELECT * FROM capture_tasks WHERE id=?")
    .get(id);
  if (!task) throw new BrainError("Coleta não encontrada.", 404);
  return task as unknown as StoredTask;
}
export function taskSteps(id: string): CaptureStep[] {
  return captureDb()
    .prepare("SELECT * FROM capture_steps WHERE taskId=? ORDER BY rowid")
    .all(id) as unknown as CaptureStep[];
}
export function captureTask(id: string): CaptureTask {
  const t = storedTask(id);
  const steps = taskSteps(id);
  return {
    id: t.id,
    instruction: t.instruction,
    status: t.status,
    phase: t.phase,
    summary: t.summary,
    error: t.error,
    created: t.created,
    updated: t.updated,
    finished: t.finished,
    scheduleId: t.scheduleId,
    parentId: t.parentId,
    attempts: t.attempts,
    sources: steps.flatMap((s) => (s.sourceId ? [s.sourceId] : [])),
    pages: [...new Set(steps.flatMap((s) => (s.pageId ? [s.pageId] : [])))],
    steps: steps.map((s) => ({
      name: s.name,
      created: s.created,
      sourceId: s.sourceId,
      pageId: s.pageId,
    })),
  };
}
function scheduleFromRow(s: Record<string, unknown>): CaptureSchedule {
  return {
    id: String(s.id),
    instruction: String(s.instruction),
    recurrence: JSON.parse(String(s.recurrence)),
    enabled: !!s.enabled,
    nextRun: String(s.nextRun),
    lastRun: s.lastRun ? String(s.lastRun) : null,
    created: String(s.created),
  };
}
export function captureSchedule(id: string): CaptureSchedule {
  const s = captureDb()
    .prepare("SELECT * FROM capture_schedules WHERE id=?")
    .get(id);
  if (!s) throw new BrainError("Agendamento não encontrado.", 404);
  return scheduleFromRow(s);
}
function pagination(page: number, total: number): CapturePagination {
  if (!Number.isSafeInteger(page) || page < 1)
    throw new BrainError("Escolha uma página válida.");
  const pages = Math.max(1, Math.ceil(total / 10));
  return { page: Math.min(page, pages), pageSize: 10, total, pages };
}
export function captureState(query: Partial<CaptureQuery> = {}): CaptureState {
  const filter = query.filter ?? "all";
  if (!["all", "active", "done", "failed", "cancelled"].includes(filter))
    throw new BrainError("Escolha um filtro de coletas válido.");
  const d = captureDb();
  const where =
    filter === "all"
      ? ""
      : filter === "active"
        ? "WHERE status IN ('queued','running')"
        : "WHERE status=?";
  const args = filter === "all" || filter === "active" ? [] : [filter];
  const tasks = pagination(
    query.taskPage ?? 1,
    Number(
      d.prepare(`SELECT count(*) AS n FROM capture_tasks ${where}`).get(...args)
        ?.n,
    ),
  );
  const schedules = pagination(
    query.schedulePage ?? 1,
    Number(d.prepare("SELECT count(*) AS n FROM capture_schedules").get()?.n),
  );
  return {
    tasks: (
      captureDb()
        .prepare(
          `SELECT id FROM capture_tasks ${where} ORDER BY created DESC,rowid DESC LIMIT ? OFFSET ?`,
        )
        .all(...args, tasks.pageSize, (tasks.page - 1) * tasks.pageSize) as {
        id: string;
      }[]
    ).map((t) => captureTask(t.id)),
    schedules: (
      captureDb()
        .prepare(
          "SELECT * FROM capture_schedules ORDER BY created DESC,rowid DESC LIMIT ? OFFSET ?",
        )
        .all(
          schedules.pageSize,
          (schedules.page - 1) * schedules.pageSize,
        ) as Record<string, unknown>[]
    ).map(scheduleFromRow),
    pagination: { tasks, schedules },
    filter,
    activeCount: Number(
      d
        .prepare(
          "SELECT count(*) AS n FROM capture_tasks WHERE status IN ('queued','running')",
        )
        .get()?.n,
    ),
    recentInstructions: (
      d
        .prepare(
          "SELECT instruction FROM capture_tasks GROUP BY instruction ORDER BY MAX(created) DESC, MAX(rowid) DESC LIMIT 5",
        )
        .all() as { instruction: string }[]
    ).map((t) => t.instruction),
  };
}
export async function collectionAccess() {
  if (!(await connected()))
    throw new BrainError(
      "Conecte ChatGPT ou OpenRouter em Conexões antes de iniciar.",
    );
  return captureAccess();
}
export function enqueueCapture(
  instruction: string,
  access: CaptureAccess,
  options: { parentId?: string; scheduleId?: string; now?: Date } = {},
) {
  const d = captureDb();
  const count = d
    .prepare(
      "SELECT count(*) AS n FROM capture_tasks WHERE status IN ('queued','running')",
    )
    .get() as { n: number };
  if (count.n >= 100)
    throw new BrainError(
      "Há muitas coletas na fila. Aguarde ou cancele algumas.",
      409,
    );
  const id = randomUUID(),
    now = (options.now || new Date()).toISOString();
  d.prepare(
    "INSERT INTO capture_tasks(id,instruction,status,phase,created,updated,scheduleId,parentId,access) VALUES(?,?,'queued','Na fila',?,?,?,?,?)",
  ).run(
    id,
    string(instruction, 6000),
    now,
    now,
    options.scheduleId || null,
    options.parentId || null,
    JSON.stringify(access),
  );
  return captureTask(id);
}
export function cancelCapture(id: string) {
  storedTask(id);
  const now = new Date().toISOString();
  const result = captureDb()
    .prepare(
      "UPDATE capture_tasks SET status='cancelled',phase='Cancelada',updated=?,finished=?,owner=NULL,leaseUntil=NULL WHERE id=? AND status IN ('queued','running')",
    )
    .run(now, now, id);
  if (!result.changes) throw new BrainError("Essa coleta já terminou.", 409);
  return captureTask(id);
}
export function retryCapture(id: string) {
  storedTask(id);
  const result = captureDb()
    .prepare(
      "UPDATE capture_tasks SET status='queued',phase='Aguardando retomada',error='',finished=NULL,updated=?,owner=NULL,leaseUntil=NULL,attempts=0 WHERE id=? AND status='failed'",
    )
    .run(new Date().toISOString(), id);
  if (!result.changes)
    throw new BrainError("Só é possível retomar uma coleta que falhou.", 409);
  return captureTask(id);
}
export function saveSchedule(
  instruction: string,
  input: unknown,
  access: CaptureAccess,
  id?: string,
  now = new Date(),
): CaptureSchedule {
  const r = recurrence(input),
    d = captureDb(),
    next = nextOccurrence(r, now);
  const current = id
    ? d.prepare("SELECT id FROM capture_schedules WHERE id=?").get(id)
    : null;
  if (id && !current) throw new BrainError("Agendamento não encontrado.", 404);
  if (
    !id &&
    Number(d.prepare("SELECT count(*) AS n FROM capture_schedules").get()?.n) >=
      50
  )
    throw new BrainError("Limite de 50 agendamentos atingido.");
  const key = id || randomUUID();
  d.prepare(
    `INSERT INTO capture_schedules(id,instruction,recurrence,access,enabled,nextRun,created) VALUES(?,?,?,?,1,?,?)
    ON CONFLICT(id) DO UPDATE SET instruction=excluded.instruction,recurrence=excluded.recurrence,access=excluded.access,enabled=1,nextRun=excluded.nextRun`,
  ).run(
    key,
    string(instruction, 6000),
    JSON.stringify(r),
    JSON.stringify(access),
    next,
    now.toISOString(),
  );
  return captureSchedule(key);
}
export function pauseSchedule(id: string) {
  if (
    !captureDb()
      .prepare("UPDATE capture_schedules SET enabled=0 WHERE id=?")
      .run(id).changes
  )
    throw new BrainError("Agendamento não encontrado.", 404);
}
export function deleteSchedule(id: string) {
  // History and an already-running collection remain available.
  if (
    !captureDb().prepare("DELETE FROM capture_schedules WHERE id=?").run(id)
      .changes
  )
    throw new BrainError("Agendamento não encontrado.", 404);
}
export function queueDueSchedules(now = new Date()) {
  const d = captureDb(),
    iso = now.toISOString();
  d.exec("BEGIN IMMEDIATE");
  try {
    const due = d
      .prepare(
        "SELECT * FROM capture_schedules WHERE enabled=1 AND nextRun<=? ORDER BY nextRun",
      )
      .all(iso);
    for (const s of due) {
      // Collapse missed occurrences to one; never overlap runs of a schedule.
      const active = d
        .prepare(
          "SELECT id FROM capture_tasks WHERE scheduleId=? AND status IN ('queued','running')",
        )
        .get(s.id);
      // A full queue must not prevent the worker from claiming existing work.
      // Keep this occurrence due until capacity becomes available.
      const pending = d
        .prepare(
          "SELECT count(*) AS n FROM capture_tasks WHERE status IN ('queued','running')",
        )
        .get() as { n: number };
      if (!active && pending.n >= 100) break;
      if (!active)
        enqueueCapture(String(s.instruction), JSON.parse(String(s.access)), {
          scheduleId: String(s.id),
          now,
        });
      d.prepare(
        "UPDATE capture_schedules SET nextRun=?,lastRun=? WHERE id=?",
      ).run(
        nextOccurrence(JSON.parse(String(s.recurrence)) as Recurrence, now),
        active ? s.lastRun : iso,
        s.id,
      );
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
export const LEASE_MS = 90000;
export function claimCapture(
  owner: string,
  now = new Date(),
): StoredTask | null {
  const d = captureDb(),
    iso = now.toISOString();
  d.exec("BEGIN IMMEDIATE");
  try {
    d.prepare(
      "UPDATE capture_tasks SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,phase='Execução interrompida',error=CASE WHEN attempts<3 THEN '' ELSE 'A coleta foi interrompida repetidamente. Retome quando a conexão estiver estável.' END,updated=?,owner=NULL,leaseUntil=NULL WHERE status='running' AND leaseUntil<=?",
    ).run(iso, iso);
    const active = d
      .prepare("SELECT id FROM capture_tasks WHERE status='running'")
      .get();
    const next =
      !active &&
      d
        .prepare(
          "SELECT id FROM capture_tasks WHERE status='queued' ORDER BY created,rowid LIMIT 1",
        )
        .get();
    if (next)
      d.prepare(
        "UPDATE capture_tasks SET status='running',phase='Preparando coleta',attempts=attempts+1,owner=?,leaseUntil=?,updated=? WHERE id=?",
      ).run(
        owner,
        new Date(now.getTime() + LEASE_MS).toISOString(),
        iso,
        next.id,
      );
    d.exec("COMMIT");
    return next ? storedTask(String(next.id)) : null;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
export function assertLease(id: string, owner: string) {
  const t = storedTask(id);
  if (
    t.status !== "running" ||
    t.owner !== owner ||
    !t.leaseUntil ||
    t.leaseUntil <= new Date().toISOString()
  )
    throw new BrainError(
      "A coleta foi cancelada ou retomada por outra execução.",
      409,
    );
}
export function heartbeat(id: string, owner: string) {
  return !!captureDb()
    .prepare(
      "UPDATE capture_tasks SET leaseUntil=?,updated=? WHERE id=? AND owner=? AND status='running' AND leaseUntil>?",
    )
    .run(
      new Date(Date.now() + LEASE_MS).toISOString(),
      new Date().toISOString(),
      id,
      owner,
      new Date().toISOString(),
    ).changes;
}
export function capturePhase(id: string, owner: string, phase: string) {
  assertLease(id, owner);
  captureDb()
    .prepare(
      "UPDATE capture_tasks SET phase=?,updated=? WHERE id=? AND owner=?",
    )
    .run(phase, new Date().toISOString(), id, owner);
}
export function finishCapture(
  id: string,
  owner: string,
  status: "done" | "failed",
  text: string,
) {
  const now = new Date().toISOString();
  captureDb()
    .prepare(
      "UPDATE capture_tasks SET status=?,phase=?,summary=?,error=?,updated=?,finished=?,owner=NULL,leaseUntil=NULL WHERE id=? AND owner=? AND status='running'",
    )
    .run(
      status,
      status === "done" ? "Organizada na wiki" : "Precisa de atenção",
      status === "done" ? text : "",
      status === "failed" ? text : "",
      now,
      now,
      id,
      owner,
    );
}
export function existingStep(id: string, key: string) {
  return captureDb()
    .prepare("SELECT * FROM capture_steps WHERE taskId=? AND key=?")
    .get(id, key) as unknown as CaptureStep | undefined;
}
export function stepContent(step: CaptureStep) {
  return step.sourceId ? note(step.sourceId).content : step.content;
}

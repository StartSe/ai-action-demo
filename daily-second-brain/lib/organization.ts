import { randomUUID } from "node:crypto";
import { BrainError } from "./api";
import { note } from "./brain";
import { captureDb, LEASE_MS } from "./captures";
import { organize } from "./agent";
import { diagnosticText } from "./diagnostics";
import type { OrganizationJob } from "./types";

type StoredJob = Omit<OrganizationJob, "dismissed"> & {
  owner: string | null;
  leaseUntil: string | null;
  dismissed: number;
};
export function processingState(): Record<string, OrganizationJob> {
  const rows = captureDb()
    .prepare(
      `SELECT j.sourceId,j.id,j.status,j.phase,j.error,j.pageId,j.created,j.updated,j.attempts,j.dismissed FROM organization_jobs j
    JOIN notes n ON n.id=j.sourceId ORDER BY j.created,j.rowid`,
    )
    .all() as unknown as StoredJob[];
  return Object.fromEntries(
    rows.map((job) => [job.sourceId, { ...job, dismissed: !!job.dismissed }]),
  );
}
export function enqueueOrganization(input: unknown) {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > 100 ||
    input.some((id) => typeof id !== "string" || !id || id.length > 100)
  )
    throw new BrainError("Selecione de 1 a 100 fontes por vez.");
  const ids = [...new Set(input)] as string[];
  const d = captureDb();
  let queued = 0,
    alreadyProcessing = 0,
    alreadyOrganized = 0;
  const now = new Date().toISOString();
  d.exec("BEGIN IMMEDIATE");
  try {
    for (const sourceId of ids) {
      const source = note(sourceId);
      if (source.kind !== "raw")
        throw new BrainError("Escolha fontes da Caixa de entrada.");
      if (source.status === "organized") {
        alreadyOrganized++;
        continue;
      }
      const active = d
        .prepare(
          `SELECT id FROM organization_jobs WHERE sourceId=? AND status IN ('queued','running')`,
        )
        .get(sourceId);
      const capture = d
        .prepare(
          `SELECT t.id FROM capture_tasks t JOIN capture_steps s ON s.taskId=t.id
        WHERE s.sourceId=? AND t.status IN ('queued','running')`,
        )
        .get(sourceId);
      if (active || capture) {
        alreadyProcessing++;
        continue;
      }
      d.prepare(
        `INSERT INTO organization_jobs(sourceId,id,status,phase,created,updated)
        VALUES(?,?,'queued','Aguardando a vez',?,?)
        ON CONFLICT(sourceId) DO UPDATE SET id=excluded.id,status='queued',phase=excluded.phase,
        error='',pageId=NULL,created=excluded.created,updated=excluded.updated,attempts=0,owner=NULL,leaseUntil=NULL,dismissed=0`,
      ).run(sourceId, randomUUID(), now, now);
      queued++;
    }
    const count = d
      .prepare(
        "SELECT count(*) AS n FROM organization_jobs WHERE status IN ('queued','running')",
      )
      .get()!;
    if (Number(count.n) > 100)
      throw new BrainError(
        "A fila está cheia. Aguarde algumas fontes terminarem antes de adicionar mais.",
      );
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return {
    queued,
    alreadyProcessing,
    alreadyOrganized,
    sourceProcessing: processingState(),
  };
}
export function dismissProcessing() {
  captureDb()
    .prepare("UPDATE organization_jobs SET dismissed=1 WHERE status='done'")
    .run();
  return processingState();
}
export function claimOrganization(
  owner: string,
  now = new Date(),
): StoredJob | null {
  const d = captureDb(),
    iso = now.toISOString();
  d.exec("BEGIN IMMEDIATE");
  try {
    d.prepare(
      `DELETE FROM organization_jobs WHERE sourceId NOT IN (SELECT id FROM notes)`,
    ).run();
    d.prepare(
      `UPDATE organization_jobs SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,
      phase=CASE WHEN attempts<3 THEN 'Retomando após interrupção' ELSE 'Precisa de atenção' END,
      error=CASE WHEN attempts<3 THEN '' ELSE 'O processamento foi interrompido repetidamente. Tente novamente.' END,
      updated=?,owner=NULL,leaseUntil=NULL WHERE status='running' AND leaseUntil<=?`,
    ).run(iso, iso);
    const active = d
      .prepare(
        `SELECT id FROM organization_jobs WHERE status='running'
      UNION ALL SELECT id FROM capture_tasks WHERE status='running' AND leaseUntil>? LIMIT 1`,
      )
      .get(iso);
    const next =
      !active &&
      d
        .prepare(
          `SELECT sourceId FROM organization_jobs WHERE status='queued' ORDER BY created,rowid LIMIT 1`,
        )
        .get();
    if (next)
      d.prepare(
        `UPDATE organization_jobs SET status='running',phase='Lendo a fonte e suas conexões',
      attempts=attempts+1,owner=?,leaseUntil=?,updated=? WHERE sourceId=?`,
      ).run(
        owner,
        new Date(now.getTime() + LEASE_MS).toISOString(),
        iso,
        next.sourceId,
      );
    const job = next
      ? d
          .prepare("SELECT * FROM organization_jobs WHERE sourceId=?")
          .get(next.sourceId)
      : null;
    d.exec("COMMIT");
    return job as StoredJob | null;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
function assertOwner(job: StoredJob, owner: string) {
  const current = captureDb()
    .prepare(
      `SELECT id FROM organization_jobs WHERE id=? AND owner=?
    AND status='running' AND leaseUntil>?`,
    )
    .get(job.id, owner, new Date().toISOString());
  if (!current)
    throw new BrainError("Este processamento foi interrompido.", 409);
}
export async function runOrganization(job: StoredJob, owner: string) {
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(8 * 60000),
  ]);
  const timer = setInterval(() => {
    try {
      assertOwner(job, owner);
      captureDb()
        .prepare(
          "UPDATE organization_jobs SET leaseUntil=? WHERE id=? AND owner=?",
        )
        .run(new Date(Date.now() + LEASE_MS).toISOString(), job.id, owner);
    } catch {
      controller.abort();
    }
  }, 15000);
  timer.unref();
  try {
    assertOwner(job, owner);
    await organize(job.sourceId, signal, {
      onPhase: (phase) => {
        assertOwner(job, owner);
        captureDb()
          .prepare(
            "UPDATE organization_jobs SET phase=?,updated=? WHERE id=? AND owner=?",
          )
          .run(phase, new Date().toISOString(), job.id, owner);
      },
      onSaved: (page) => {
        // This runs inside the same transaction as the wiki page and source status.
        assertOwner(job, owner);
        captureDb()
          .prepare(
            `UPDATE organization_jobs SET status='done',phase='Organizada na wiki',pageId=?,
          error='',updated=?,owner=NULL,leaseUntil=NULL WHERE id=? AND owner=?`,
          )
          .run(page.id, new Date().toISOString(), job.id, owner);
      },
    });
  } catch (e) {
    const error = signal.aborted
      ? "O processamento foi interrompido ou excedeu o tempo. Sua fonte está preservada; tente novamente."
      : diagnosticText(
          e instanceof Error ? e : "Não foi possível organizar esta fonte.",
        );
    captureDb()
      .prepare(
        `UPDATE organization_jobs SET status='failed',phase='Precisa de atenção',error=?,
      updated=?,owner=NULL,leaseUntil=NULL WHERE id=? AND owner=? AND status='running'`,
      )
      .run(error, new Date().toISOString(), job.id, owner);
  } finally {
    clearInterval(timer);
  }
}

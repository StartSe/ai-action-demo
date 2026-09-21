import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { notes, links } from "./brain";
import { captureDb, storedTask, taskSteps } from "./captures";
import { BrainError } from "./api";
import type { Note } from "./types";

export type RemovalSelection = { sourceIds?: string[]; taskIds?: string[] };
export type RemovalPlan = {
  sourceIds: string[];
  taskIds: string[];
  preserved: number;
  running: number;
  token: string;
};
function ids(input: unknown): string[] {
  if (input === undefined) return [];
  if (
    !Array.isArray(input) ||
    input.length > 100 ||
    input.some((id) => typeof id !== "string" || !id || id.length > 100)
  )
    throw new BrainError("Selecione até 100 itens por vez.");
  return [...new Set(input)];
}
export function removalPlan(input: RemovalSelection): RemovalPlan {
  const sourceIds = new Set(ids(input.sourceIds));
  const explicit = new Set(sourceIds);
  const taskIds = new Set(ids(input.taskIds));
  if (!sourceIds.size && !taskIds.size)
    throw new BrainError("Selecione um item para excluir.");
  const d = captureDb();
  const all = notes();
  const versions = [
    ...all,
    ...d
      .prepare("SELECT snapshot FROM revisions")
      .all()
      .map((row) => JSON.parse(String(row.snapshot)) as Note),
  ];
  // Follow the full source chain of organized knowledge, including restorable versions.
  const referenced = new Set(
    versions
      .filter((n) => n.kind !== "raw" || n.status !== "inbox")
      .map((n) => n.id),
  );
  let protectedSize = -1;
  while (protectedSize !== referenced.size) {
    protectedSize = referenced.size;
    for (const n of versions)
      if (referenced.has(n.id)) {
        for (const linked of links(n, all)) referenced.add(linked.id);
      }
  }
  // Selecting a source also removes the interrupted collection that owns it.
  // Otherwise a retry could silently recreate the deleted content.
  for (const id of sourceIds) {
    if (!all.some((n) => n.id === id && n.kind === "raw"))
      throw new BrainError("Fonte não encontrada.", 404);
  }
  let size = -1;
  while (size !== sourceIds.size + taskIds.size) {
    size = sourceIds.size + taskIds.size;
    // Pending sources that depend on a removed source belong to the same cascade.
    for (const n of all) {
      if (
        n.kind === "raw" &&
        n.status === "inbox" &&
        !referenced.has(n.id) &&
        links(n, all).some(
          (linked) => sourceIds.has(linked.id) && !referenced.has(linked.id),
        )
      )
        sourceIds.add(n.id);
    }
    for (const id of sourceIds) {
      if (referenced.has(id)) continue;
      for (const row of d
        .prepare("SELECT taskId FROM capture_steps WHERE sourceId=?")
        .all(id))
        taskIds.add(String(row.taskId));
    }
    for (const id of taskIds) {
      const task = storedTask(id);
      if (task.status === "done")
        throw new BrainError(
          "Coletas concluídas e suas fontes devem permanecer na memória.",
          409,
        );
      for (const step of taskSteps(id))
        if (step.sourceId) sourceIds.add(step.sourceId);
    }
  }
  let preserved = 0;
  for (const id of sourceIds) {
    const n = all.find((n) => n.id === id);
    if (!n) {
      sourceIds.delete(id);
      continue;
    }
    if (n.kind !== "raw" || n.status !== "inbox" || referenced.has(id)) {
      if (explicit.has(id))
        throw new BrainError(
          "Esta fonte já está em uso na memória e não pode ser excluída.",
          409,
        );
      sourceIds.delete(id);
      preserved++;
    }
  }
  const plan = {
    sourceIds: [...sourceIds].sort(),
    taskIds: [...taskIds].sort(),
    preserved,
    running: [...taskIds].filter((id) =>
      ["queued", "running"].includes(storedTask(id).status),
    ).length,
  };
  return {
    ...plan,
    token: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
  };
}
export function removeItems(input: RemovalSelection, token: string) {
  const d = captureDb();
  d.exec("BEGIN IMMEDIATE");
  let plan: RemovalPlan;
  try {
    plan = removalPlan(input);
    if (plan.token !== token)
      throw new BrainError(
        "Os itens mudaram. Feche e revise a exclusão novamente.",
        409,
      );
    for (const id of plan.taskIds) {
      d.prepare("DELETE FROM capture_events WHERE taskId=?").run(id);
      d.prepare("DELETE FROM capture_steps WHERE taskId=?").run(id);
      d.prepare("UPDATE capture_tasks SET parentId=NULL WHERE parentId=?").run(
        id,
      );
      d.prepare("DELETE FROM capture_tasks WHERE id=?").run(id);
    }
    for (const id of plan.sourceIds) {
      d.prepare("DELETE FROM revisions WHERE note_id=?").run(id);
      d.prepare("DELETE FROM notes WHERE id=?").run(id);
      d.prepare("DELETE FROM jobs WHERE id=?").run(`organize:${id}`);
    }
    for (const row of d.prepare("SELECT id,sources FROM messages").all()) {
      const before = JSON.parse(String(row.sources)) as string[];
      const after = before.filter((id) => !plan.sourceIds.includes(id));
      if (after.length !== before.length)
        d.prepare("UPDATE messages SET sources=? WHERE id=?").run(
          JSON.stringify(after),
          row.id,
        );
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  for (const id of plan.sourceIds) {
    for (const suffix of [".md", ".md.tmp"]) {
      try {
        rmSync(
          join(
            process.env.DATA_DIR || join(process.cwd(), "data"),
            "vault",
            "raw",
            id + suffix,
          ),
          { force: true },
        );
      } catch {
        console.error(
          "Não foi possível remover um espelho Markdown da fonte excluída.",
        );
      }
    }
  }
  return {
    sources: plan.sourceIds.length,
    tasks: plan.taskIds.length,
    preserved: plan.preserved,
  };
}

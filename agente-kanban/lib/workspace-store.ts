import { randomUUID } from "node:crypto";
import { abrirBanco } from "./store";
import type {
  Feedback,
  Routine,
  Run,
  RunStep,
  Skill,
  Task,
} from "./workspace-types";
import {
  routineInput,
  skillInput,
  taskInput,
  WorkspaceError,
  type Blueprint,
} from "./workspace-schema";

let ready = false;
export function database() {
  const db = abrirBanco();
  if (!ready) {
    db.exec(`PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS orbit_documents (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS orbit_runs (id TEXT PRIMARY KEY, routine TEXT NOT NULL, slot TEXT NOT NULL, status TEXT NOT NULL, value TEXT NOT NULL, UNIQUE(routine,slot));
      CREATE UNIQUE INDEX IF NOT EXISTS orbit_one_running ON orbit_runs(routine) WHERE status = 'running';
      CREATE TABLE IF NOT EXISTS orbit_questions (task TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(task,day));`);
    ready = true;
  }
  return db;
}
export function transaction<T>(fn: () => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function getDoc<T>(kind: string, id: string): T | null {
  const row = database()
    .prepare("SELECT value FROM orbit_documents WHERE kind=? AND id=?")
    .get(kind, id) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}
export function docs<T>(kind: string): T[] {
  return (
    database()
      .prepare(
        "SELECT value FROM orbit_documents WHERE kind=? ORDER BY rowid DESC",
      )
      .all(kind) as { value: string }[]
  ).map((r) => JSON.parse(r.value) as T);
}
export function putDoc(kind: string, id: string, value: unknown) {
  database()
    .prepare(
      "INSERT INTO orbit_documents VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
    )
    .run(kind, id, JSON.stringify(value));
}
export function removeDoc(kind: string, id: string) {
  database()
    .prepare("DELETE FROM orbit_documents WHERE kind=? AND id=?")
    .run(kind, id);
}

export function initializeWorkspace() {
  if (getDoc("settings", "initialized")) return;
  transaction(() => {
    if (getDoc("settings", "initialized")) return;
    const now = new Date();
    const day = (offset: number) =>
      new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
    putDoc("settings", "initialized", true);
    putDoc("settings", "example", true);
    putDoc("skill", "team", {
      name: "Ritmo do time de Produto",
      process:
        "Toda segunda, às 9h, fazemos a weekly. Nos dias úteis, às 17h, acompanhamos as atualizações no Slack #time-produto e no board de gestão.",
      instructions:
        "Cruze as atualizações do board com as conversas do time. Mantenha responsáveis, prazos e status atualizados apenas quando houver evidências. Preserve correções manuais. Pergunte sobre prazos somente quando houver atraso ou uma data estiver faltando. Não repita perguntas no mesmo dia. Relacione cada atividade ao objetivo do ciclo.",
      objective:
        "Simplificar a ativação e entregar uma experiência de onboarding mais fluida.",
      cycle: "Ciclo de produto",
      cycleStart: day(-4),
      cycleEnd: day(10),
      version: 1,
    } satisfies Skill);
    const examples: [
      string,
      Task["status"],
      Task["priority"],
      string,
      number,
      string,
      string,
    ][] = [
      [
        "Mapear pontos de fricção no onboarding",
        "todo",
        "high",
        "Marina Costa",
        2,
        "Discovery",
        "Trello",
      ],
      [
        "Definir métricas de ativação",
        "todo",
        "medium",
        "Rafael Lima",
        3,
        "Analytics",
        "Weekly",
      ],
      [
        "Planejar entrevistas com novos clientes",
        "todo",
        "low",
        "Julia Santos",
        5,
        "Discovery",
        "Slack",
      ],
      [
        "Redesenhar o fluxo de boas-vindas",
        "doing",
        "high",
        "Julia Santos",
        1,
        "Design",
        "Trello",
      ],
      [
        "Implementar checklist de primeiros passos",
        "doing",
        "high",
        "Pedro Alves",
        -1,
        "Produto",
        "Slack",
      ],
      [
        "Instrumentar eventos do novo funil",
        "doing",
        "medium",
        "Rafael Lima",
        4,
        "Analytics",
        "Trello",
      ],
      [
        "Consolidar aprendizados das entrevistas",
        "done",
        "medium",
        "Marina Costa",
        -2,
        "Discovery",
        "Weekly",
      ],
      [
        "Validar protótipo com o time",
        "done",
        "low",
        "Julia Santos",
        -1,
        "Design",
        "Slack",
      ],
      [
        "Documentar o fluxo atual de cadastro",
        "archived",
        "low",
        "Pedro Alves",
        -5,
        "Produto",
        "Trello",
      ],
    ];
    for (const [
      title,
      status,
      priority,
      assignee,
      offset,
      project,
      source,
    ] of examples) {
      const id = randomUUID();
      putDoc("task", id, {
        id,
        title,
        status,
        priority,
        assignee,
        contact: "",
        due: day(offset),
        project,
        source,
        sourceId: "",
        description: `Atividade de exemplo para explorar o acompanhamento de ${project.toLowerCase()}. Edite os detalhes e veja como a correção alimenta o contexto do agente.`,
        evidence:
          "Dados ilustrativos. Nenhuma ferramenta externa foi consultada.",
        actor: "example",
        updatedAt: now.toISOString(),
        revision: 1,
      } satisfies Task);
    }
    for (const [name, prompt, frequency, time] of [
      [
        "Preparar a weekly",
        "Leia o board de gestão, cruze as entregas com o objetivo do ciclo e prepare um resumo para a weekly. Identifique bloqueios e próximos passos.",
        "weekly",
        "09:00",
      ],
      [
        "Acompanhar as conversas do time",
        "Leia as atualizações do canal #time-produto no Slack e confronte com o board. Atualize os cartões com evidências e destaque divergências de prazo.",
        "weekdays",
        "17:00",
      ],
      [
        "Cuidar dos prazos",
        "Revise atividades em aberto. Consulte as fontes antes de perguntar. Quando faltar uma data ou houver atraso, envie uma única pergunta objetiva ao responsável, sem repetir no mesmo dia.",
        "weekdays",
        "10:00",
      ],
    ] as const) {
      const id = randomUUID();
      putDoc("routine", id, {
        id,
        name,
        prompt,
        frequency,
        time,
        weekday: 1,
        timezone: "America/Sao_Paulo",
        tools: [],
        enabled: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        revision: 1,
      } satisfies Routine);
    }
  });
}
export function getSkill(): Skill {
  initializeWorkspace();
  return getDoc<Skill>("skill", "team")!;
}
export function saveSkill(input: unknown, version: number) {
  const data = skillInput.parse(input);
  return transaction(() => {
    const current = getSkill();
    if (current.version !== version)
      throw new WorkspaceError(
        "A skill mudou. Atualize a página antes de salvar.",
        409,
      );
    putDoc("skill-version", String(current.version), current);
    const result = { ...data, version: current.version + 1 };
    putDoc("skill", "team", result);
    return result;
  });
}
export function saveTask(
  input: unknown,
  id?: string,
  revision?: number,
  actor: Task["actor"] = "human",
  reason = "",
) {
  const data = taskInput.parse(input);
  return transaction(() => {
    const before = id ? getDoc<Task>("task", id) : null;
    if (id && !before)
      throw new WorkspaceError("Atividade não encontrada.", 404);
    if (before && revision !== before.revision)
      throw new WorkspaceError(
        "Esta atividade foi atualizada. Reabra o cartão para revisar a versão atual.",
        409,
      );
    if (data.sourceId) {
      const duplicate = database()
        .prepare(
          `SELECT id FROM orbit_documents WHERE kind='task' AND lower(json_extract(value, '$.source'))=lower(?) AND json_extract(value, '$.sourceId')=? AND id<>?`,
        )
        .get(data.source, data.sourceId, id || "") as
        | { id: string }
        | undefined;
      if (duplicate)
        throw new WorkspaceError(
          `A atividade desta fonte já existe: ${duplicate.id}. Atualize esse cartão.`,
          409,
        );
    }
    if (
      before &&
      Object.entries(data).every(
        ([key, value]) => before[key as keyof Task] === value,
      )
    )
      return before;
    const task: Task = {
      ...data,
      id: id || randomUUID(),
      revision: (before?.revision || 0) + 1,
      actor,
      updatedAt: new Date().toISOString(),
    };
    putDoc("task", task.id, task);
    if (before && actor === "human") {
      const feedback: Feedback = {
        id: randomUUID(),
        taskId: task.id,
        title: task.title,
        before,
        after: task,
        reason,
        rule: "",
        incorporated: false,
        createdAt: task.updatedAt,
      };
      putDoc("feedback", feedback.id, feedback);
    }
    return task;
  });
}
export function saveRoutine(input: unknown, id?: string, revision?: number) {
  const data = routineInput.parse(input);
  return transaction(() => {
    const before = id ? getDoc<Routine>("routine", id) : null;
    if (id && !before) throw new WorkspaceError("Rotina não encontrada.", 404);
    if (before && revision !== before.revision)
      throw new WorkspaceError("Esta rotina mudou. Reabra para editar.", 409);
    const now = new Date().toISOString();
    const result: Routine = {
      ...data,
      id: id || randomUUID(),
      createdAt: before?.createdAt || now,
      updatedAt: now,
      revision: (before?.revision || 0) + 1,
    };
    putDoc("routine", result.id, result);
    return result;
  });
}
export function saveBlueprint(blueprint: Blueprint, version: number) {
  // Atomic publication: a skill and its routines are a single process revision.
  transaction(() => {
    const current = getSkill();
    if (current.version !== version)
      throw new WorkspaceError(
        "A skill mudou enquanto o processo era desenhado. Gere uma nova versão.",
        409,
      );
    putDoc("skill-version", String(current.version), current);
    putDoc("skill", "team", { ...blueprint.skill, version: version + 1 });
    const now = new Date().toISOString();
    for (const r of blueprint.routines) {
      const before = r.id ? getDoc<Routine>("routine", r.id) : null;
      if (r.id && (!before || before.revision !== r.revision))
        throw new WorkspaceError(
          "Uma rotina mudou enquanto o processo era desenhado. Gere uma nova versão.",
          409,
        );
      const id = r.id || randomUUID();
      putDoc("routine", id, {
        ...r,
        enabled: false,
        id,
        createdAt: before?.createdAt || now,
        updatedAt: now,
        revision: (before?.revision || 0) + 1,
      });
    }
  });
}
export function incorporateFeedback(id: string, rule: string) {
  if (rule.trim().length < 10 || rule.length > 2000)
    throw new WorkspaceError(
      "Escreva um aprendizado entre 10 e 2.000 caracteres.",
    );
  transaction(() => {
    const feedback = getDoc<Feedback>("feedback", id);
    if (!feedback) throw new WorkspaceError("Correção não encontrada.", 404);
    if (feedback.incorporated)
      throw new WorkspaceError("Esta correção já foi incorporada.", 409);
    const skill = getSkill();
    const instructions = `${skill.instructions}\n\nAprendizado do time: ${rule.trim()}`;
    skillInput.parse({ ...skill, instructions });
    putDoc("skill-version", String(skill.version), skill);
    putDoc("skill", "team", {
      ...skill,
      instructions,
      version: skill.version + 1,
    });
    putDoc("feedback", id, {
      ...feedback,
      rule: rule.trim(),
      incorporated: true,
    });
  });
}
export function listRuns(): Run[] {
  return (
    database()
      .prepare("SELECT value FROM orbit_runs ORDER BY rowid DESC LIMIT 100")
      .all() as { value: string }[]
  ).map((r) => JSON.parse(r.value));
}
export function claimRun(
  routine: Routine,
  trigger: Run["trigger"],
  slot: string,
): Run | null {
  return transaction(() => {
    const stale = listRuns().filter(
      (r) =>
        r.status === "running" &&
        Date.parse(r.startedAt) < Date.now() - 10 * 60000,
    );
    for (const run of stale)
      finishRun(
        run.id,
        "error",
        "Execução interrompida. Revise as etapas antes de tentar novamente.",
      );
    const run: Run = {
      id: randomUUID(),
      routineId: routine.id,
      name: routine.name,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      summary: "Buscando contexto…",
      steps: [],
      skillVersion: getSkill().version,
      trigger,
      slot,
    };
    const result = database()
      .prepare("INSERT OR IGNORE INTO orbit_runs VALUES (?,?,?,?,?)")
      .run(run.id, routine.id, slot, run.status, JSON.stringify(run));
    return result.changes ? run : null;
  });
}
export function getRun(id: string): Run {
  const row = database()
    .prepare("SELECT value FROM orbit_runs WHERE id=?")
    .get(id) as { value: string } | undefined;
  if (!row) throw new WorkspaceError("Execução não encontrada.", 404);
  return JSON.parse(row.value);
}
export function addStep(id: string, title: string, detail: string) {
  const run = getRun(id);
  if (run.status !== "running")
    throw new WorkspaceError("Execução encerrada.", 409);
  run.steps.push({
    at: new Date().toISOString(),
    title,
    detail,
  } satisfies RunStep);
  database()
    .prepare("UPDATE orbit_runs SET value=? WHERE id=?")
    .run(JSON.stringify(run), id);
}
export function finishRun(
  id: string,
  status: "success" | "error",
  summary: string,
) {
  const run = getRun(id);
  Object.assign(run, { status, summary, finishedAt: new Date().toISOString() });
  database()
    .prepare("UPDATE orbit_runs SET status=?, value=? WHERE id=?")
    .run(status, JSON.stringify(run), id);
}
export function claimQuestion(task: string, day: string): boolean {
  return Boolean(
    database()
      .prepare("INSERT OR IGNORE INTO orbit_questions VALUES (?,?)")
      .run(task, day).changes,
  );
}

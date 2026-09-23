import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { Routine, Task } from "../lib/workspace-types";

const directory = mkdtempSync(path.join(tmpdir(), "orbit-test-"));
process.env.DATA_DIR = directory;
delete process.env.OPENROUTER_API_KEY;
delete process.env.KANBAN_AI_PROVIDER;
const store = await import("../lib/workspace-store");
const { dueSlot } = await import("../lib/workspace-schedule");
const { routineInput, taskInput } = await import("../lib/workspace-schema");
const { executeRoutine, designProcess } = await import(
  "../lib/workspace-agent"
);
const { validateZapierUrl } = await import("../lib/workspace-mcp");
store.initializeWorkspace();
after(() => rmSync(directory, { recursive: true, force: true }));

const makeRoutine = (overrides: Partial<Routine> = {}): Routine => ({
  id: randomUUID(),
  name: "Teste de acompanhamento",
  prompt: "Cruze fontes e atualize o quadro com evidências.",
  frequency: "weekdays",
  time: "09:00",
  weekday: 1,
  timezone: "America/Sao_Paulo",
  enabled: true,
  tools: [],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  revision: 1,
  ...overrides,
});
const makeTask = () =>
  store.saveTask({
    title: "Entrega validada",
    status: "todo",
    priority: "high",
    assignee: "Ana",
    contact: "U123",
    due: "2020-01-01",
    source: "Trello",
    sourceId: randomUUID(),
  });
const tools = [
  {
    name: "slack_read",
    description: "Read messages",
    schema: { type: "object", properties: {} },
    access: "read",
  },
  {
    name: "slack_send",
    description: "Send message",
    schema: {
      type: "object",
      properties: { text: { type: "string" }, channel: { type: "string" } },
    },
    access: "deadline",
    messageField: "text",
    recipientField: "channel",
  },
];

test("seeds exactly once and keeps all four board columns represented", () => {
  const before = store.docs<Task>("task");
  store.initializeWorkspace();
  assert.equal(store.docs("task").length, before.length);
  assert.deepEqual(
    new Set(before.map((t) => t.status)),
    new Set(["todo", "doing", "done", "archived"]),
  );
  assert.ok(store.docs<Routine>("routine").every((r) => !r.enabled));
});

test("manual changes persist, reject stale writes and feed a versioned skill", () => {
  const original = makeTask();
  const edited = store.saveTask(
    { ...original, status: "doing" },
    original.id,
    original.revision,
    "human",
    "Validar com cliente antes de concluir.",
  );
  assert.equal(edited.revision, 2);
  assert.throws(
    () =>
      store.saveTask(
        { ...original, status: "done" },
        original.id,
        original.revision,
      ),
    /atualizada/,
  );
  const feedback = store
    .docs<{ id: string; taskId: string }>("feedback")
    .find((f) => f.taskId === original.id)!;
  const version = store.getSkill().version;
  store.incorporateFeedback(
    feedback.id,
    "Validar com cliente antes de concluir qualquer entrega.",
  );
  assert.equal(store.getSkill().version, version + 1);
  assert.match(store.getSkill().instructions, /Validar com cliente/);
  assert.throws(
    () =>
      store.incorporateFeedback(
        feedback.id,
        "Uma segunda tentativa não duplica regras.",
      ),
    /já foi/,
  );
  const persisted = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `import { abrirBanco } from './lib/store.ts'; const row=abrirBanco().prepare('SELECT value FROM orbit_documents WHERE kind=? AND id=?').get('task','${original.id}'); process.stdout.write(row.value);`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATA_DIR: directory },
      encoding: "utf8",
    },
  );
  assert.equal(JSON.parse(persisted).status, "doing");
});

test("validates real calendar dates, schedule times, timezone and recurrence", () => {
  assert.equal(
    taskInput.safeParse({
      title: "X",
      status: "doing",
      priority: "high",
      due: "2026-02-30",
    }).success,
    false,
  );
  for (const invalid of [
    { time: "25:00" },
    { frequency: "sometimes" },
    { timezone: "invalid/zone" },
    { weekday: 7 },
  ])
    assert.equal(
      routineInput.safeParse({ ...makeRoutine(), ...invalid }).success,
      false,
    );
});

test("scheduler uses São Paulo wall time, weekdays and creation boundaries", () => {
  const r = makeRoutine();
  assert.equal(dueSlot(r, new Date("2026-09-22T11:59:00Z")), null);
  assert.equal(
    dueSlot(r, new Date("2026-09-22T12:00:00Z")),
    "2026-09-22T09:00@America/Sao_Paulo",
  );
  assert.equal(dueSlot(r, new Date("2026-09-26T14:00:00Z")), null);
  assert.equal(
    dueSlot(
      { ...r, createdAt: "2026-09-22T15:00:00Z" },
      new Date("2026-09-22T16:00:00Z"),
    ),
    null,
  );
  assert.equal(
    dueSlot({ ...r, enabled: false }, new Date("2026-09-22T16:00:00Z")),
    null,
  );
  assert.equal(
    dueSlot({ ...r, frequency: "weekly" }, new Date("2026-09-22T16:00:00Z")),
    null,
  );
});

test("DST repeated wall clock minute maps to the same slot", () => {
  const r = makeRoutine({
    frequency: "daily",
    time: "01:30",
    timezone: "America/New_York",
  });
  assert.equal(
    dueSlot(r, new Date("2026-11-01T05:30:00Z")),
    dueSlot(r, new Date("2026-11-01T06:30:00Z")),
  );
});

test("SQLite claims prevent simultaneous runs and duplicate scheduled slots", () => {
  const r = makeRoutine();
  const one = store.claimRun(r, "schedule", "slot1");
  assert.ok(one);
  assert.equal(store.claimRun(r, "manual", "slot2"), null);
  store.finishRun(one!.id, "success", "ok");
  assert.equal(store.claimRun(r, "schedule", "slot1"), null);
  assert.ok(store.claimRun(r, "manual", "slot2"));
});

test("reads external evidence, updates a task and records provenance", async () => {
  store.putDoc("settings", "tools", tools);
  const task = makeTask();
  const actions = [
    { action: "read", tool: "slack_read", arguments: {} },
    {
      action: "update",
      taskId: task.id,
      revision: task.revision,
      patch: { status: "doing" },
      evidence: ["source-1"],
      reason: "Ana informou que começou a entrega.",
    },
    { action: "finish", summary: "Entrega atualizada com base no Slack." },
  ];
  const result = await executeRoutine(
    makeRoutine({ tools: ["slack_read"] }),
    "manual",
    undefined,
    {
      enabled: () => true,
      generate: async () => actions.shift(),
      call: async () => ({ message: "Comecei a entrega.", author: "Ana" }),
    },
  );
  assert.equal(result!.status, "success");
  assert.equal(store.getDoc<Task>("task", task.id)!.status, "doing");
  assert.match(store.getDoc<Task>("task", task.id)!.evidence, /slack_read/);
  assert.equal(result!.steps.length, 3);
});

test("a fabricated source cannot modify a card, and a later finish cannot hide errors", async () => {
  const task = makeTask();
  const actions = [
    {
      action: "update",
      taskId: task.id,
      revision: 1,
      patch: { status: "done" },
      evidence: ["fake"],
      reason: "Invented",
    },
    { action: "finish", summary: "Não foi possível atualizar." },
  ];
  const result = await executeRoutine(makeRoutine(), "manual", undefined, {
    enabled: () => true,
    generate: async () => actions.shift(),
    call: async () => {
      throw new Error("must not call");
    },
  });
  assert.equal(result!.status, "error");
  assert.equal(store.getDoc<Task>("task", task.id)!.status, "todo");
});

test("deadline messages have a deterministic recipient/text and a once-per-day attempt limit", async () => {
  store.putDoc("settings", "tools", tools);
  const task = makeTask();
  const sent: Record<string, unknown>[] = [];
  const run = async () => {
    const actions = [
      { action: "read", tool: "slack_read", arguments: {} },
      {
        action: "question",
        taskId: task.id,
        tool: "slack_send",
        arguments: { text: "arbitrary", channel: "wrong" },
        evidence: ["source-1"],
        reason: "Prazo atrasado sem nova previsão.",
      },
      { action: "finish", summary: "Prazo verificado." },
    ];
    return executeRoutine(
      makeRoutine({ tools: ["slack_read", "slack_send"] }),
      "manual",
      undefined,
      {
        enabled: () => true,
        generate: async () => actions.shift(),
        call: async (name, args) => {
          if (name === "slack_send") sent.push(args);
          return { ok: true };
        },
      },
    );
  };
  assert.equal((await run())!.status, "success");
  assert.equal((await run())!.status, "error");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].channel, "U123");
  assert.match(String(sent[0].text), /Qual é a nova previsão de entrega/);
});

test("completed tasks never trigger deadline questions", async () => {
  const original = makeTask();
  const task = store.saveTask(
    { ...original, status: "done" },
    original.id,
    original.revision,
  );
  const actions = [
    { action: "read", tool: "slack_read", arguments: {} },
    {
      action: "question",
      taskId: task.id,
      tool: "slack_send",
      arguments: {},
      evidence: ["source-1"],
      reason: "Test",
    },
    { action: "finish", summary: "Não enviada." },
  ];
  let sends = 0;
  const run = await executeRoutine(
    makeRoutine({ tools: ["slack_read", "slack_send"] }),
    "manual",
    undefined,
    {
      enabled: () => true,
      generate: async () => actions.shift(),
      call: async (name) => {
        if (name === "slack_send") sends++;
        return {};
      },
    },
  );
  assert.equal(sends, 0);
  assert.equal(run!.status, "error");
});

test("read tools cannot be used as message tools or without routine authorization", async () => {
  let calls = 0;
  const actions = [
    { action: "read", tool: "slack_send", arguments: {} },
    { action: "finish", summary: "Bloqueado." },
  ];
  const run = await executeRoutine(
    makeRoutine({ tools: ["slack_send"] }),
    "manual",
    undefined,
    {
      enabled: () => true,
      generate: async () => actions.shift(),
      call: async () => {
        calls++;
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(run!.status, "error");
});

test("missing AI is recorded as failure rather than a demo success", async () => {
  const result = await executeRoutine(makeRoutine(), "manual", undefined, {
    enabled: () => false,
    generate: async () => {
      throw new Error("must not call");
    },
    call: async () => {},
  });
  assert.equal(result!.status, "error");
  assert.match(result!.summary, /Conecte a IA/);
});

test("process template preserves input and is explicit about being a template", async () => {
  const input =
    "Toda quinta fazemos a weekly e conversamos no Slack no canal de produto.";
  const result = await designProcess(input);
  assert.equal(result.mode, "template");
  assert.equal(result.blueprint.skill.process, input);
  assert.ok(result.blueprint.routines.every((r) => r.enabled === false));
});

test("Zapier URL validation blocks local addresses, credentials and lookalike domains", () => {
  for (const invalid of [
    "http://mcp.zapier.com/x",
    "https://mcp.zapier.com.evil.test/x",
    "https://127.0.0.1/x",
    "https://user:pass@mcp.zapier.com/x",
    "https://mcp.zapier.com:8080/x",
  ])
    assert.throws(() => validateZapierUrl(invalid));
  assert.equal(
    validateZapierUrl("https://mcp.zapier.com/api/mcp/s/secret/mcp").hostname,
    "mcp.zapier.com",
  );
});

test("a process revision edits existing routines atomically and rolls back stale proposals", () => {
  const routine = store.docs<Routine>("routine")[0];
  const count = store.docs("routine").length;
  const skill = store.getSkill();
  store.saveBlueprint(
    { skill, routines: [{ ...routine, time: "11:15" }] },
    skill.version,
  );
  assert.equal(store.docs("routine").length, count);
  assert.equal(store.getDoc<Routine>("routine", routine.id)!.time, "11:15");
  assert.equal(store.getDoc<Routine>("routine", routine.id)!.enabled, false);
  const updatedSkill = store.getSkill();
  assert.throws(
    () =>
      store.saveBlueprint(
        {
          skill: { ...updatedSkill, name: "Must roll back" },
          routines: [{ ...routine, time: "12:30" }],
        },
        updatedSkill.version,
      ),
    /mudou/,
  );
  assert.equal(store.getSkill().name, updatedSkill.name);
  assert.equal(store.getSkill().version, updatedSkill.version);
  assert.equal(store.getDoc<Routine>("routine", routine.id)!.time, "11:15");
});

test("an agent status patch preserves owner, deadline, contact and source identity", async () => {
  const task = makeTask();
  const actions = [
    {
      action: "update",
      taskId: task.id,
      revision: task.revision,
      patch: { status: "doing" },
      evidence: ["user"],
      reason: "Início confirmado pelo time.",
    },
    { action: "finish", summary: "Status atualizado." },
  ];
  const run = await executeRoutine(
    makeRoutine(),
    "manual",
    undefined,
    {
      enabled: () => true,
      generate: async () => actions.shift(),
      call: async () => {},
    },
    "Mova a entrega para doing.",
  );
  assert.equal(run!.status, "success");
  const updated = store.getDoc<Task>("task", task.id)!;
  for (const key of [
    "due",
    "assignee",
    "contact",
    "source",
    "sourceId",
    "project",
    "description",
  ] as const)
    assert.equal(updated[key], task[key], `${key} must be preserved`);
});

test("OpenRouter process generation uses the real gateway and can revise existing routines", async () => {
  const { setConfig } = await import("../lib/store");
  const { generateJSON } = await import("../lib/workspace-ai");
  const originalFetch = globalThis.fetch;
  const routine = store.docs<Routine>("routine")[0];
  setConfig("OPENROUTER_API_KEY", "fixture-key-never-sent");
  let invalid = false;
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://openrouter.ai/api/v1/chat/completions",
    );
    const request = JSON.parse(String(init?.body));
    assert.ok(request.messages[0].content.includes("JSON"));
    if (!invalid) {
      const context = JSON.parse(request.messages[1].content);
      assert.ok(
        context.existingRoutines.some((r: Routine) => r.id === routine.id),
      );
      assert.equal(context.current.objective, store.getSkill().objective);
    }
    return Response.json({
      choices: [
        {
          message: {
            content: invalid
              ? "not JSON"
              : JSON.stringify({
                  skill: store.getSkill(),
                  routines: [{ ...routine, time: "14:30" }],
                }),
          },
        },
      ],
    });
  };
  try {
    const proposal = await designProcess(
      "Mude o alinhamento semanal para 14:30 e preserve as demais rotinas.",
    );
    assert.equal(proposal.mode, "ai");
    assert.equal(proposal.blueprint.routines[0].id, routine.id);
    assert.equal(proposal.blueprint.routines[0].time, "14:30");
    invalid = true;
    await assert.rejects(
      generateJSON("Responda JSON", "teste"),
      /formato inesperado/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    setConfig("OPENROUTER_API_KEY", null);
  }
});

test("source identity is unique even if different agents use different source casing", () => {
  const task = makeTask();
  assert.throws(
    () =>
      store.saveTask(
        { ...task, title: "Duplicata", source: task.source.toLowerCase() },
        undefined,
        undefined,
        "agent",
      ),
    /já existe/,
  );
  assert.equal(
    store.docs<Task>("task").filter((t) => t.sourceId === task.sourceId).length,
    1,
  );
});

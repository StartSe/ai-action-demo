import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
const dir = mkdtempSync(join(tmpdir(), "brain-captures-"));
process.env.DATA_DIR = dir;
const { captureProviders } =
  await import("../tests/fixtures/capture-providers.mjs");
const { setConfig } = await import("./store");
const { db, notes, note, revisions } = await import("./brain");
const {
  captureDb,
  collectionAccess,
  enqueueCapture,
  captureTask,
  captureState,
  claimCapture,
  retryCapture,
  cancelCapture,
  saveSchedule,
  pauseSchedule,
  deleteSchedule,
  queueDueSchedules,
} = await import("./captures");
const {
  captureToolCatalog,
  saveCaptureTools,
  describeCaptureTools,
  checkCaptureTool,
} = await import("./capture-permissions");
const { listTools } = await import("./zapier");
const { runCapture } = await import("./capture-worker");
const { nextOccurrence } = await import("./recurrence");
const { setupState, verifySetupAI } = await import("./onboarding");
const { POST } = await import("../app/api/captures/route");
const originalFetch = globalThis.fetch;
let fixture: ReturnType<typeof captureProviders>;
const instruction =
  "Obter as 4 últimas mensagens do canal Slack tech-academy (C04KTMS2GEL) e organizar os pontos na wiki";
test.beforeEach(() => {
  captureDb().exec(
    "DELETE FROM capture_steps; DELETE FROM capture_tasks; DELETE FROM capture_schedules; DELETE FROM revisions; DELETE FROM notes; DELETE FROM jobs; DELETE FROM config;",
  );
  setConfig("BRAIN_PROVIDER", "openrouter");
  setConfig("OPENROUTER_API_KEY", "test-key");
  setConfig(
    "ZAPIER_MCP_URL",
    "https://mcp.zapier.com/api/mcp/s/capture-fixture",
  );
  fixture = captureProviders(() => {
    throw Error("Unexpected real network request");
  });
  globalThis.fetch = fixture.fetch;
});
test.after(() => {
  globalThis.fetch = originalFetch;
  db().close();
  rmSync(dir, { recursive: true, force: true });
});
async function newTask() {
  return enqueueCapture(instruction, await collectionAccess());
}
async function runNext(owner = "worker-test") {
  const task = claimCapture(owner);
  assert.ok(task, "a queued task must be claimed");
  await runCapture(task, owner);
  return captureTask(task.id);
}
test("pedido Slack retorna na fila e coleta quatro mensagens em background com fontes e wiki", async () => {
  const response = await POST(
    new Request("http://localhost/api/captures", {
      method: "POST",
      body: JSON.stringify({ action: "create", instruction }),
    }),
  );
  assert.equal(response.status, 200);
  const queued = await response.json();
  assert.equal(queued.status, "queued");
  assert.equal(fixture.state.dataCalls, 0);
  const task = await runNext();
  assert.equal(task.status, "done", task.error);
  assert.equal(task.sources.length, 1);
  assert.equal(task.pages.length, 1);
  assert.equal(fixture.state.dataCalls, 1);
  assert.deepEqual(fixture.state.toolCalls[0].arguments, {
    channel: "C04KTMS2GEL",
    limit: 4,
  });
  const raw = note(task.sources[0]),
    wiki = note(task.pages[0]);
  for (const m of fixture.messages) assert.ok(raw.content.includes(m.ts));
  assert.equal(raw.status, "organized");
  assert.deepEqual(wiki.sources, [raw.id]);
  assert.ok(wiki.content.includes("Ana"));
  assert.ok(wiki.content.includes("C04KTMS2GEL"));
  const exposed = fixture.state.aiRequests.flatMap(
    (r: { tools?: { function: { description: string } }[] }) => r.tools || [],
  );
  assert.ok(!JSON.stringify(exposed).includes("slack_send_message"));
  assert.ok(!JSON.stringify(task).includes("test-key"));
});
test("modo agêntico do Zapier inspeciona ações e executa só leitura, sem importar metadados na wiki", async () => {
  fixture.state.mode = "agentic";
  await newTask();
  const task = await runNext();
  assert.equal(task.status, "done", task.error);
  assert.deepEqual(
    fixture.state.toolCalls.map((t: { name: string }) => t.name),
    ["inspect_zapier_actions", "execute_zapier_read_action"],
  );
  assert.equal(task.steps.length, 2);
  assert.equal(task.sources.length, 1);
  assert.ok(
    !JSON.stringify(fixture.state.aiRequests).includes(
      "execute_zapier_write_action",
    ),
  );
  assert.ok(
    !JSON.stringify(fixture.state.aiRequests).includes("write_code_action"),
  );
});
test("ferramenta sem classificação requer escolha de leitura; revogação e troca de conexão interrompem a coleta", async () => {
  fixture.state.unknownRead = true;
  await assert.rejects(collectionAccess, /Autorize/);
  await assert.rejects(
    () => saveCaptureTools(["slack_send_message"]),
    /não está disponível/,
  );
  await saveCaptureTools(["slack_channel_history"]);
  const first = await newTask();
  await saveCaptureTools([]);
  assert.equal((await runNext()).status, "failed");
  assert.equal(fixture.state.dataCalls, 0);
  await saveCaptureTools(["slack_channel_history"]);
  await newTask();
  setConfig("ZAPIER_MCP_URL", "https://mcp.zapier.com/api/mcp/s/other-fixture");
  const changed = await runNext();
  assert.equal(changed.status, "failed");
  assert.match(changed.error, /conexão Zapier mudou/);
  assert.equal(fixture.state.dataCalls, 0);
  assert.equal(captureTask(first.id).sources.length, 0);
});
test("consultas Slack marcadas como ações podem ser selecionadas, salvas e executadas na coleta", async () => {
  fixture.state.slackActions = true;
  const names = [
    "slack_find_public_channel",
    "slack_retrieve_thread_messages",
    "slack_get_message_by_timestamp",
  ];
  const catalog = await captureToolCatalog();
  for (const name of names) {
    const tool = catalog.find((t) => t.name === name)!;
    assert.equal(tool.blocked, false, name);
    assert.equal(tool.recognizedReadOnly, true, name);
    assert.equal(tool.declaredReadOnly, false, name);
    assert.equal(
      tool.allowed,
      false,
      "a nova consulta exige seleção explícita",
    );
  }
  for (const name of ["slack_send_message", "slack_edit_message"])
    await assert.rejects(() => saveCaptureTools([name]), /não está disponível/);
  const saved = await saveCaptureTools(names);
  assert.deepEqual(
    saved.filter((t) => t.allowed).map((t) => t.name),
    names,
  );
  assert.equal((await setupState()).readTools, 3);
  assert.deepEqual(
    (await captureToolCatalog()).filter((t) => t.allowed).map((t) => t.name),
    names,
  );
  await saveCaptureTools(["slack_retrieve_thread_messages"]);
  await newTask();
  const task = await runNext();
  assert.equal(task.status, "done", task.error);
  assert.equal(task.sources.length, 1);
  assert.equal(task.pages.length, 1);
  assert.equal(
    fixture.state.toolCalls[0].name,
    "slack_retrieve_thread_messages",
  );
  assert.ok(
    !JSON.stringify(fixture.state.aiRequests).includes("slack_edit_message"),
  );
});
test("exceção de consultas Slack mantém revogação e verificação da definição da ferramenta", async () => {
  fixture.state.slackActions = true;
  const name = "slack_find_public_channel";
  await saveCaptureTools([name]);
  const access = await collectionAccess();
  const tool = (await listTools()).find((t) => t.name === name)!;
  assert.doesNotThrow(() => checkCaptureTool(tool, access));
  assert.throws(
    () =>
      checkCaptureTool(
        { ...tool, inputSchema: { type: "object", properties: {} } },
        access,
      ),
    /permissão dessa ferramenta mudou/,
  );
  await newTask();
  await saveCaptureTools([]);
  assert.throws(
    () => checkCaptureTool(tool, access),
    /permissão dessa ferramenta mudou/,
  );
  assert.equal((await runNext()).status, "failed");
  assert.equal(fixture.state.dataCalls, 0);
});
test("nomes parecidos e títulos de consulta não liberam ações de escrita", () => {
  const tools: Tool[] = [
    "slack_find_public_channel_and_create",
    "slack_find_or_create_channel",
    "slack_retrieve_thread_messages_and_delete",
    "slack_api_request",
    "slack_edit_message",
    "execute_zapier_write_action",
    "write_code_action",
    "enable_zapier_action",
  ].map((name) => ({
    name,
    title: "Slack: Find Public Channel",
    inputSchema: { type: "object" },
    annotations: { readOnlyHint: false },
  }));
  for (const tool of describeCaptureTools(tools)) {
    assert.equal(tool.blocked, true, tool.name);
    assert.equal(tool.allowed, false, tool.name);
    assert.equal(tool.recognizedReadOnly, false, tool.name);
  }
});
test("falha ao organizar preserva o original e retomar reaproveita a leitura sem duplicar fonte", async () => {
  fixture.state.failOrganization = true;
  const queued = await newTask();
  let task = await runNext();
  assert.equal(task.status, "failed");
  assert.equal(task.sources.length, 1);
  assert.equal(task.pages.length, 0);
  assert.equal(note(task.sources[0]).status, "inbox");
  fixture.state.failOrganization = false;
  retryCapture(queued.id);
  task = await runNext();
  assert.equal(task.status, "done", task.error);
  assert.equal(fixture.state.dataCalls, 1);
  assert.equal(notes().filter((n) => n.kind === "raw").length, 1);
  assert.equal(task.pages.length, 1);
});
test("cancelamento durante leitura impede gravação tardia e não vira sucesso", async () => {
  let release!: () => void;
  fixture.state.gate = new Promise<void>((r) => {
    release = r;
  });
  const queued = await newTask();
  const task = claimCapture("cancel-worker")!;
  const pending = runCapture(task, "cancel-worker");
  for (let attempt = 0; !fixture.state.dataCalls && attempt < 400; attempt++)
    await new Promise((r) => setTimeout(r, 5));
  assert.equal(fixture.state.dataCalls, 1);
  cancelCapture(queued.id);
  release();
  await pending;
  assert.equal(captureTask(task.id).status, "cancelled");
  assert.equal(notes().length, 0);
  assert.throws(() => cancelCapture(task.id), /já terminou/);
});
test("lease impede dois workers e recupera interrupção após gravar a wiki sem duplicar revisão", async () => {
  const queued = await newTask();
  const first = claimCapture("worker-a")!;
  assert.equal(claimCapture("worker-b"), null);
  await runCapture(first, "worker-a");
  const done = captureTask(queued.id),
    page = done.pages[0];
  // Simulate a process dying after its atomic wiki checkpoint, before marking done.
  captureDb()
    .prepare(
      "UPDATE capture_tasks SET status='running',owner='dead-process',leaseUntil=?,attempts=1 WHERE id=?",
    )
    .run(new Date(Date.now() - 1000).toISOString(), queued.id);
  const resumed = await runNext("worker-b");
  assert.equal(resumed.status, "done", resumed.error);
  assert.equal(resumed.attempts, 2);
  assert.equal(fixture.state.dataCalls, 1);
  assert.equal(revisions(page).length, 1);
  assert.deepEqual(resumed.sources, done.sources);
  assert.deepEqual(resumed.pages, done.pages);
});
test("falha da ferramenta não é sucesso nem vaza resposta privada; repetir cria coleta nova", async () => {
  fixture.state.failRead = true;
  const queued = await newTask();
  const failed = await runNext();
  assert.equal(failed.status, "failed");
  assert.equal(failed.sources.length, 0);
  assert.ok(!failed.error.includes("PRIVATE_PROVIDER_ERROR_TOKEN"));
  fixture.state.failRead = false;
  const res = await POST(
    new Request("http://localhost/api/captures", {
      method: "POST",
      body: JSON.stringify({ action: "repeat", id: queued.id }),
    }),
  );
  const repeated = await res.json();
  assert.notEqual(repeated.id, queued.id);
  assert.equal(repeated.parentId, queued.id);
  assert.equal((await runNext()).status, "done");
  assert.equal(fixture.state.dataCalls, 2);
});
test("recorrência respeita fuso, dias úteis e mudanças de horário de verão", () => {
  const base = {
    frequency: "daily" as const,
    time: "09:00",
    timezone: "America/Sao_Paulo",
    weekday: 1,
  };
  assert.equal(
    nextOccurrence(base, new Date("2026-09-21T11:59:00Z")),
    "2026-09-21T12:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(base, new Date("2026-09-21T12:00:00Z")),
    "2026-09-22T12:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      { ...base, frequency: "weekdays" },
      new Date("2026-09-25T12:00:00Z"),
    ),
    "2026-09-28T12:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      { ...base, frequency: "weekly", weekday: 1 },
      new Date("2026-09-21T12:00:00Z"),
    ),
    "2026-09-28T12:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      { ...base, time: "02:30", timezone: "America/New_York" },
      new Date("2026-03-08T05:00:00Z"),
    ),
    "2026-03-09T06:30:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      { ...base, time: "01:30", timezone: "America/New_York" },
      new Date("2026-11-01T05:30:00Z"),
    ),
    "2026-11-02T06:30:00.000Z",
  );
  assert.throws(() => nextOccurrence({ ...base, timezone: "invalid" }), /fuso/);
  assert.throws(() => nextOccurrence({ ...base, time: "24:61" }), /horário/);
});
test("agendamento persiste, recupera uma ocorrência atrasada e não sobrepõe ou dispara quando pausado", async () => {
  const now = new Date("2026-09-21T10:00:00Z");
  const s = saveSchedule(
    instruction,
    {
      frequency: "daily",
      time: "09:00",
      timezone: "America/Sao_Paulo",
      weekday: 1,
    },
    await collectionAccess(),
    undefined,
    now,
  );
  queueDueSchedules(new Date("2026-09-24T15:00:00Z"));
  queueDueSchedules(new Date("2026-09-24T15:00:00Z"));
  assert.equal(captureState().tasks.length, 1);
  assert.equal(captureState().tasks[0].scheduleId, s.id);
  assert.equal(captureState().schedules[0].nextRun, "2026-09-25T12:00:00.000Z");
  queueDueSchedules(new Date("2026-09-25T15:00:00Z"));
  assert.equal(captureState().tasks.length, 1);
  pauseSchedule(s.id);
  queueDueSchedules(new Date("2026-09-28T15:00:00Z"));
  assert.equal(captureState().tasks.length, 1);
  deleteSchedule(s.id);
  assert.equal(captureState().schedules.length, 0);
  assert.equal(captureState().tasks.length, 1);
});
test("primeiro acesso testa IA real pelo adaptador, rejeita chave inválida e acompanha ferramentas autorizadas", async () => {
  assert.equal((await setupState()).status, "new");
  assert.equal((await setupState()).aiVerified, false);
  setConfig("OPENROUTER_API_KEY", "invalid-test-key");
  await assert.rejects(() => verifySetupAI(), /chave do OpenRouter/);
  assert.equal((await setupState()).aiVerified, false);
  setConfig("OPENROUTER_API_KEY", "test-key");
  assert.equal((await verifySetupAI()).aiVerified, true);
  setConfig("OPENROUTER_MODEL", "different/model");
  assert.equal((await setupState()).aiVerified, false);
  await captureToolCatalog();
  assert.equal((await setupState()).readTools, 1);
  await saveCaptureTools([]);
  assert.equal((await setupState()).readTools, 0);
  setConfig("ONBOARDING_STEP", "3");
  setConfig("ONBOARDING_STATUS", "deferred");
  assert.equal((await setupState()).step, 3);
  assert.equal((await setupState()).status, "deferred");
  assert.ok(!JSON.stringify(await setupState()).includes("test-key"));
});

test("fila cheia mantém agendamento pendente sem impedir o worker de avançar", async () => {
  const access = await collectionAccess();
  for (let i = 0; i < 100; i++) enqueueCapture(`Coleta ${i}`, access);
  saveSchedule(
    instruction,
    {
      frequency: "daily",
      time: "09:00",
      timezone: "America/Sao_Paulo",
      weekday: 1,
    },
    access,
    undefined,
    new Date("2026-09-20T10:00:00Z"),
  );
  assert.doesNotThrow(() =>
    queueDueSchedules(new Date("2026-09-21T15:00:00Z")),
  );
  assert.ok(claimCapture("full-queue-worker"));
  assert.equal(captureState().schedules[0].nextRun, "2026-09-20T12:00:00.000Z");
});

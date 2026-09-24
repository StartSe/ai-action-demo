import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "daily-organization-"));
process.env.DATA_DIR = dir;
const { save, note, notes, db } = await import("./brain");
const { setConfig } = await import("./store");
const { captureDb, claimCapture } = await import("./captures");
const {
  enqueueOrganization,
  processingState,
  claimOrganization,
  runOrganization,
  dismissProcessing,
} = await import("./organization");
const { removalPlan, removeItems } = await import("./removal");
const { POST, GET } = await import("../app/api/brain/route");
const { captureProviders } =
  await import("../tests/fixtures/capture-providers.mjs");
const originalFetch = globalThis.fetch;
let fixture: ReturnType<typeof captureProviders>;
const raw = (title = "Fonte") =>
  save({ kind: "raw", title, content: "Uma decisão preservada." });
async function runNext() {
  const job = claimOrganization("worker");
  assert.ok(job);
  await runOrganization(job, "worker");
  return processingState()[job.sourceId];
}
test.beforeEach(() => {
  captureDb().exec(
    "DELETE FROM organization_jobs; DELETE FROM capture_steps; DELETE FROM capture_tasks; DELETE FROM notes; DELETE FROM revisions; DELETE FROM config;",
  );
  setConfig("BRAIN_PROVIDER", "openrouter");
  setConfig("OPENROUTER_API_KEY", "test-key");
  fixture = captureProviders(() => {
    throw Error("Unexpected network request");
  });
  globalThis.fetch = fixture.fetch;
});
test.after(() => {
  globalThis.fetch = originalFetch;
  db().close();
  rmSync(dir, { recursive: true, force: true });
});
test("API enfileira lote sem chamar IA, deduplica e expõe estado persistente", async () => {
  const a = raw("A"),
    b = raw("B");
  const res = await POST(
    new Request("http://localhost/api/brain", {
      method: "POST",
      body: JSON.stringify({ action: "organize", ids: [a.id, b.id, a.id] }),
    }),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).queued, 2);
  assert.equal(fixture.state.aiRequests.length, 0);
  assert.equal(enqueueOrganization([a.id]).alreadyProcessing, 1);
  const state = await (
    await GET(new Request("http://localhost/api/brain"))
  ).json();
  assert.equal(Object.keys(state.sourceProcessing).length, 2);
  assert.equal(state.sourceProcessing[a.id].status, "queued");
  assert.equal("owner" in state.sourceProcessing[a.id], false);
  assert.equal((await runNext()).status, "done");
  assert.equal((await runNext()).status, "done");
  assert.equal(note(a.id).content, a.content);
  assert.equal(note(b.id).status, "organized");
  assert.equal(enqueueOrganization([a.id]).alreadyOrganized, 1);
  assert.equal(notes().filter((n) => n.kind === "wiki").length, 1);
  assert.equal(dismissProcessing()[a.id].dismissed, true);
});
test("falha preserva fonte, não bloqueia próximo item e permite nova tentativa", async () => {
  const a = raw("Falha"),
    b = raw("Próxima");
  enqueueOrganization([a.id, b.id]);
  fixture.state.failOrganization = true;
  const failure = await runNext();
  assert.equal(failure.status, "failed");
  assert.match(failure.error, /estrutura válida/);
  assert.equal(note(a.id).status, "inbox");
  fixture.state.failOrganization = false;
  assert.equal((await runNext()).status, "done");
  assert.equal(dismissProcessing()[a.id].dismissed, false);
  enqueueOrganization([a.id]);
  assert.notEqual(processingState()[a.id].id, failure.id);
  assert.equal((await runNext()).status, "done");
});
test("lease recupera reinício e impede worker antigo de gravar página ou progresso", async () => {
  const a = raw();
  enqueueOrganization([a.id]);
  const old = claimOrganization("old")!;
  assert.equal(claimOrganization("other"), null);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  globalThis.fetch = async (...args) => {
    entered();
    await gate;
    return fixture.fetch(...args);
  };
  const running = runOrganization(old, "old");
  await started;
  db()
    .prepare("UPDATE organization_jobs SET leaseUntil=? WHERE sourceId=?")
    .run("2000-01-01T00:00:00.000Z", a.id);
  const resumed = claimOrganization("new")!;
  assert.equal(resumed.attempts, 2);
  release();
  await running;
  assert.equal(notes().filter((n) => n.kind === "wiki").length, 0);
  assert.equal(processingState()[a.id].status, "running");
  globalThis.fetch = fixture.fetch;
  await runOrganization(resumed, "new");
  assert.equal(note(a.id).status, "organized");
  assert.equal(notes().filter((n) => n.kind === "wiki").length, 1);
});
test("interrupções repetidas terminam em falha visível e não prendem fila", () => {
  const a = raw();
  enqueueOrganization([a.id]);
  for (let i = 0; i < 3; i++) {
    assert.ok(claimOrganization("worker"));
    db()
      .prepare(
        "UPDATE organization_jobs SET leaseUntil='2000-01-01' WHERE sourceId=?",
      )
      .run(a.id);
  }
  assert.equal(claimOrganization("worker"), null);
  assert.equal(processingState()[a.id].status, "failed");
  assert.match(processingState()[a.id].error, /interrompido repetidamente/);
});
test("excluir fonte em andamento impede resultado tardio e remove a fila", async () => {
  const a = raw();
  enqueueOrganization([a.id]);
  const job = claimOrganization("worker")!;
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  globalThis.fetch = async (...args) => {
    entered();
    await gate;
    return fixture.fetch(...args);
  };
  const running = runOrganization(job, "worker");
  await started;
  const plan = removalPlan({ sourceIds: [a.id] });
  removeItems({ sourceIds: [a.id] }, plan.token);
  release();
  await running;
  assert.equal(notes().length, 0);
  assert.deepEqual(processingState(), {});
});
test("coletas e organização compartilham exclusão de execução e não duplicam fonte ativa", () => {
  const a = raw();
  const iso = new Date().toISOString();
  db()
    .prepare(
      "INSERT INTO capture_tasks(id,instruction,status,created,updated,access) VALUES('capture','Pedido','queued',?,?,'{}')",
    )
    .run(iso, iso);
  db()
    .prepare(
      "INSERT INTO capture_steps(taskId,key,name,args,content,sourceId,created) VALUES('capture','step','read','{}','',?,?)",
    )
    .run(a.id, iso);
  assert.equal(enqueueOrganization([a.id]).alreadyProcessing, 1);
  const b = raw("Outra fonte");
  enqueueOrganization([b.id]);
  assert.ok(claimOrganization("worker"));
  assert.equal(claimCapture("capture-worker"), null);
  db()
    .prepare(
      "UPDATE organization_jobs SET status='failed',owner=NULL,leaseUntil=NULL",
    )
    .run();
  assert.ok(claimCapture("capture-worker"));
  enqueueOrganization([b.id]);
  assert.equal(claimOrganization("worker"), null);
});
test("validação do lote é atômica e impõe limite da fila", () => {
  const a = raw();
  assert.throws(() => enqueueOrganization([a.id, "missing"]), /não encontrada/);
  assert.deepEqual(processingState(), {});
  assert.throws(() => enqueueOrganization([]), /1 a 100/);
  assert.throws(() => enqueueOrganization(Array(101).fill(a.id)), /1 a 100/);
  const ids = Array.from({ length: 100 }, (_, i) => raw(`Fonte ${i}`).id);
  assert.equal(enqueueOrganization(ids).queued, 100);
  assert.throws(() => enqueueOrganization([a.id]), /fila está cheia/);
  assert.equal(Object.keys(processingState()).length, 100);
});
test("organização demonstrativa também grava wiki e resultado na mesma transação", async () => {
  setConfig("OPENROUTER_API_KEY", "");
  const a = save({
    kind: "raw",
    title: "Exemplo",
    content: "Uma reflexão fictícia",
    demo: true,
  });
  enqueueOrganization([a.id]);
  const result = await runNext();
  assert.equal(result.status, "done");
  assert.equal(note(a.id).status, "organized");
  assert.ok(result.pageId);
  assert.equal(note(result.pageId).demo, true);
  assert.equal(fixture.state.aiRequests.length, 0);
});

test("organização por coleta retomada também resolve falha anterior no painel", async () => {
  const a = raw();
  enqueueOrganization([a.id]);
  fixture.state.failOrganization = true;
  assert.equal((await runNext()).status, "failed");
  fixture.state.failOrganization = false;
  const { organize } = await import("./agent");
  const page = await organize(a.id, undefined, { onSaved: () => {} });
  assert.equal(processingState()[a.id].status, "done");
  assert.equal(processingState()[a.id].pageId, page.id);
  assert.equal(processingState()[a.id].error, "");
});

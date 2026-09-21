import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const data = mkdtempSync(join(tmpdir(), "daily-controls-"));
const out = process.env.TEST_ARTIFACTS || "/tmp/daily-controls-review";
const port = process.env.TEST_PORT || "3345";
const base = `http://127.0.0.1:${port}`;
mkdirSync(out, { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
const server = spawn(
  process.execPath,
  [
    "--import",
    resolve("tests/fixtures/capture-server-hook.mjs"),
    resolve(".next/standalone/server.js"),
  ],
  {
    cwd: resolve(".next/standalone"),
    env: {
      ...process.env,
      DATA_DIR: data,
      PORT: port,
      HOSTNAME: "127.0.0.1",
      CONTA_DESLIGADA: "",
      BRAIN_WORKER_DISABLED: "1",
      BRAIN_TEST_EXTRA_TOOLS: "60",
      NODE_OPTIONS: "",
      ZAPIER_MCP_URL: "",
      ZAPIER_MCP_TOKEN: "",
      BRAIN_PROVIDER: "",
      OPENROUTER_API_KEY: "",
      OPENROUTER_MODEL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "",
  browser,
  page;
const errors = [];
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
async function until(fn, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Condition timed out");
}
try {
  await until(async () => {
    if (server.exitCode !== null) throw Error(logs);
    try {
      return (await fetch(base + "/api/health")).ok;
    } catch {
      return false;
    }
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    reducedMotion: "reduce",
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByLabel("Seu nome").fill("Exploradora");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("controls@example.test");
  await page.locator("input[name=senha]").fill("TesteBrain!2026");
  await page.getByLabel("Confirmar senha").fill("TesteBrain!2026");
  await page.getByRole("button", { name: "Criar meu segundo cérebro" }).click();
  await page
    .getByRole("heading", { name: "Sua memória começa aqui." })
    .waitFor();
  assert.equal(
    (
      await context.request.put(base + "/api/settings", {
        data: {
          BRAIN_PROVIDER: "openrouter",
          OPENROUTER_API_KEY: "test-key",
          ZAPIER_MCP_URL: "https://mcp.zapier.com/api/mcp/s/controls-fixture",
        },
      })
    ).status(),
    200,
  );
  await page.goto(base + "/?view=connections");
  const tools = page.locator(".collection-tools");
  await tools
    .getByRole("button", { name: "Limpar seleção", exact: true })
    .waitFor();
  await until(
    async () => (await tools.locator("input[type=checkbox]").count()) === 66,
  );
  await tools
    .getByRole("button", { name: "Limpar seleção", exact: true })
    .click();
  const manual = [
    "Slack: Find Public Channel",
    "Slack: Retrieve Thread Messages",
    "Slack: Get Message by Timestamp",
  ];
  const saves = [];
  let failSave = true;
  await page.route("**/api/captures", async (route) => {
    const req = route.request();
    if (
      req.method() === "POST" &&
      req.postDataJSON()?.action === "permissions"
    ) {
      saves.push(req.postDataJSON().names);
      await new Promise((r) => setTimeout(r, 400));
      if (failSave) {
        failSave = false;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Falha simulada ao salvar. Tente novamente.",
          }),
        });
      }
    }
    await route.continue();
  });
  for (const name of manual)
    await tools.getByRole("checkbox", { name: new RegExp(name) }).check();
  assert.equal(await tools.locator("input:checked").count(), 3);
  // Re-render after the global poll must not discard unsaved choices.
  await page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/captures?"),
  );
  assert.equal(await tools.locator("input:checked").count(), 3);
  assert.equal(saves.length, 0);
  await tools
    .getByRole("button", { name: "Selecionar todas", exact: true })
    .click();
  assert.equal(await tools.locator("input:checked").count(), 64);
  assert.equal(await tools.locator("input:disabled:checked").count(), 0);
  await tools
    .getByRole("button", { name: "Salvar ferramentas de coleta", exact: true })
    .click();
  assert.ok(
    await tools
      .getByRole("button", { name: "Salvando ferramentas…" })
      .isDisabled(),
  );
  await tools
    .getByRole("alert")
    .filter({ hasText: "Falha simulada" })
    .waitFor();
  assert.equal(await tools.locator("input:checked").count(), 64);
  assert.equal(await tools.locator(".tool-save-feedback .notice").count(), 0);
  await tools
    .getByRole("button", { name: "Salvar ferramentas de coleta", exact: true })
    .click();
  await tools
    .getByRole("status")
    .filter({ hasText: "64 ferramentas autorizadas" })
    .waitFor();
  assert.equal(saves.length, 2);
  assert.equal(new Set(saves[1]).size, 64);
  assert.ok(!saves[1].includes("slack_edit_message"));
  await page.screenshot({ path: join(out, "tools-saved.png"), fullPage: true });
  await page.reload();
  await until(
    async () => (await tools.locator("input:checked").count()) === 64,
  );
  await tools
    .getByRole("button", { name: "Limpar seleção", exact: true })
    .click();
  await tools
    .getByRole("button", { name: "Salvar ferramentas de coleta", exact: true })
    .click();
  await tools
    .getByRole("status")
    .filter({ hasText: "Nenhuma ferramenta autorizada" })
    .waitFor();
  await page.reload();
  await until(
    async () => (await tools.locator("input[type=checkbox]").count()) === 66,
  );
  assert.equal(await tools.locator("input:checked").count(), 0);
  await tools
    .getByRole("button", { name: "Selecionar todas", exact: true })
    .click();
  await tools
    .getByRole("button", { name: "Salvar ferramentas de coleta", exact: true })
    .click();
  await tools
    .getByRole("status")
    .filter({ hasText: "64 ferramentas autorizadas" })
    .waitFor();

  const d = new DatabaseSync(join(data, "app.sqlite"));
  const iso = "2026-09-21T10:00:00.000Z";
  for (let i = 1; i <= 75; i++)
    d.prepare(
      "INSERT INTO capture_tasks(id,instruction,status,created,updated,access) VALUES(?,?,?,?,?,?)",
    ).run(
      `task-${i}`,
      `Coleta de teste ${i}`,
      i <= 10 ? "failed" : i >= 74 ? "queued" : "done",
      iso,
      iso,
      "{}",
    );
  const recurrence = JSON.stringify({
    frequency: "daily",
    time: "09:00",
    timezone: "America/Sao_Paulo",
    weekday: 1,
  });
  for (let i = 1; i <= 23; i++)
    d.prepare(
      "INSERT INTO capture_schedules(id,instruction,recurrence,access,enabled,nextRun,created) VALUES(?,?,?,?,?,?,?)",
    ).run(
      `schedule-${i}`,
      `Rotina de teste ${i}`,
      recurrence,
      "{}",
      0,
      "2099-01-01T12:00:00.000Z",
      iso,
    );
  d.close();
  await page.goto(base + "/?view=captures");
  await page.getByRole("tab", { name: "Coletar", exact: true }).waitFor();
  assert.ok(await page.locator(".capture-history").isHidden());
  assert.ok(await page.locator(".capture-schedules").isHidden());
  await page.screenshot({ path: join(out, "collect-tab.png"), fullPage: true });
  await page.getByRole("tab", { name: "Coletar", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .getByRole("tab", { name: /Histórico/ })
      .getAttribute("aria-selected"),
    "true",
  );
  const history = page.locator(".capture-history"),
    schedules = page.locator(".capture-schedules");
  const pages = history.getByRole("navigation", {
    name: "Paginação de coletas",
  });
  const routines = schedules.getByRole("navigation", {
    name: "Paginação de rotinas",
  });
  await pages.getByText("Página 1 de 8").waitFor();
  assert.equal(await history.locator("article").count(), 10);
  assert.ok(await pages.getByRole("button", { name: "Anterior" }).isDisabled());
  for (let i = 2; i <= 8; i++) {
    await pages.getByRole("button", { name: "Próxima" }).click();
    await pages.getByText(`Página ${i} de 8`).waitFor();
  }
  assert.equal(await history.locator("article").count(), 5);
  await history
    .getByRole("heading", { name: "Coleta de teste 1", exact: true })
    .waitFor();
  assert.ok(await pages.getByRole("button", { name: "Próxima" }).isDisabled());
  await page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("taskPage=8"),
  );
  await pages.getByText("Página 8 de 8").waitFor();
  await page.getByLabel("Filtrar coletas").selectOption("failed");
  await pages.getByText("Página 1 de 1").waitFor();
  assert.equal(await history.locator("article").count(), 10);
  await history
    .getByRole("heading", { name: "Coleta de teste 1", exact: true })
    .waitFor();
  await page.getByLabel("Filtrar coletas").selectOption("cancelled");
  await history
    .getByText("Nenhuma coleta encontrada para este filtro.")
    .waitFor();
  await page.getByLabel("Filtrar coletas").selectOption("all");
  await pages.getByText("Página 1 de 8").waitFor();
  await page.getByRole("tab", { name: "Rotinas", exact: true }).click();
  for (let i = 2; i <= 3; i++) {
    await routines.getByRole("button", { name: "Próxima" }).click();
    await routines.getByText(`Página ${i} de 3`).waitFor();
  }
  assert.equal(await schedules.locator("article").count(), 3);
  assert.ok(await pages.getByText("Página 1 de 8").isHidden());
  const oldest = schedules.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Rotina de teste 1",
      exact: true,
    }),
  });
  await oldest.getByRole("button", { name: "Editar agendamento" }).click();
  await page.getByLabel("Instrução de coleta").fill("Rotina antiga editada");
  await page
    .getByRole("button", { name: "Salvar agendamento", exact: true })
    .click();
  await page
    .locator(".toast")
    .filter({ hasText: "Agendamento salvo." })
    .waitFor();
  await schedules
    .getByRole("heading", { name: "Rotina antiga editada" })
    .waitFor();
  await routines.getByText("Página 3 de 3").waitFor();
  page.on("dialog", (dialog) => dialog.accept());
  for (const total of [22, 21, 20]) {
    await schedules
      .getByRole("button", { name: "Excluir agendamento" })
      .last()
      .click();
    await until(
      async () =>
        (await (await context.request.get(base + "/api/captures")).json())
          .pagination.schedules.total === total,
    );
    await page
      .locator(".toast")
      .filter({ hasText: "Agendamento excluído." })
      .waitFor();
    await until(
      async () =>
        (await schedules.locator(".count").textContent()) === String(total),
    );
  }
  await routines.getByText("Página 2 de 2").waitFor();
  assert.equal(await schedules.locator("article").count(), 10);
  await routines.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, "pagination-desktop.png") });
  await page.setViewportSize({ width: 1280, height: 520 });
  assert.equal(await page.locator(".memory-flow").count(), 0);
  const configuration = page
    .locator(".sidebar")
    .getByRole("button", { name: "Configuração", exact: true });
  await configuration.scrollIntoViewIfNeeded();
  const configBox = await configuration.boundingBox();
  assert.ok(
    configBox && configBox.y >= 0 && configBox.y + configBox.height <= 520,
  );
  await page.screenshot({ path: join(out, "sidebar-short-screen.png") });
  await page.setViewportSize({ width: 390, height: 900 });
  await routines.scrollIntoViewIfNeeded();
  const box = await routines.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
  await page.screenshot({ path: join(out, "pagination-mobile.png") });
  await page.goto(base + "/?view=connections");
  await until(
    async () => (await tools.locator("input:checked").count()) === 64,
  );
  await tools
    .getByRole("button", { name: "Limpar seleção", exact: true })
    .click();
  await tools
    .getByRole("button", { name: "Selecionar todas", exact: true })
    .click();
  assert.equal(await tools.locator("input:checked").count(), 64);
  await tools
    .getByRole("button", { name: "Salvar ferramentas de coleta", exact: true })
    .click();
  await tools
    .getByRole("status")
    .filter({ hasText: "64 ferramentas autorizadas" })
    .waitFor();
  await until(async () => {
    const feedback = await tools
      .locator(".tool-save-feedback .notice")
      .boundingBox();
    return feedback && feedback.y >= 0 && feedback.y + feedback.height <= 900;
  });
  await page.screenshot({ path: join(out, "tools-mobile.png") });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      tasks: 75,
      schedules: 23,
      bulkTools: 64,
      saveFeedback: true,
      saveFailure: true,
      mobile: true,
      screenshots: out,
    }),
  );
} catch (e) {
  console.error(
    await page
      ?.locator(".tool-save-feedback .notice")
      .evaluate((el) => ({
        rect: el.getBoundingClientRect().toJSON(),
        scrollY,
        height: innerHeight,
      }))
      .catch(() => null),
  );
  await page
    ?.screenshot({ path: join(out, "failure-viewport.png") })
    .catch(() => {});
  await page
    ?.screenshot({ path: join(out, "failure.png"), fullPage: true })
    .catch(() => {});
  throw e;
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
}

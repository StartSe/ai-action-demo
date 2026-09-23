import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const data = mkdtempSync(join(tmpdir(), "daily-processing-"));
const out = process.env.TEST_ARTIFACTS || "/tmp/daily-processing-review";
const controlPath = join(data, "control.json");
const port = process.env.TEST_PORT || "3358",
  base = `http://127.0.0.1:${port}`;
mkdirSync(out, { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
const control = (value) => writeFileSync(controlPath, JSON.stringify(value));
control({ delay: 8000 });
let server,
  logs = "",
  browser,
  page;
const errors = [];
async function until(fn, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error("Condition timed out");
}
async function start() {
  server = spawn(
    process.execPath,
    [
      "--import",
      resolve("tests/fixtures/organization-server-hook.mjs"),
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
        BRAIN_WORKER_DISABLED: "",
        BRAIN_TEST_CONTROL: controlPath,
        NODE_OPTIONS: "",
        BRAIN_PROVIDER: "",
        OPENROUTER_API_KEY: "",
        OPENROUTER_MODEL: "",
        ZAPIER_MCP_URL: "",
        ZAPIER_MCP_TOKEN: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (d) => (logs += d));
  server.stderr.on("data", (d) => (logs += d));
  await until(async () => {
    if (server.exitCode !== null) throw Error(logs);
    try {
      return (await fetch(base + "/api/health")).ok;
    } catch {
      return false;
    }
  });
}
async function stop() {
  if (server?.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGKILL");
    await exited;
  }
}
try {
  await start();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    reducedMotion: "reduce",
  });
  const newPage = async () => {
    page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
  };
  await newPage();
  const unauthorized = await context.request.get(base + "/api/brain");
  assert.equal(unauthorized.status(), 401);
  await page.goto(base);
  await page.getByLabel("Seu nome").fill("Exploradora");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("processing@example.test");
  await page.locator("input[name=senha]").fill("TesteBrain!2026");
  await page.getByLabel("Confirmar senha").fill("TesteBrain!2026");
  await page.getByRole("button", { name: "Criar meu segundo cérebro" }).click();
  await page
    .getByRole("heading", { name: "Sua memória começa aqui." })
    .waitFor();
  assert.equal(
    (
      await context.request.put(base + "/api/settings", {
        data: { BRAIN_PROVIDER: "openrouter", OPENROUTER_API_KEY: "test-key" },
      })
    ).status(),
    200,
  );
  const post = async (data) => {
    const response = await context.request.post(base + "/api/brain", { data });
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const state = async () =>
    (await context.request.get(base + "/api/brain")).json();
  const capture = (title) =>
    post({
      action: "capture",
      title,
      content: `Decisão para organizar: ${title}.`,
    });
  const a = await capture("Planejamento da semana"),
    b = await capture("Aprendizados da equipe");
  await page.goto(base + "/?view=raw");
  await page.getByLabel("Selecionar fontes pendentes desta página").check();
  // A rejected enqueue preserves the selection and offers actionable feedback.
  await page.route("**/api/brain", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Fila indisponível no teste. Tente novamente.",
          }),
        })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Organizar selecionadas (2)" })
    .click();
  await page
    .getByText("Fila indisponível no teste. Tente novamente.")
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Selecionar fontes pendentes desta página")
      .isChecked(),
    true,
  );
  await page.unroute("**/api/brain");
  await page
    .getByRole("button", { name: "Organizar selecionadas (2)" })
    .click();
  const panel = () =>
    page.getByRole("region", { name: "Processamento das memórias" });
  await panel().waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await panel().getByText("Acompanhar fontes", { exact: true }).click();
  await until(async () =>
    Object.values((await state()).sourceProcessing).some(
      (j) => j.status === "running",
    ),
  );
  await page.locator(".source-open").filter({ hasText: a.title }).click();
  await page
    .getByText(
      "Processamento em segundo plano. Pode fechar este modal e acompanhar no painel.",
    )
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("button", { name: "Conversar", exact: true }).click();
  await page
    .getByLabel("Mensagem para Daily")
    .fill("Posso continuar enquanto organiza");
  assert.equal(
    await page.getByRole("button", { name: "Enviar mensagem" }).isEnabled(),
    true,
  );
  await page.screenshot({
    path: join(out, "background-desktop.png"),
    fullPage: true,
  });
  await page.close();
  await until(async () => {
    const s = await state();
    return [a.id, b.id].every((id) => s.sourceProcessing[id].status === "done");
  });
  await newPage();
  await page.goto(base + "/?view=raw");
  await panel().getByText("Memórias organizadas com sucesso").waitFor();
  await panel().getByText("Acompanhar fontes", { exact: true }).click();
  await panel()
    .locator(`[data-processing-id="${a.id}"]`)
    .getByRole("button", { name: "Abrir na wiki" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Editar", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await panel().getByRole("button", { name: "Limpar concluídas" }).click();
  await panel().waitFor({ state: "hidden" });
  control({ delay: 1000, fail: true });
  const failed = await capture("Falha controlada");
  await page.reload();
  await page
    .getByRole("button", { name: "Organizar Falha controlada", exact: true })
    .click();
  await panel().getByText("Algumas fontes precisam de atenção").waitFor();
  await page
    .locator(".toast-error")
    .filter({ hasText: "não puderam ser organizadas" })
    .waitFor();
  await page.reload();
  await page.getByLabel("Filtrar fontes").selectOption("organization-failed");
  await page
    .locator(".source-error")
    .filter({ hasText: "estrutura válida" })
    .waitFor();
  await panel()
    .getByText(/Acompanhar fontes/)
    .click();
  control({ delay: 1000, fail: false });
  await panel()
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await panel().getByText("Memórias organizadas com sucesso").waitFor();
  assert.equal((await state()).sourceProcessing[failed.id].status, "done");
  await page.route("**/api/brain", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"offline"}',
        })
      : route.continue(),
  );
  await panel()
    .getByText(/Não foi possível atualizar o progresso/)
    .waitFor();
  await page.unroute("**/api/brain");
  await panel().getByRole("button", { name: "Atualizar agora" }).click();
  await panel()
    .getByText(/Não foi possível atualizar o progresso/)
    .waitFor({ state: "hidden" });
  control({ delay: 30000 });
  const restart = await capture("Continua após reiniciar");
  await page.getByLabel("Filtrar fontes").selectOption("all");
  await page.reload();
  await page.locator(".source-open").filter({ hasText: restart.title }).click();
  await page
    .getByRole("button", { name: "Organizar na wiki", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await until(
    async () =>
      (await state()).sourceProcessing[restart.id].status === "running",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await panel()
    .getByText(/Acompanhar fontes/)
    .click();
  await page.screenshot({
    path: join(out, "background-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.close();
  await stop();
  // Simulate the lease expiring during downtime, then boot with the same SQLite file.
  const d = new DatabaseSync(join(data, "app.sqlite"));
  d.prepare(
    "UPDATE organization_jobs SET leaseUntil='2000-01-01' WHERE sourceId=?",
  ).run(restart.id);
  d.close();
  control({ delay: 0 });
  await start();
  await until(
    async () => (await state()).sourceProcessing[restart.id].status === "done",
  );
  const final = await state();
  assert.equal(final.sourceProcessing[restart.id].attempts, 2);
  assert.equal(
    final.notes.filter(
      (n) => n.kind === "wiki" && n.sources.includes(restart.id),
    ).length,
    1,
  );
  assert.equal(
    (await (await fetch(base + "/api/health")).json()).version,
    "1.5.0",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "bulk enqueue without modal",
        "enqueue failure keeps selection",
        "modal closes during AI call",
        "navigation stays available",
        "tab close and reload",
        "persistent failure and retry",
        "poll failure and recovery",
        "mobile layout",
        "server restart without browser",
        "no duplicate wiki",
        "v1.5.0 health",
      ],
      screenshots: out,
    }),
  );
} catch (e) {
  console.error(logs);
  await page
    ?.screenshot({ path: join(out, "failure.png"), fullPage: true })
    .catch(() => {});
  throw e;
} finally {
  await browser?.close();
  await stop();
}

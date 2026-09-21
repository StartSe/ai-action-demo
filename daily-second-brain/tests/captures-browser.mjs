import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = process.cwd(),
  data = mkdtempSync(join(tmpdir(), "daily-agentic-browser-"));
const port = Number(process.env.TEST_PORT || 3341),
  base = `http://127.0.0.1:${port}`;
const out = process.env.TEST_ARTIFACTS || "/tmp/daily-agentic-review";
mkdirSync(out, { recursive: true });
cpSync(resolve("public"), resolve(".next/standalone/public"), {
  recursive: true,
});
cpSync(resolve(".next/static"), resolve(".next/standalone/.next/static"), {
  recursive: true,
});
let server, browser, page;
let logs = "";
const errors = [];
async function start() {
  server = spawn(
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
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        DATA_DIR: data,
        BRAIN_PROVIDER: "",
        OPENROUTER_API_KEY: "",
        OPENROUTER_MODEL: "",
        ZAPIER_MCP_URL: "",
        ZAPIER_MCP_TOKEN: "",
        BRAIN_WORKER_DISABLED: "",
        CONTA_DESLIGADA: "",
        BRAIN_TEST_TRACE: join(data, "calls.jsonl"),
        NODE_OPTIONS: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (x) => {
    logs += x;
  });
  server.stderr.on("data", (x) => {
    logs += x;
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error("Server exited: " + logs);
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error("Server did not start: " + logs);
}
async function stop() {
  if (server?.exitCode === null) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
}
async function waitFor(fn, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Condition timed out");
}
function track(p) {
  p.on("pageerror", (e) => errors.push(e.message));
}
try {
  await start();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1060 },
    reducedMotion: "reduce",
    timezoneId: "America/Sao_Paulo",
  });
  for (const path of ["/api/captures", "/api/onboarding"])
    assert.equal((await context.request.get(base + path)).status(), 401);
  page = await context.newPage();
  track(page);
  await page.goto(base);
  await page.getByLabel("Seu nome").fill("Exploradora");
  await page.getByLabel("E-mail", { exact: true }).fill("capture@example.test");
  await page.locator("input[name=senha]").fill("TesteBrain!2026");
  await page.getByLabel("Confirmar senha").fill("TesteBrain!2026");
  await page.getByRole("button", { name: "Criar meu segundo cérebro" }).click();
  await page
    .getByRole("heading", { name: "Sua memória começa aqui." })
    .waitFor();
  await page.screenshot({
    path: join(out, "onboarding-ai.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "OpenRouter · modelos" }).click();
  await page.getByLabel("Chave do OpenRouter").fill("test-key");
  await page.getByRole("button", { name: "Salvar OpenRouter" }).click();
  const aiNext = page.getByRole("button", { name: "Testar IA e continuar" });
  await waitFor(() => aiNext.isEnabled());
  await aiNext.click();
  await page
    .getByRole("heading", { name: "Traga o contexto do seu dia." })
    .waitFor();
  await page
    .getByLabel("URL do servidor")
    .fill("https://mcp.zapier.com/api/mcp/s/browser-fixture");
  await page.getByRole("button", { name: "Salvar conexão" }).click();
  const readTool = page.getByRole("checkbox", {
    name: /Slack · Ler mensagens do canal/,
  });
  await readTool.waitFor();
  assert.ok(await readTool.isChecked());
  assert.ok(
    await page
      .getByRole("checkbox", { name: /slack send message/ })
      .isDisabled(),
  );
  assert.ok(
    await page
      .getByRole("checkbox", { name: /Slack: Edit Message/ })
      .isDisabled(),
  );
  const slackReads = [
    "Slack: Find Public Channel",
    "Slack: Retrieve Thread Messages",
    "Slack: Get Message by Timestamp",
  ];
  for (const name of slackReads) {
    const checkbox = page.getByRole("checkbox", { name: new RegExp(name) });
    assert.ok(await checkbox.isEnabled());
    assert.ok(!(await checkbox.isChecked()));
    await checkbox.check();
  }
  await page
    .getByRole("button", { name: "Salvar ferramentas de coleta" })
    .click();
  await page.getByText("Ferramentas de coleta salvas.").waitFor();
  await page.getByRole("button", { name: "Atualizar ferramentas" }).click();
  await page
    .getByText("Conexão verificada. Escolha as leituras que Daily pode usar.")
    .waitFor();
  for (const name of slackReads)
    assert.ok(
      await page.getByRole("checkbox", { name: new RegExp(name) }).isChecked(),
    );
  await page.screenshot({ path: join(out, "slack-tools.png"), fullPage: true });
  const next = page.getByRole("button", { name: "Continuar", exact: true });
  await waitFor(() => next.isEnabled());
  await next.click();
  await page
    .getByRole("heading", { name: "Uma memória com seus princípios." })
    .waitFor();
  await page
    .getByLabel("Regras iniciais da memória")
    .fill(
      "# Minha memória\nPreservar decisões, responsáveis e fontes. Identificar hipóteses.",
    );
  await page.getByRole("button", { name: "Salvar regras e continuar" }).click();
  await page
    .getByRole("heading", { name: "Agora, dê a primeira missão." })
    .waitFor();
  await page.getByRole("button", { name: "Usar exemplo do Slack" }).click();
  await page.screenshot({
    path: join(out, "onboarding-first-capture.png"),
    fullPage: true,
  });
  const queuedResponse = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/captures" &&
      r.request().method() === "POST" &&
      r.request().postDataJSON().action === "create",
  );
  await page.getByRole("button", { name: "Coletar e organizar" }).click();
  const queued = await (await queuedResponse).json();
  assert.equal(queued.status, "queued");
  await page
    .getByRole("heading", { name: "Deixe as informações virem até você." })
    .waitFor();
  await page.close();
  // There is no page, polling client or request to awaken the worker here.
  await new Promise((r) => setTimeout(r, 7000));
  const collected = await (
    await context.request.get(base + "/api/captures?id=" + queued.id)
  ).json();
  assert.equal(collected.status, "done", collected.error);
  assert.equal(collected.sources.length, 1);
  assert.equal(collected.pages.length, 1);
  const brain = await (await context.request.get(base + "/api/brain")).json();
  assert.ok(brain.rules.includes("Identificar hipóteses"));
  assert.ok(
    brain.notes
      .find((n) => n.id === collected.pages[0])
      .content.includes("C04KTMS2GEL"),
  );
  assert.equal(
    (await (await context.request.get(base + "/api/onboarding")).json()).status,
    "complete",
  );
  page = await context.newPage();
  track(page);
  await page.goto(base + "/?view=captures");
  await page.getByText("Concluída", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Decisões de tech-academy", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("button", { name: "Repetir instrução", exact: true })
    .click();
  await waitFor(async () => {
    const s = await (await context.request.get(base + "/api/captures")).json();
    return s.tasks.length === 2 && s.tasks.every((t) => t.status === "done");
  });
  await page
    .getByRole("button", { name: "Agendar", exact: true })
    .first()
    .click();
  await page.getByLabel("Repetir", { exact: true }).selectOption("daily");
  await page.getByLabel("Horário", { exact: true }).fill("09:00");
  await page.getByLabel("Fuso horário").fill("America/Sao_Paulo");
  await page
    .getByRole("button", { name: "Criar agendamento", exact: true })
    .click();
  await page.getByRole("button", { name: "Pausar rotina" }).waitFor();
  await page.getByRole("button", { name: "Pausar rotina" }).click();
  await page.getByRole("button", { name: "Retomar rotina" }).waitFor();
  let state = await (await context.request.get(base + "/api/captures")).json();
  assert.equal(state.schedules[0].enabled, false);
  await page.getByRole("button", { name: "Retomar rotina" }).click();
  await page.getByRole("button", { name: "Pausar rotina" }).waitFor();
  await page
    .getByRole("button", { name: "Editar agendamento", exact: true })
    .click();
  await page.getByLabel("Repetir", { exact: true }).selectOption("weekdays");
  await page.getByRole("button", { name: "Salvar agendamento" }).click();
  await page.getByText(/Agendamento salvo/).waitFor();
  await page
    .getByRole("button", { name: "Fechar edição do agendamento" })
    .click();
  await page.screenshot({
    path: join(out, "captures-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: join(out, "captures-mobile.png"),
    fullPage: true,
  });
  await page.close();
  await stop();
  const database = new DatabaseSync(join(data, "app.sqlite"));
  database
    .prepare("UPDATE capture_schedules SET nextRun=?")
    .run(new Date(Date.now() - 3 * 86400000).toISOString());
  database.close();
  await start();
  await new Promise((r) => setTimeout(r, 7000));
  state = await (await context.request.get(base + "/api/captures")).json();
  const scheduled = state.tasks.filter((t) => t.scheduleId);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].status, "done", scheduled[0].error);
  assert.equal(state.schedules[0].recurrence.frequency, "weekdays");
  assert.ok(Date.parse(state.schedules[0].nextRun) > Date.now());
  assert.equal(
    (await (await context.request.get(base + "/api/onboarding")).json()).status,
    "complete",
  );
  const attack = await context.request.post(base + "/api/captures", {
    headers: { Origin: "https://other.example" },
    data: { action: "create", instruction: "attack" },
  });
  assert.equal(attack.status(), 403);
  const calls = readFileSync(join(data, "calls.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(calls.length, 3);
  assert.ok(
    calls.every(
      (c) =>
        c.tool === "slack_channel_history" &&
        c.args.channel === "C04KTMS2GEL" &&
        c.args.limit === 4,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      onboarding: "complete",
      closedTabCollection: collected.status,
      repeated: true,
      scheduleAfterRestart: scheduled[0].status,
      reads: calls.length,
      screenshots: out,
      data,
      root,
    }),
  );
} catch (e) {
  if (page && !page.isClosed()) {
    await page
      .screenshot({ path: join(out, "failure.png"), fullPage: true })
      .catch(() => {});
    console.error(
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  console.error(logs.slice(-6000));
  throw e;
} finally {
  await browser?.close();
  await stop();
}

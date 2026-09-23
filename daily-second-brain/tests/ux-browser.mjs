import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const data = mkdtempSync(join(tmpdir(), "daily-ux-"));
const out = process.env.TEST_ARTIFACTS || "/tmp/daily-ux-review";
const port = process.env.TEST_PORT || "3347";
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
      BRAIN_WORKER_DISABLED: "",
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
    await page
      .getByRole("navigation", { name: "Menu principal" })
      .getByRole("button")
      .count(),
    4,
  );
  assert.equal(
    await page
      .getByRole("navigation", { name: "Etapas da configuração" })
      .getByRole("button")
      .count(),
    3,
  );
  await page.getByRole("button", { name: "OpenRouter · modelos" }).click();
  await page.getByLabel("Chave do OpenRouter").fill("test-key");
  await page.getByRole("button", { name: "Salvar OpenRouter" }).click();
  await page.getByRole("button", { name: "Testar IA e continuar" }).click();
  await page.getByRole("heading", { name: "Comece com um texto" }).waitFor();
  assert.equal(await page.getByLabel("URL do servidor").isVisible(), false);
  await page.screenshot({
    path: join(out, "setup-simple.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Inserir meu primeiro texto" })
    .click();
  await page
    .getByLabel("Um título para reencontrar")
    .fill("Minha primeira memória");
  await page
    .getByLabel("Conteúdo", { exact: true })
    .fill("Decidimos testar o novo fluxo na segunda-feira.");
  await page.getByRole("button", { name: "Guardar na memória" }).click();
  await page
    .locator(".source-open")
    .filter({ hasText: "Minha primeira memória" })
    .click();
  await page.getByRole("button", { name: "Organizar na wiki" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Abrir na wiki", exact: true })
    .click();
  await page.getByRole("button", { name: "Editar", exact: true }).waitFor();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  assert.equal(
    (await (await context.request.get(base + "/api/onboarding")).json()).status,
    "complete",
  );
  assert.equal(await page.locator(".inbox-table .danger-text").count(), 0);
  const post = async (data) => {
    const response = await context.request.post(base + "/api/brain", { data });
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const messages = Array.from({ length: 10 }, (_, i) => ({
    user: `U${i + 1}`,
    text: `Mensagem ${i + 1}: decisão da equipe e próximo passo ${i + 1}.`,
    ts: `178998000${i}.000001`,
  }));
  const legacy = await post({
    action: "capture",
    title: "Coleta · Obter as 10 últimas mensagens do Slack",
    tags: ["coleta", "zapier"],
    content: `## Instrução da coleta\nObter as 10 últimas mensagens do Slack nps-live\n\n## Origem\nFerramenta: slack_channel_history\n\n## Conteúdo original\n${JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ messages }) }] })}`,
  });
  const sibling = await post({
    action: "capture",
    title: "Outra leitura da mesma coleta",
    content: "Outro resultado pendente",
  });
  const d = new DatabaseSync(join(data, "app.sqlite"));
  const iso = new Date().toISOString();
  for (const [id, status] of [
    ["ux-failed", "failed"],
    ["ux-queued", "queued"],
  ]) {
    d.prepare(
      "INSERT INTO capture_tasks(id,instruction,status,created,updated,access) VALUES(?,?,?,?,?,?)",
    ).run(id, `Pedido ${id}`, status, iso, iso, "{}");
    d.prepare(
      "INSERT INTO capture_events(taskId,created,attempt,stage,level,message) VALUES(?,?,?,?,?,?)",
    ).run(id, iso, 1, "Teste", "info", "Evento da coleta");
  }
  d.prepare(
    "UPDATE capture_tasks SET status='running',owner='fixture',leaseUntil='2099-01-01' WHERE id='ux-queued'",
  ).run();
  for (const n of [legacy, sibling])
    d.prepare(
      "INSERT INTO capture_steps(taskId,key,name,args,content,sourceId,created) VALUES(?,?,?,?,?,?,?)",
    ).run("ux-failed", n.id, "slack_channel_history", "{}", "", n.id, iso);
  await page.reload();
  await page
    .locator(".source-open")
    .filter({ hasText: "Slack · 10 mensagens" })
    .click();
  assert.equal(await page.locator(".message-table tbody tr").count(), 10);
  await page
    .getByText("Mensagem 10: decisão da equipe e próximo passo 10.", {
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: join(out, "slack-messages.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Excluir fonte", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Excluir estes itens?" })
    .getByText("2 fonte(s) pendente(s)", { exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("dialog", { name: "Excluir estes itens?" })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByLabel("Filtrar fontes").selectOption("failed");
  assert.equal(await page.locator(".inbox-table tbody tr").count(), 2);
  await page
    .getByRole("button", { name: "Excluir Slack · 10 mensagens", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Excluir estes itens?" });
  await dialog.getByText("2 fonte(s) pendente(s)", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Manter itens" }).click();
  assert.ok(d.prepare("SELECT id FROM notes WHERE id=?").get(legacy.id));
  await page
    .getByRole("button", { name: "Excluir Slack · 10 mensagens", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Excluir definitivamente" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    d.prepare("SELECT id FROM capture_tasks WHERE id='ux-failed'").get(),
    undefined,
  );
  for (const n of [legacy, sibling]) {
    assert.equal(
      d.prepare("SELECT id FROM notes WHERE id=?").get(n.id),
      undefined,
    );
    assert.equal(
      d.prepare("SELECT note_id FROM revisions WHERE note_id=?").get(n.id),
      undefined,
    );
    assert.equal(existsSync(join(data, "vault/raw", n.id + ".md")), false);
  }
  assert.equal(
    d
      .prepare("SELECT taskId FROM capture_events WHERE taskId='ux-failed'")
      .get(),
    undefined,
  );
  await page
    .getByRole("button", { name: "Coletas e rotinas", exact: true })
    .click();
  await page.getByRole("tab", { name: /Histórico/ }).click();
  await page
    .locator("[data-task-id=ux-queued]")
    .getByRole("button", { name: "Excluir coleta" })
    .click();
  await dialog.getByText(/serão interrompidas/).waitFor();
  await dialog.getByRole("button", { name: "Excluir definitivamente" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    d.prepare("SELECT id FROM capture_tasks WHERE id='ux-queued'").get(),
    undefined,
  );
  for (let i = 1; i <= 18; i++)
    await post({
      action: "capture",
      title: `Nota para revisar ${i}`,
      content: `Decisão ${i}: revisar a experiência da entrada.`,
    });
  // Keep one legacy Slack collection to visually review the compact table.
  await post({
    action: "capture",
    title: legacy.title,
    content: legacy.content,
    tags: legacy.tags,
  });
  await page.goto(base + "/?view=raw");
  await page
    .getByRole("heading", { name: "Caixa de entrada", exact: true })
    .waitFor();
  assert.equal(await page.locator(".inbox-table tbody tr").count(), 15);
  await page.screenshot({
    path: join(out, "inbox-desktop.png"),
    fullPage: true,
  });
  await page.getByLabel("Buscar nas fontes").fill("Nota para revisar 18");
  assert.equal(await page.locator(".inbox-table tbody tr").count(), 1);
  await page.getByLabel("Buscar nas fontes").fill("");
  await page
    .getByRole("navigation", { name: "Paginação das fontes" })
    .getByRole("button", { name: "Próxima" })
    .click();
  await page.getByLabel("Selecionar fontes pendentes desta página").check();
  await page.getByRole("button", { name: "Excluir selecionadas" }).click();
  await dialog.getByRole("button", { name: "Excluir definitivamente" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page
    .getByRole("button", { name: "Mapa da memória", exact: true })
    .click();
  await page.getByRole("heading", { name: "O mapa da sua memória." }).waitFor();
  await page.getByRole("button", { name: "Artefatos", exact: true }).click();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page
    .getByRole("button", { name: "Regras da memória", exact: true })
    .click();
  await page.getByLabel("Regras da memória").waitFor();
  await page.getByRole("button", { name: /^Entrada/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(out, "inbox-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    JSON.stringify(
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter(
            (e) =>
              e.getBoundingClientRect().right > innerWidth &&
              getComputedStyle(e).position !== "fixed",
          )
          .map((e) => ({
            tag: e.tagName,
            cls: e.className,
            right: e.getBoundingClientRect().right,
            overflow: getComputedStyle(e).overflowX,
          }))
          .slice(0, 30),
      ),
    ),
  );
  const table = page.locator(".table-scroll");
  assert.ok(await table.evaluate((e) => e.scrollWidth > e.clientWidth));
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.screenshot({ path: join(out, "menu-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Conversar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Uma conversa com sua memória." })
    .waitFor();
  assert.equal(await page.locator(".sidebar.visible").count(), 0);
  assert.deepEqual(errors, []);
  d.close();
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "three-step setup",
        "manual first memory and wiki",
        "grouped navigation",
        "legacy Slack 10-message table",
        "cascade with cancel and confirmation",
        "queue deletion",
        "bulk deletion and pagination",
        "mobile layout",
      ],
      screenshots: out,
    }),
  );
} catch (e) {
  console.error(logs);
  console.error(errors);
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

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3320";
const out = process.env.TEST_ARTIFACTS || "/tmp/daily-brain-review";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  const unauthorized = await context.request.get(base + "/api/brain");
  assert.equal(unauthorized.status(), 401);
  await page.goto(base);
  console.log("Loaded", page.url());
  const account = await (await context.request.get(base + "/api/conta")).json();
  if (!account.existe) {
    await page.getByLabel("Seu nome").fill("Exploradora");
    await page.getByLabel("E-mail", { exact: true }).fill("brain@example.test");
    await page.locator("input[name=senha]").fill("TesteBrain!2026");
    await page.getByLabel("Confirmar senha").fill("TesteBrain!2026");
    await page
      .getByRole("button", { name: "Criar meu segundo cérebro" })
      .click();
  } else {
    await page.getByLabel("E-mail", { exact: true }).fill("brain@example.test");
    await page.locator("input[name=senha]").fill("TesteBrain!2026");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
  }
  console.log("Auth submitted");
  await page.waitForFunction(() =>
    /Sua mente,|Sua memória começa aqui/.test(
      document.querySelector("h1")?.textContent || "",
    ),
  );
  if (
    await page
      .getByRole("heading", { name: "Sua memória começa aqui." })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Continuar depois", exact: true })
      .click();
  await page.getByRole("heading", { name: "Sua mente, expandida." }).waitFor();
  console.log("Home ready");
  await page.getByRole("button", { name: "Explorar com um exemplo" }).click();
  await page.getByText("Você está explorando memórias de exemplo.").waitFor();
  await page.screenshot({
    path: out + "/desktop.png",
    fullPage: true,
    timeout: 10000,
  });
  await page
    .getByRole("button", { name: "Gestão do conhecimento", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: out + "/wiki.png" });
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const area = page.getByLabel("Conteúdo em Markdown");
  const original = await area.inputValue();
  await area.fill(original + "\n\nRevisão de teste preservada.");
  await page.getByRole("button", { name: "Salvar versão" }).click();
  await page
    .getByText("Revisão de teste preservada.", { exact: false })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Versões", exact: true }).click();
  await page.getByText("Histórico preservado", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Restaurar", exact: true }).click();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: /^Entrada/ }).click();
  await page
    .locator("button.source-open")
    .filter({ hasText: "Reflexão · menos informação" })
    .click();
  await page.getByRole("button", { name: "Organizar na wiki" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Abrir na wiki", exact: true })
    .click({ timeout: 60000 });
  await page.getByRole("button", { name: "Editar", exact: true }).waitFor();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Conversar", exact: true }).click();
  await page.getByLabel("Mensagem para Daily").fill("Que conexões você vê?");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await page
    .getByText("Explorando a memória de exemplo", { exact: true })
    .waitFor({ timeout: 60000 });
  await page.screenshot({
    path: out + "/chat.png",
    fullPage: true,
    timeout: 10000,
  });
  await page
    .getByRole("button", { name: "Criar artefato", exact: true })
    .click();
  await page.getByLabel("Descreva o resultado").fill("Plano de ação da semana");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Criar artefato", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Voltar à memória" })
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Voltar à memória" }).click();
  await page.getByRole("button", { name: "Organizar na wiki" }).waitFor();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page
    .getByRole("button", { name: "Regras da memória", exact: true })
    .click();
  await page
    .getByLabel("Regras da memória")
    .fill("# Minhas regras\n\nSempre preservar decisões e fontes.");
  await page.getByRole("button", { name: "Salvar regras" }).click();
  await page
    .getByText("Regras da memória atualizadas.", { exact: true })
    .waitFor();
  const exported = await context.request.get(base + "/api/export");
  assert.equal(exported.status(), 200);
  assert.equal(exported.headers()["content-type"], "application/zip");
  await page
    .getByRole("button", { name: "Capturar memória", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inserir texto", exact: true })
    .click();
  await page
    .getByLabel("Um título para reencontrar")
    .fill("Memória real de teste");
  await page
    .getByLabel("Conteúdo", { exact: true })
    .fill(
      "O piloto deve começar na segunda-feira. Responsável: equipe de produto.",
    );
  await page.getByRole("button", { name: "Guardar na memória" }).click();
  await page
    .locator("button.source-open, button.note-card")
    .filter({ hasText: "Memória real de teste" })
    .waitFor();
  await page.getByLabel("Buscar na memória").fill("segunda-feira");
  await page
    .locator("button.source-open, button.note-card")
    .filter({ hasText: "Memória real de teste" })
    .waitFor();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  const state = await (await context.request.get(base + "/api/brain")).json();
  assert.ok(state.notes.find((n) => n.title === "Memória real de teste"));
  assert.ok(state.messages.length === 2);
  assert.ok(
    state.notes.some(
      (n) => n.kind === "outputs" && n.title === "Plano de ação da semana",
    ),
  );
  const attack = await context.request.post(base + "/api/brain", {
    headers: { Origin: "https://other.example" },
    data: { action: "capture", title: "blocked", content: "x" },
  });
  assert.equal(attack.status(), 403);
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByRole("button", { name: "Conexões", exact: true }).click();
  await page
    .getByRole("heading", { name: "Mais conexões. Mais contexto." })
    .waitFor();
  await page
    .getByText("Não conectado", { exact: true })
    .waitFor({ timeout: 30000 });
  await page.screenshot({
    path: out + "/connections.png",
    fullPage: true,
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: out + "/mobile.png",
    fullPage: true,
    timeout: 10000,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page
    .getByRole("heading", { name: "Conhecimento que se conecta." })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      notes: state.notes.length,
      messages: state.messages.length,
      screenshots: out,
    }),
  );
} catch (e) {
  await page.screenshot({
    path: out + "/failure.png",
    fullPage: true,
    timeout: 10000,
  });
  console.error(await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}

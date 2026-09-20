import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const senha = "Bussola-Teste-2026!";
async function login(page: Page) {
  const conta = await (await page.request.get("/api/conta")).json();
  const r = await page.request.post(conta.existe ? "/api/conta/entrar" : "/api/conta", { data: { nome: "Gestora Teste", email: "gestora@example.test", senha, confirmarSenha: senha } });
  expect(r.ok()).toBeTruthy();
}
async function acessivel(page: Page) {
  const resultado = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(resultado.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}
test("criação de conta e login mantêm a identidade e o destino solicitado", async ({ page }, info) => {
  const conta = await (await page.request.get("/api/conta")).json();
  if (!conta.existe) {
    await page.goto("/conta");
    await expect(page.getByRole("heading", { name: "Criar sua conta" })).toBeVisible();
    await acessivel(page);
    await page.screenshot({ path: info.outputPath("criar-conta-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "Criar conta e começar" }).click();
    await expect(page.getByText("Escreva o seu nome.", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await acessivel(page);
    await page.screenshot({ path: info.outputPath("criar-conta-mobile.png"), fullPage: true });
    await page.getByLabel("Seu nome", { exact: true }).fill("Gestora Teste");
    await page.getByLabel("E-mail", { exact: true }).fill("gestora@example.test");
    await page.getByLabel("Senha", { exact: true }).fill(senha);
    await page.getByLabel("Confirmar senha", { exact: true }).fill(senha);
    await page.getByRole("button", { name: "Criar conta e começar" }).click();
    await expect(page.getByRole("heading", { name: "O futuro começa com clareza." })).toBeVisible();
  } else await login(page);
  await page.request.post("/api/conta/sair");
  await page.goto("/entrar?next=%2Fhistorico");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible();
  await acessivel(page);
  await page.screenshot({ path: info.outputPath("entrar-desktop.png"), fullPage: true });
  await page.getByLabel("E-mail", { exact: true }).fill("gestora@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-incorreta");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await acessivel(page);
  await page.screenshot({ path: info.outputPath("entrar-mobile.png"), fullPage: true });
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/historico$/);
  await expect(page.getByRole("heading", { name: "Novos olhares. Caminhos registrados." })).toBeVisible();
});

test("histórico trata vazio, falha e busca; reabre diagnóstico e impressão", async ({ page }, info) => {
  await login(page);
  await page.route("**/api/historico", (route) => route.fulfill({ json: { itens: [] } }));
  await page.goto("/historico");
  await expect(page.getByRole("heading", { name: "Sua próxima descoberta começa aqui." })).toBeVisible();
  await acessivel(page);
  await page.getByRole("link", { name: "Criar primeiro assessment", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Boas perguntas abrem caminhos." })).toBeVisible();
  await page.unroute("**/api/historico");
  await page.route("**/api/historico", (route) => route.fulfill({ status: 503, json: { error: "Falha de teste" } }));
  await page.goto("/historico");
  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível carregar" })).toBeVisible();
  await page.unroute("**/api/historico");
  const r = await page.request.post("/api/bussola", { data: { empresa: "Horizonte Layout", titulo: "Perspectiva do grupo de teste" } });
  expect(r.ok()).toBeTruthy();
  const resultado = await r.json();
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.locator(".archive-row").filter({ hasText: resultado.avaliacao.titulo })).toBeVisible();
  await acessivel(page);
  await page.screenshot({ path: info.outputPath("historico-desktop.png"), fullPage: true });
  await page.getByLabel("Buscar no histórico").fill("sem-correspondencia-123456");
  await expect(page.getByRole("heading", { name: "Nenhum diagnóstico encontrado." })).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await acessivel(page);
  await page.screenshot({ path: info.outputPath("historico-mobile.png"), fullPage: true });
  await page.locator(`.archive-row[href="/r/${resultado.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/r/${resultado.id}$`));
  await expect(page.getByRole("heading", { name: resultado.avaliacao.titulo, exact: true })).toBeVisible();
  await page.addInitScript(() => { window.print = () => {}; });
  await page.goto(`/imprimir/${resultado.id}`);
  await expect(page.locator(".print-title")).toHaveText(resultado.avaliacao.titulo);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await acessivel(page);
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: info.outputPath("impressao.png"), fullPage: true });
});

test("links ausentes e formulário indisponível têm estados consistentes", async ({ page }, info) => {
  await login(page);
  for (const [rota, titulo] of [["/pagina-ausente", "Este caminho ainda não existe."], ["/r/ausente", "Este link não existe mais"], ["/imprimir/ausente", "Este link não existe mais"], ["/f/ausente", "Este link não existe"]]) {
    await page.goto(rota);
    await expect(page.getByRole("heading", { name: titulo, exact: true })).toBeVisible();
    await acessivel(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await acessivel(page);
  }
  await expect(page.getByRole("link", { name: "Consultar histórico", exact: false })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("formulario-indisponivel-mobile.png"), fullPage: true });
});

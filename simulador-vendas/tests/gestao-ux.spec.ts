import { test, expect, type Page } from "@playwright/test";

const data = "2026-09-22T12:00:00.000Z";
const produtos = [
  { id: "p1", nome: "Plataforma de gestão comercial", descricao: "Organize oportunidades e acompanhe cada etapa da venda.", categoria: "Software", status: "pronto", materiais: 3, simulacoes: 2, criadoEm: data, atualizadoEm: data },
  { id: "p2", nome: "Formação de líderes", descricao: "Desenvolva a liderança do seu time.", categoria: "Educação", status: "rascunho", materiais: 0, simulacoes: 0, criadoEm: data, atualizadoEm: data },
];
const simulacoes = [
  { codigo: "s1", nome: "Venda consultiva para novos clientes", produtoId: "p1", produtoNome: produtos[0].nome, metodologia: "spin", dificuldade: "realista", status: "ativa", participantes: 8, sessoes: 16, notaMedia: 7.8, ultimaSessao: data, criadoEm: data, url: "http://localhost:3217/simular/s1" },
  { codigo: "s2", nome: "Objeções de preço", produtoId: "p2", produtoNome: produtos[1].nome, metodologia: "spin", dificuldade: "dificil", status: "pausada", participantes: 3, sessoes: 4, notaMedia: 5.6, ultimaSessao: data, criadoEm: data, url: "http://localhost:3217/simular/s2" },
];
const equipe = [
  { id: "u1", nome: "Ana Souza", email: "ana.souza@empresa.com", sessoes: 8, conversasReais: 2, treinos: 2, avaliadas: 8, notaMedia: 8.4, ultimaAtividade: data, origem: "link" },
  { id: "u2", nome: "João Almeida", email: "joao.almeida@empresa.com", sessoes: 0, conversasReais: 0, treinos: 0, avaliadas: 0, notaMedia: null, ultimaAtividade: null, origem: "cadastro" },
];
async function preparar(page: Page) {
  await page.route("**/api/status", r => r.fulfill({ json: { ai: true, demo: false } }));
  await page.route("**/api/produtos", r => r.fulfill({ json: { itens: produtos } }));
  await page.route("**/api/simulacoes", r => r.fulfill({ json: { itens: simulacoes } }));
  await page.route("**/api/equipe", r => r.fulfill({ json: { itens: equipe } }));
  await page.route("**/api/sessoes/pendentes", r => r.fulfill({ json: { itens: [] } }));
}

for (const largura of [1280, 390]) {
  test(`listas, filtros e popovers acessíveis em ${largura}px`, async ({ page }) => {
    await preparar(page);
    await page.setViewportSize({ width: largura, height: 900 });
    for (const [rota, titulo, busca] of [["produtos", "Produtos", "Buscar produto"], ["simulacoes", "Simulações", "Buscar treino"], ["equipe", "Equipe", "Buscar pessoa"], ["resultados", "Resultados", "Buscar resultado"]]) {
      await page.goto(`/${rota}`);
      await expect(page.getByRole("heading", { name: titulo, exact: true })).toBeVisible();
      await expect(page.getByRole("searchbox", { name: busca })).toBeVisible();
      await page.screenshot({ path: `/tmp/gestao-${rota}-${largura}.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("searchbox", { name: busca }).fill("xyz-inexistente");
      await expect(page.getByRole("button", { name: "Limpar filtros" })).toBeVisible();
      await page.getByRole("button", { name: "Limpar filtros" }).click();
      if (rota === "resultados") {
        await page.getByLabel("Ordenar resultados").selectOption("nota");
        await expect(page.locator("article").first()).toContainText(simulacoes[0].nome);
      } else {
        const botao = page.getByRole("button", { name: /Opções|Mais ações/ }).first();
        await botao.focus(); await page.keyboard.press("ArrowDown");
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        await expect(menu.getByRole("menuitem").first()).toBeFocused();
        await page.keyboard.press("End");
        await expect(menu.getByRole("menuitem").last()).toBeFocused();
        const caixa = await menu.boundingBox();
        expect(caixa!.x).toBeGreaterThanOrEqual(0); expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(largura);
        await page.screenshot({ path: `/tmp/gestao-menu-${rota}-${largura}.png`, fullPage: true });
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden(); await expect(botao).toBeFocused();
        await botao.click(); await page.getByRole("heading", { name: titulo, exact: true }).click(); await expect(menu).toBeHidden();
      }
    }
    await page.goto("/simulacoes");
    const pausada = page.locator("article").filter({ hasText: "Objeções de preço" });
    await expect(pausada.getByRole("button", { name: "Copiar link" })).toBeDisabled();
    await pausada.getByRole("button", { name: /Mais ações/ }).click();
    await expect(page.getByRole("menuitem", { name: "Copiar convite" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.goto("/equipe"); await page.getByRole("searchbox").fill("joao");
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.locator("article")).toContainText("João Almeida");
  });
}

test("falha ao carregar resultados mostra recuperação, sem confundir com lista vazia", async ({ page }) => {
  await preparar(page);
  await page.route("**/api/simulacoes", r => r.fulfill({ status: 503, json: { error: "Não foi possível carregar os resultados." } }));
  await page.goto("/resultados");
  await expect(page.getByText("Não foi possível carregar os resultados.")).toBeVisible();
  await expect(page.getByText("Nenhum treino tem conversa ainda")).toBeHidden();
  await page.route("**/api/simulacoes", r => r.fulfill({ json: { itens: simulacoes } }));
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.locator("article")).toHaveCount(2);
});

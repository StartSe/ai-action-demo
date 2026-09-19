import { test, expect } from "./fixtures";

const conhecimento = { resumo: "Programa de implementação de IA para empresas.", publico: "Líderes de empresas", beneficios: ["Automatizar processos"], diferenciais: ["Acompanhamento prático"], objecoes: ["Tempo para implementar"], concorrentes: [] };
const produto = { id: "revisao", nome: "Operação 100", categoria: "Implementação IA", descricao: "Implemente IA na sua empresa.", conhecimento, status: "rascunho", exemplo: false };

test("link e manual são exclusivos; importação mostra progresso e abre sugestões editáveis", async ({ page }) => {
  await page.route("**/api/status", r => r.fulfill({ json: { ai: true, demo: false, model: "teste" } }));
  let concluir!: () => void;
  const aguardar = new Promise<void>(r => { concluir = r; });
  await page.route("**/api/produtos", async r => {
    if (r.request().method() !== "POST") return r.fulfill({ json: { itens: [] } });
    expect(r.request().postDataJSON()).toEqual({ url: "https://example.com/" });
    await aguardar;
    return r.fulfill({ contentType: "application/x-ndjson", body: [{ etapa: "ficha" }, { etapa: "salvando" }, { produto: { ...produto, aviso: "Sugestões da IA prontas para revisão." } }].map(x => JSON.stringify(x)).join("\n") + "\n" });
  });
  let nomeSalvo = produto.nome;
  await page.route("**/api/produtos/revisao/conhecimento", r => {
    expect(r.request().postDataJSON().conhecimento.resumo).toBe("Resumo revisado pelo usuário.");
    return r.fulfill({ json: { produto: { ...produto, nome: nomeSalvo, conhecimento: r.request().postDataJSON().conhecimento, status: "pronto" } } });
  });
  await page.route("**/api/produtos/revisao", r => {
    if (r.request().method() === "PUT") { nomeSalvo = r.request().postDataJSON().nome; return r.fulfill({ json: { ...produto, nome: nomeSalvo } }); }
    return r.fulfill({ json: { produto, fontes: [{ id: "lp", tipo: "landing", origem: "https://example.com/", conteudo: "Programa de implementação de IA", criadoEm: new Date().toISOString() }] } });
  });
  await page.goto("/produtos");
  await page.getByRole("button", { name: "+ Novo produto" }).click();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Preencher manualmente/ }).click();
  await expect(page.getByLabel("Link da página de vendas")).toHaveCount(0);
  await page.getByLabel("Nome", { exact: true }).fill("Nome manual que não deve ser enviado");
  await page.getByRole("button", { name: /Importar pelo link/ }).click();
  await page.getByLabel("Link da página de vendas").fill("https://example.com/");
  await page.getByRole("button", { name: "Importar e preparar sugestões" }).click();
  await expect(page.getByRole("heading", { name: "Preparando seu produto" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/simulador-importacao-loading.png", fullPage: true });
  concluir();
  await expect(page).toHaveURL(/\/produtos\/revisao$/);
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Operação 100");
  await expect(page.getByLabel("Descrição", { exact: true })).toHaveValue("Implemente IA na sua empresa.");
  await expect(page.getByLabel("Resumo", { exact: true })).toHaveValue(conhecimento.resumo);
  await expect(page.getByLabel("Público", { exact: true })).toHaveValue(conhecimento.publico);
  await expect(page.getByLabel("Endereço da página")).toBeHidden();
  await page.getByLabel("Resumo", { exact: true }).fill("Resumo revisado pelo usuário.");
  await page.screenshot({ path: "/tmp/simulador-importacao-revisao.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Resumo", { exact: true })).toHaveValue("Resumo revisado pelo usuário.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("Nome", { exact: true }).fill("Operação revisada");
  await page.getByRole("button", { name: "Confirmar ficha", exact: true }).click();
  await expect(page.getByRole("link", { name: "Criar treino com este produto" })).toBeVisible();
  expect(nomeSalvo).toBe("Operação revisada");
});

test("manual não envia URL antiga; erro da importação permite corrigir e tentar novamente", async ({ page }) => {
  await page.route("**/api/status", r => r.fulfill({ json: { ai: true, demo: false } }));
  await page.route("**/api/produtos", r => {
    if (r.request().method() !== "POST") return r.fulfill({ json: { itens: [] } });
    const dados = r.request().postDataJSON();
    if (dados.url) return r.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ error: "Não conseguimos ler esta página." }) + "\n" });
    expect(dados).toEqual({ nome: "Manual", categoria: "", descricao: "" });
    return r.fulfill({ json: { id: "manual", nome: "Manual" } });
  });
  await page.goto("/produtos");
  await page.getByRole("button", { name: "+ Novo produto" }).click();
  await page.getByLabel("Link da página de vendas").fill("https://example.com/");
  await page.getByRole("button", { name: "Importar e preparar sugestões" }).click();
  await expect(page.getByText("Não conseguimos ler esta página.")).toBeVisible();
  await expect(page.getByLabel("Link da página de vendas")).toHaveValue("https://example.com/");
  await page.getByRole("button", { name: /Preencher manualmente/ }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Manual");
  await page.getByRole("button", { name: "Criar produto", exact: true }).click();
  await expect(page.getByRole("button", { name: "+ Novo produto" })).toBeVisible();
});

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const senha = "Bussola-Teste-2026!";
async function login(page: Page) {
  const conta = await (await page.request.get("/api/conta")).json();
  const r = await page.request.post(
    conta.existe ? "/api/conta/entrar" : "/api/conta",
    {
      data: {
        nome: "Gestora Teste",
        email: "gestora@example.test",
        senha,
        confirmarSenha: senha,
      },
    },
  );
  expect(r.ok()).toBeTruthy();
}
async function acessivel(page: Page) {
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    resultado.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
}
test("configurações compartilham o painel e mantêm navegação e conexões", async ({
  page,
}, info) => {
  await login(page);
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "Seu espaço, conectado." }),
  ).toBeVisible();
  await expect(page.locator(".sidebar-settings[aria-current]")).toHaveText(
    "Configurações",
  );
  await expect(page.getByText("0 de 3 conectadas")).toBeVisible();
  await acessivel(page);
  await page.screenshot({
    path: info.outputPath("configuracoes-desktop.png"),
    fullPage: true,
  });
  const ia = page.locator("#openrouter");
  await ia
    .locator("summary")
    .filter({ hasText: "Opções avançadas: colar uma chave" })
    .click();
  await ia
    .locator("#campo-OPENROUTER_API_KEY")
    .fill("chave-ficticia-layout-1234567890");
  await ia.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("1 de 3 conectadas")).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText("IA conectada");
  await page.reload();
  await ia
    .locator("summary")
    .filter({ hasText: "Opções avançadas: colar uma chave" })
    .click();
  await expect(ia.locator("#campo-OPENROUTER_API_KEY")).toHaveValue("");
  expect(await ia.innerText()).not.toContain(
    "chave-ficticia-layout-1234567890",
  );
  await page.route("**/api/setup/testar", (route) =>
    route.fulfill({
      json: { ok: true, mensagem: "Conexão de teste verificada." },
    }),
  );
  await ia.getByRole("button", { name: "Testar conexão" }).click();
  await expect(ia.getByRole("status")).toHaveText(
    "Conexão de teste verificada.",
  );
  await ia.getByRole("button", { name: "Desconectar", exact: true }).click();
  await expect(page.getByText("0 de 3 conectadas")).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText(
    "Modo assistido · sem IA",
  );
  const assistente = page.locator("#assistentes");
  await assistente
    .getByRole("button", { name: "Gerar acesso", exact: true })
    .click();
  await expect(
    assistente.getByText("Código (só agora)", { exact: true }),
  ).toBeVisible();
  await assistente
    .getByRole("button", { name: "Revogar", exact: true })
    .click();
  await expect(
    assistente.getByText("Código (só agora)", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Oficina de criação", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Boas perguntas abrem caminhos." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Assessments", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Cada grupo, um novo horizonte." }),
  ).toBeVisible();
});
test("configurações no celular: campos, atalhos e recuperação de falha", async ({
  page,
}, info) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/setup", (route) =>
    route.fulfill({ status: 503, json: { error: "Indisponível" } }),
  );
  await page.goto("/setup");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Não foi possível carregar",
  );
  await page.unroute("**/api/setup");
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(page.getByText("0 de 3 conectadas")).toBeVisible();
  await page.getByRole("link", { name: "Avançado", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: "Para a equipe técnica" })
    .click();
  await page
    .getByLabel("Endereço público do app")
    .fill("https://bussola.example.test");
  await page.getByRole("button", { name: "Corrigir", exact: true }).click();
  await expect(page.getByText("Salvo.", { exact: true })).toBeVisible();
  await page
    .locator("#rotinas")
    .getByLabel("Frequência")
    .selectOption("semanal");
  await expect(page.getByLabel(/^Dia da semana/)).toBeVisible();
  await page.route("**/api/rotinas", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: { error: "Não foi possível criar a rotina." },
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Criar rotina", exact: true }).click();
  await expect(
    page.getByText("Não foi possível criar a rotina.", { exact: true }),
  ).toBeVisible();
  await acessivel(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("configuracoes-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Assessments", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Cada grupo, um novo horizonte." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Seu espaço, conectado." }),
  ).toBeVisible();
});

test("falhas em acesso e rotinas ficam visíveis sem simular sucesso", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/mcp/token", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Acesso indisponível no teste." },
    }),
  );
  await page.goto("/setup");
  const assistente = page.locator("#assistentes");
  await expect(assistente.getByRole("alert")).toContainText(
    "Não foi possível carregar",
  );
  await expect(
    assistente.getByRole("button", { name: "Gerar acesso", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/mcp/token");
  await assistente.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(
    assistente.getByRole("button", { name: "Gerar acesso", exact: true }),
  ).toBeEnabled();
  await page.route("**/api/mcp/token", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: { error: "Não foi possível gerar o acesso." },
        })
      : route.continue(),
  );
  await assistente
    .getByRole("button", { name: "Gerar acesso", exact: true })
    .click();
  await expect(assistente.getByRole("alert")).toHaveText(
    "Não foi possível gerar o acesso.",
  );
  await expect(
    assistente.getByText("Código (só agora)", { exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/mcp/token");
  await assistente
    .getByRole("button", { name: "Gerar acesso", exact: true })
    .click();
  await page.route("**/api/mcp/token", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 503,
          json: { error: "Não foi possível revogar o acesso." },
        })
      : route.continue(),
  );
  await assistente
    .getByRole("button", { name: "Revogar", exact: true })
    .click();
  await expect(assistente.getByRole("alert")).toHaveText(
    "Não foi possível revogar o acesso.",
  );
  await expect(
    assistente.getByText("Código (só agora)", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/mcp/token");
  await assistente
    .getByRole("button", { name: "Revogar", exact: true })
    .click();
  await page.route("**/api/rotinas", (route) =>
    route.fulfill({
      json: {
        itens: [
          {
            id: "rotina-layout",
            tipo: "resumo",
            frequencia: "diaria",
            hora: "09:00",
            canal: "email",
            ativa: true,
          },
        ],
        tipos: [],
        destinoPadrao: "",
      },
    }),
  );
  await page.route("**/api/rotinas/rotina-layout", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Não foi possível pausar a rotina." },
    }),
  );
  await page.route("**/api/rotinas/rotina-layout/executar-agora", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Não foi possível executar a rotina." },
    }),
  );
  await page.goto("/setup#rotinas");
  await page.reload();
  const rotinas = page.locator("#rotinas");
  await rotinas.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(rotinas.getByRole("alert")).toHaveText(
    "Não foi possível pausar a rotina.",
  );
  await rotinas
    .getByRole("button", { name: "Executar agora", exact: true })
    .click();
  await expect(rotinas.getByRole("alert")).toHaveText(
    "Não foi possível executar a rotina.",
  );
});

test("navegação e campos cabem em notebook, tablet e celular estreito", async ({
  page,
}) => {
  await login(page);
  for (const [width, height] of [
    [1366, 768],
    [1024, 768],
    [768, 1024],
    [360, 800],
    [320, 720],
  ]) {
    await page.setViewportSize({ width, height });
    for (const rota of ["/", "/setup", "/historico", "/entrar"]) {
      await page.goto(rota);
      await expect(page.locator("h1")).toBeVisible();
      if (rota === "/setup")
        await expect(
          page.getByRole("heading", { name: "Notificações", exact: true }),
        ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${rota} em ${width}px`,
      ).toBeLessThanOrEqual(width);
      const fora = await page
        .locator("main input, main select, main button, main a")
        .evaluateAll((elementos) =>
          elementos
            .filter(
              (e) =>
                e.getClientRects().length &&
                getComputedStyle(e).visibility !== "hidden",
            )
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.right > innerWidth + 1 || r.left < -1;
            })
            .map((e) => e.getAttribute("aria-label") || e.textContent),
        );
      expect(fora, `${rota} em ${width}px`).toEqual([]);
    }
  }
});

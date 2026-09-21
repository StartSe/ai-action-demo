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
  await expect(page.getByText("0 de 2 conectadas")).toBeVisible();
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
  await expect(page.getByText("1 de 2 conectadas")).toBeVisible();
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
  await expect(page.getByText("0 de 2 conectadas")).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText(
    "Modo assistido · sem IA",
  );
  for (const removido of [
    "Quadro de tarefas",
    "Usar dentro do seu assistente",
    "Rotinas",
    "Notificações",
    "Para a equipe técnica",
  ]) {
    await expect(page.getByText(removido, { exact: false })).toHaveCount(0);
  }
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
  await expect(page.getByText("0 de 2 conectadas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Conectar com ChatGPT" }),
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
          page.getByRole("heading", { name: "ChatGPT", exact: true }),
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

test("ChatGPT: código, cancelamento, autorização, modelo, desconexão e falhas", async ({
  page,
  context,
}, info) => {
  await login(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let conectado = false;
  let pendente = false;
  let falhar = false;
  let provedor = "openrouter";
  let modelo = "";
  const codigo = {
    loginId: "teste",
    verificationUrl: "https://auth.openai.com/codex/device",
    userCode: "TEST-1234",
  };
  await page.route("**/api/setup", async (route) => {
    const resposta = await route.fetch();
    const original = await resposta.json();
    await route.fulfill({
      json: {
        ...original,
        pronto: provedor === "chatgpt" && conectado,
        ia: { provedor, modelo, provedorFixo: false, modeloFixo: false },
        chatgpt: {
          account: conectado
            ? {
                type: "chatgpt",
                email: "gestora@example.test",
                planType: "plus",
              }
            : null,
          login: pendente ? codigo : null,
          error: null,
          models: [{ id: "modelo-chat", name: "Modelo Chat" }],
        },
      },
    });
  });
  await page.route("**/api/ia", async (route) => {
    if (falhar)
      return route.fulfill({
        status: 503,
        json: { error: "Não foi possível salvar a preferência." },
      });
    const b = route.request().postDataJSON();
    provedor = b.provedor;
    if (b.modelo !== undefined) modelo = b.modelo;
    await route.fulfill({ json: { provedor, modelo } });
  });
  await page.route("**/api/chatgpt", async (route) => {
    if (falhar)
      return route.fulfill({
        status: 503,
        json: { error: "ChatGPT indisponível no teste." },
      });
    if (route.request().method() === "POST") {
      pendente = true;
      return route.fulfill({ json: codigo });
    }
    if (route.request().method() === "DELETE") {
      pendente = false;
      conectado = false;
      return route.fulfill({ json: { ok: true } });
    }
    await route.continue();
  });
  await page.goto("/setup");
  await page.getByRole("button", { name: "Conectar com ChatGPT" }).click();
  await expect(page.getByLabel("Código de conexão")).toHaveText("TEST-1234");
  await expect(
    page.getByRole("link", { name: "Autorizar no ChatGPT" }),
  ).toHaveAttribute("href", codigo.verificationUrl);
  await page.getByRole("button", { name: "Copiar código" }).click();
  await expect(
    page.getByRole("button", { name: "Código copiado" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    codigo.userCode,
  );
  await acessivel(page);
  await page.screenshot({
    path: info.outputPath("chatgpt-codigo.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancelar conexão" }).click();
  await expect(page.getByLabel("Código de conexão")).toHaveCount(0);
  falhar = true;
  await page.getByRole("button", { name: "Conectar com ChatGPT" }).click();
  await expect(page.locator("#chatgpt").getByRole("alert")).toHaveText(
    "ChatGPT indisponível no teste.",
  );
  falhar = false;
  await page.getByRole("button", { name: "Conectar com ChatGPT" }).click();
  await expect(page.getByLabel("Código de conexão")).toBeVisible();
  conectado = true;
  pendente = false;
  await expect(
    page.locator("#chatgpt").getByText("gestora@example.test · plus"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Usar ChatGPT", exact: true }).click();
  await expect(page.getByLabel("Conexão em uso")).toHaveValue("chatgpt");
  await expect(page.locator(".connection-pill")).toHaveText("IA conectada");
  await page.getByLabel("Modelo do ChatGPT").selectOption("modelo-chat");
  await expect(page.getByLabel("Modelo do ChatGPT")).toHaveValue("modelo-chat");
  await page.reload();
  await expect(page.getByLabel("Modelo do ChatGPT")).toHaveValue("modelo-chat");
  falhar = true;
  await page.getByRole("button", { name: "Desconectar ChatGPT" }).click();
  await expect(page.locator("#chatgpt").getByRole("alert")).toHaveText(
    "ChatGPT indisponível no teste.",
  );
  await expect(
    page.locator("#chatgpt").getByText("gestora@example.test · plus"),
  ).toBeVisible();
  falhar = false;
  await page.getByRole("button", { name: "Desconectar ChatGPT" }).click();
  await expect(
    page.getByRole("button", { name: "Conectar com ChatGPT" }),
  ).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText(
    "Modo assistido · sem IA",
  );
});

test("conexões exigem sessão e recursos removidos não executam ações", async ({
  page,
}) => {
  for (const rota of ["/api/chatgpt", "/api/ia", "/api/setup"]) {
    expect((await page.request.get(rota)).status()).toBe(401);
    expect((await page.request.post(rota, { data: {} })).status()).toBe(401);
  }
  await login(page);
  const chat = await page.request.get("/api/chatgpt");
  expect(chat.status()).toBe(200);
  expect((await chat.json()).account).toBeNull();
  for (const rota of [
    "/api/rotinas",
    "/api/rotinas/executar",
    "/api/rotinas/token",
    "/api/bussola/resumo-coleta",
    "/api/bussola/antigo/quadro",
    "/api/mcp/token",
    "/mcp",
  ]) {
    expect((await page.request.post(rota, { data: {} })).status(), rota).toBe(
      410,
    );
  }
  await page.goto("/");
  await expect(page.locator('a[href="/setup#notificacoes"]')).toHaveCount(0);
  await page.goto("/?exemplo=1");
  await expect(
    page.getByText("EXEMPLO ILUSTRATIVO · 8 RESPOSTAS FICTÍCIAS"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Plano de ação", exact: true })
    .click();
  await expect(page.getByText("Enviar próximos passos ao quadro")).toHaveCount(
    0,
  );
});

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { QUESTIONARIO_MODELO } from "../../lib/modelo";

const respostaIA = {
  questionario: { ...QUESTIONARIO_MODELO, titulo: "Proposta do Arquiteto" },
  meta: {
    demo: false,
    model: "teste",
    geradoEm: "2026-09-21",
    insumo: "contexto",
  },
};

async function preencher(page: Page) {
  await page.goto("/?tela=oficina");
  await page.getByLabel("Uma área ou time").check();
  await page.getByLabel("Nome da empresa").fill("Horizonte");
  await page.getByLabel("Nome da área").fill("Produto");
  await page.getByLabel("Título do assessment").fill("Descoberta de produto");
  await page.getByLabel("Setor da empresa").fill("Tecnologia");
  await page.getByLabel("Meta de participantes").fill("25");
  await page
    .getByLabel("Porte", { exact: false })
    .selectOption("51 a 200 pessoas");
  await page
    .getByRole("button", { name: "Criar novos produtos", exact: true })
    .click();
}

async function acessivel(page: Page) {
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(resultado.violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}

test.beforeEach(async ({ page }) => {
  const conta = await (await page.request.get("/api/conta")).json();
  const senha = "Bussola-Teste-2026!";
  const login = await page.request.post(
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
  expect(login.ok()).toBeTruthy();
});

for (const mobile of [false, true]) {
  test(`geração protege o contexto, informa demora e libera revisão em ${mobile ? "celular" : "desktop"}`, async ({
    page,
  }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install();
    const liberar = Promise.withResolvers<void>();
    let pedidos = 0;
    let contexto: Record<string, unknown> | undefined;
    await page.route("**/api/bussola/questionario", async (route) => {
      pedidos++;
      contexto = route.request().postDataJSON();
      await liberar.promise;
      await route.fulfill({ json: respostaIA });
    });
    await preencher(page);
    await page
      .getByRole("button", { name: "Construir com o Arquiteto" })
      .click();
    const progresso = page.locator(".operation-progress");
    await expect(progresso).toBeFocused();
    await expect(progresso.getByRole("status")).toContainText(
      "Construindo seu questionário",
    );
    const campos = page.getByRole("group", {
      name: "Contexto do assessment",
      exact: true,
    });
    await expect(campos).toHaveAttribute("aria-busy", "true");
    for (const controle of await campos
      .locator("input, textarea, select, button")
      .all()) {
      await expect(controle).toBeDisabled();
    }
    await page.clock.fastForward(31_000);
    await expect(progresso).toContainText("Ainda aguardamos a resposta");
    await expect(progresso.getByRole("timer")).toContainText(/0:3[1-9]/);
    expect(pedidos).toBe(1);
    expect(contexto).toMatchObject({
      grupoTipo: "area",
      grupoNome: "Produto",
      setor: "Tecnologia",
      objetivo: "Criar novos produtos",
      participantes: 25,
    });
    await acessivel(page);
    await page.screenshot({
      path: info.outputPath("geracao-em-andamento.png"),
      fullPage: true,
    });
    liberar.resolve();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Questionário criado com IA" }),
    ).toBeVisible();
    await expect(page.locator(".workshop-feedback")).toBeFocused();
    await expect(page.getByLabel("Pergunta 1", { exact: true })).toBeEnabled();
    await expect(progresso).toHaveCount(0);
    await acessivel(page);
    await page.screenshot({
      path: info.outputPath("revisao-pronta.png"),
      fullPage: true,
    });
  });
}

test("cancelar a espera mantém o contexto e ignora a resposta antiga durante nova geração", async ({
  page,
}) => {
  const primeira = Promise.withResolvers<void>();
  const segunda = Promise.withResolvers<void>();
  const primeiraEncerrada = Promise.withResolvers<void>();
  let pedidos = 0;
  await page.route("**/api/bussola/questionario", async (route) => {
    const tentativa = ++pedidos;
    await (tentativa === 1 ? primeira.promise : segunda.promise);
    try {
      await route.fulfill({
        json: {
          ...respostaIA,
          questionario: {
            ...QUESTIONARIO_MODELO,
            titulo: tentativa === 1 ? "Resposta antiga" : "Resposta atual",
          },
        },
      });
    } finally {
      if (tentativa === 1) primeiraEncerrada.resolve();
    }
  });
  await preencher(page);
  await page.getByRole("button", { name: "Construir com o Arquiteto" }).click();
  await expect.poll(() => pedidos).toBe(1);
  await page
    .getByRole("button", { name: "Cancelar espera", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Espera cancelada" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nome da área")).toHaveValue("Produto");
  await page.getByLabel("Setor da empresa").fill("Educação");
  await page.getByRole("button", { name: "Construir com o Arquiteto" }).click();
  await expect.poll(() => pedidos).toBe(2);
  primeira.resolve();
  await primeiraEncerrada.promise;
  await expect(page.locator(".operation-progress")).toBeVisible();
  await expect(page.getByLabel("Setor da empresa")).toBeDisabled();
  segunda.resolve();
  await expect(page.getByLabel("Título na biblioteca")).toHaveValue(
    "Resposta atual",
  );
});

test("falhas de rede e resposta inesperada preservam o formulário e permitem usar o modelo", async ({
  page,
}) => {
  await preencher(page);
  await page.route("**/api/bussola/questionario", (route) => route.abort());
  await page.getByRole("button", { name: "Construir com o Arquiteto" }).click();
  await expect(
    page.locator(".workshop-feedback").getByRole("alert"),
  ).toContainText("Verifique sua conexão");
  await expect(
    page.locator(".workshop-feedback").getByRole("alert"),
  ).toContainText("Seu preenchimento foi mantido");
  await expect(page.getByLabel("Nome da empresa")).toBeEnabled();
  await expect(page.getByLabel("Nome da empresa")).toHaveValue("Horizonte");
  await expect(page.getByLabel("Missão do assessment")).toHaveValue(
    "Criar novos produtos",
  );
  await page.unroute("**/api/bussola/questionario");
  await page.route("**/api/bussola/questionario", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<h1>Bad Gateway</h1>",
    }),
  );
  await page.getByRole("button", { name: "Construir com o Arquiteto" }).click();
  await expect(
    page.locator(".workshop-feedback").getByRole("alert"),
  ).toContainText("O servidor não respondeu como esperado");
  await page.getByRole("button", { name: "Usar questionário modelo" }).click();
  await expect(
    page.locator(".workshop-feedback").getByRole("alert"),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Questionário modelo pronto para revisão" }),
  ).toBeVisible();
  await expect(page.getByLabel("Pergunta 1", { exact: true })).toBeEnabled();
});

test("tempo limite libera os campos sem apagar o contexto", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const timeoutOriginal = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = (ms) => timeoutOriginal(ms === 390_000 ? 300 : ms);
  });
  await page.route("**/api/bussola/questionario", () => {});
  await preencher(page);
  await page.getByRole("button", { name: "Construir com o Arquiteto" }).click();
  await expect(
    page.locator(".workshop-feedback").getByRole("alert"),
  ).toContainText("A resposta demorou mais que o esperado");
  await expect(page.getByLabel("Nome da empresa")).toBeEnabled();
  await expect(page.getByLabel("Nome da empresa")).toHaveValue("Horizonte");
  await expect(page.locator(".operation-progress")).toHaveCount(0);
});

test("salvamento bloqueia o editor, informa falha e confirma sucesso sem depender de outra consulta", async ({
  page,
}) => {
  await preencher(page);
  await page.getByRole("button", { name: "Usar questionário modelo" }).click();
  await page
    .getByLabel("Pergunta 1", { exact: true })
    .fill("Como a liderança aplica IA?");
  await page
    .getByText("Personalizar dimensões, tipos e ordem das perguntas")
    .click();
  const liberar = Promise.withResolvers<void>();
  await page.route("**/api/bussola/questionarios", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await liberar.promise;
    await route.fulfill({
      status: 503,
      json: { error: "Biblioteca indisponível. Tente novamente." },
    });
  });
  await page
    .getByRole("button", { name: "Salvar questionário", exact: true })
    .click();
  await expect(
    page.locator(".operation-progress").getByRole("status"),
  ).toContainText("Salvando questionário");
  const editor = page.getByRole("group", {
    name: "Revisão do questionário",
    exact: true,
  });
  for (const controle of await editor
    .locator("input, textarea, select, button")
    .all()) {
    await expect(controle).toBeDisabled();
  }
  liberar.resolve();
  await expect(
    page.locator(".workshop-feedback").getByRole("alert"),
  ).toContainText("Não foi possível confirmar o salvamento");
  await expect(page.getByLabel("Pergunta 1", { exact: true })).toHaveValue(
    "Como a liderança aplica IA?",
  );
  await page.unroute("**/api/bussola/questionarios");
  let consultas = 0;
  await page.route("**/api/bussola/questionarios", async (route) => {
    if (route.request().method() === "GET") {
      consultas++;
      return route.fulfill({
        status: 503,
        json: { error: "Falha na consulta" },
      });
    }
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Salvar questionário", exact: true })
    .click();
  await expect(
    page.getByText("Questionário salvo na biblioteca.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".workshop-feedback").getByRole("alert"),
  ).toHaveCount(0);
  expect(consultas).toBe(0);
  await page
    .getByLabel("Pergunta 1", { exact: true })
    .fill("Texto alterado depois de salvar");
  await expect(
    page.getByText("Questionário salvo na biblioteca.", { exact: true }),
  ).toHaveCount(0);
});

test("abrir questionário salvo tem feedback próprio e bloqueia o contexto", async ({
  page,
}) => {
  await page.route("**/api/bussola/questionarios", (route) =>
    route.fulfill({
      json: { itens: [{ id: "salvo", titulo: "Modelo do time" }] },
    }),
  );
  const liberar = Promise.withResolvers<void>();
  await page.route("**/api/bussola/questionarios/salvo", async (route) => {
    await liberar.promise;
    await route.fulfill({ json: { questionario: QUESTIONARIO_MODELO } });
  });
  await preencher(page);
  await page
    .getByLabel("Ou comece com um questionário salvo")
    .selectOption("salvo");
  await expect(
    page.locator(".operation-progress").getByRole("status"),
  ).toContainText("Abrindo questionário da biblioteca");
  await expect(page.getByLabel("Nome da empresa")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Construir com o Arquiteto" }),
  ).toBeDisabled();
  liberar.resolve();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Questionário da biblioteca aberto" }),
  ).toBeVisible();
  await expect(page.getByLabel("Pergunta 1", { exact: true })).toBeEnabled();
});

for (const fecharComEscape of [false, true]) {
  test(`criar link limpa a oficina após ${fecharComEscape ? "Escape" : "Fechar"}; cancelar ou falhar mantém o rascunho`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preencher(page);
    await page
      .getByRole("button", { name: "Usar questionário modelo" })
      .click();
    await page
      .getByLabel("Pergunta 1", { exact: true })
      .fill("Pergunta exclusiva do primeiro assessment");
    await page
      .getByLabel("Título na biblioteca")
      .fill("Título do primeiro questionário");
    await page
      .getByRole("button", { name: "Criar link de avaliação", exact: true })
      .click();
    const dialogo = page.getByRole("dialog");
    await dialogo
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await expect(page.getByLabel("Pergunta 1", { exact: true })).toHaveValue(
      "Pergunta exclusiva do primeiro assessment",
    );
    await page
      .getByRole("button", { name: "Criar link de avaliação", exact: true })
      .click();
    await dialogo.getByLabel("O link expira em").selectOption("7");
    await dialogo.getByLabel("Limite de respostas").selectOption("10");
    const liberar = Promise.withResolvers<void>();
    let pedidos = 0;
    await page.route("**/api/bussola/link", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      pedidos++;
      await liberar.promise;
      await route.fulfill({
        status: 503,
        json: { error: "Tente novamente em instantes." },
      });
    });
    await dialogo
      .getByRole("button", { name: "Gerar link", exact: true })
      .click();
    await expect(dialogo.getByRole("status")).toContainText(
      "Criando link de avaliação",
    );
    await expect(dialogo.getByLabel("O link expira em")).toBeDisabled();
    await expect(dialogo.getByLabel("Limite de respostas")).toBeDisabled();
    await expect(
      dialogo.getByRole("button", { name: "Cancelar", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeVisible();
    await acessivel(page);
    await page.screenshot({
      path: info.outputPath("criando-link-mobile.png"),
      fullPage: true,
    });
    liberar.resolve();
    await expect(dialogo.getByRole("alert")).toContainText(
      "Suas escolhas foram mantidas",
    );
    await expect(dialogo.getByLabel("O link expira em")).toHaveValue("7");
    await expect(dialogo.getByLabel("Limite de respostas")).toHaveValue("10");
    expect(pedidos).toBe(1);
    await dialogo
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await expect(page.getByLabel("Título na biblioteca")).toHaveValue(
      "Título do primeiro questionário",
    );
    await page
      .getByRole("button", { name: "Assessments", exact: false })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Oficina de criação", exact: true })
      .click();
    await expect(page.getByLabel("Pergunta 1", { exact: true })).toHaveValue(
      "Pergunta exclusiva do primeiro assessment",
    );
    await page.unroute("**/api/bussola/link");
    await page
      .getByRole("button", { name: "Criar link de avaliação", exact: true })
      .click();
    await dialogo
      .getByRole("button", { name: "Gerar link", exact: true })
      .click();
    await expect(dialogo.getByRole("status")).toContainText(
      "Link criado com sucesso",
    );
    await expect(
      dialogo.getByRole("button", { name: "Copiar link", exact: true }),
    ).toBeVisible();
    const codigo = (await dialogo.locator("code").innerText()).split("/f/")[1];
    expect((await page.request.get(`/f/${codigo}`)).ok()).toBeTruthy();
    await acessivel(page);
    if (fecharComEscape) await page.keyboard.press("Escape");
    else
      await dialogo
        .getByRole("button", { name: "Fechar", exact: true })
        .click();
    await expect(dialogo).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Assessment criado." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Novo assessment", exact: true })
      .click();
    for (const nome of [
      "Nome da empresa",
      "Título do assessment",
      "Setor da empresa",
      "Meta de participantes",
    ]) {
      await expect(page.getByLabel(nome)).toHaveValue("");
    }
    await expect(page.getByLabel("Empresa inteira")).toBeChecked();
    await expect(page.getByLabel("Nome da área")).toHaveCount(0);
    await expect(page.getByLabel("Porte", { exact: false })).toHaveValue("");
    await expect(page.getByLabel("Missão do assessment")).toHaveValue(
      "Ganhar eficiência",
    );
    await expect(page.locator(".workshop-feedback")).toHaveCount(0);
    await page.getByLabel("Nome da empresa").fill("Nova empresa");
    await page.getByLabel("Título do assessment").fill("Novo assessment");
    await page.getByLabel("Setor da empresa").fill("Saúde");
    await page.getByLabel("Meta de participantes").fill("10");
    await page
      .getByRole("button", { name: "Usar questionário modelo" })
      .click();
    await expect(page.getByLabel("Pergunta 1", { exact: true })).toHaveValue(
      QUESTIONARIO_MODELO.perguntas[0].texto,
    );
    await expect(page.getByLabel("Título na biblioteca")).toHaveValue(
      QUESTIONARIO_MODELO.titulo,
    );
  });
}

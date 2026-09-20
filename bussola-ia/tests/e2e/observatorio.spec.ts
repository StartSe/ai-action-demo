import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { QUESTIONARIO_MODELO } from "../../lib/modelo";
import type { AssessmentPainel, DadosPainel } from "../../lib/painel";
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
async function a11y(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
}
async function semOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}
async function criar(page: Page, extra: Record<string, unknown> = {}) {
  const r = await page.request.post("/api/bussola/link", {
    data: {
      empresa: "Horizonte",
      titulo: `Teste ${Date.now()}`,
      questionario: QUESTIONARIO_MODELO,
      grupoTipo: "empresa",
      participantes: 20,
      expiraEmDias: 30,
      limite: 50,
      ...extra,
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()) as { codigo: string; url: string };
}
const respostas = (nota: string, area = "Marketing") => ({
  dados: {
    ...Object.fromEntries(
      QUESTIONARIO_MODELO.perguntas.map((p) => [
        p.id,
        p.tipo === "escala"
          ? nota
          : "Automatizamos o atendimento e precisamos medir o impacto.",
      ]),
    ),
    area,
    cargo: "Coordenação",
  },
});

test("rotas do gestor exigem sessão; formulário público não expõe o painel", async ({
  page,
}) => {
  const r = await page.request.get("/api/bussola/painel");
  expect(r.status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/(conta|entrar)/);
  expect(
    (await page.request.post("/api/f/inexistente", { data: {} })).status(),
  ).toBe(404);
});

test("gestor cria área, recebe respostas, analisa, age e exporta", async ({
  page,
  browser,
}, info) => {
  await login(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Seus assessments", exact: false }),
  ).toBeVisible();
  await a11y(page);
  await page.screenshot({
    path: info.outputPath("01-painel.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Novo assessment", exact: true })
    .click();
  await page.getByLabel("Uma área ou time").check();
  await page.getByLabel("Nome da empresa").fill("Horizonte");
  await page.getByLabel("Nome da área").fill("Marketing");
  await page
    .getByLabel("Título do assessment")
    .fill("Horizonte da área de Marketing");
  await page.getByLabel("Setor da empresa").fill("Varejo");
  await page.getByLabel("Meta de participantes").fill("10");
  await a11y(page);
  await page.screenshot({
    path: info.outputPath("02-oficina.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Construir com o Arquiteto" }).click();
  await expect(page.getByText("MODELO · SEM GERAÇÃO POR IA")).toBeVisible();
  await page
    .getByLabel("Pergunta 1", { exact: true })
    .fill("A liderança conecta IA às metas do grupo?");
  await page
    .getByRole("button", { name: "Salvar questionário", exact: true })
    .click();
  await expect(
    page.getByText("Questionário salvo na biblioteca."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Criar link de avaliação", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await a11y(page);
  await dialog.getByLabel("O link expira em").focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest("dialog")),
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Gerar link", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copiar link", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  const painel = (await (
    await page.request.get("/api/bussola/painel")
  ).json()) as DadosPainel;
  const a = painel.assessments.find(
    (a) => a.titulo === "Horizonte da área de Marketing",
  )!;
  expect(a).toMatchObject({
    empresa: "Horizonte",
    grupoNome: "Marketing",
    grupoTipo: "area",
    participantes: 10,
    totalRespostas: 0,
  });
  await page
    .getByRole("button", { name: "Acompanhar Horizonte da área de Marketing" })
    .click();
  await expect(
    page.getByRole("button", { name: "Analisar respostas", exact: true }),
  ).toBeDisabled();
  const publicContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const respondent = await publicContext.newPage();
  await respondent.goto(`http://localhost:3118/f/${a.codigo}`);
  await a11y(respondent);
  await semOverflow(respondent);
  await respondent.getByRole("button", { name: "Próxima dimensão" }).click();
  await expect(
    respondent.getByRole("heading", {
      name: "Estratégia e liderança",
      exact: true,
    }),
  ).toBeVisible();
  for (let etapa = 0; etapa < 6; etapa++) {
    for (const field of await respondent
      .locator(".respondent-question fieldset")
      .all())
      await field.getByRole("radio", { name: "3", exact: true }).check();
    for (const field of await respondent.locator("textarea").all())
      await field.fill(
        "Testamos IA no atendimento e queremos medir os resultados.",
      );
    if (etapa === 0) {
      await respondent.screenshot({
        path: info.outputPath("03-responder-mobile.png"),
        fullPage: true,
      });
      await respondent
        .getByRole("button", { name: "Próxima dimensão" })
        .click();
      await respondent.getByRole("button", { name: "Voltar" }).click();
      await expect(
        respondent.getByRole("radio", { name: "3", exact: true }).first(),
      ).toBeChecked();
    }
    await respondent.getByRole("button", { name: "Próxima dimensão" }).click();
  }
  await respondent.getByLabel("Área", { exact: false }).fill("Marketing");
  await respondent.getByLabel("Cargo", { exact: false }).fill("Coordenação");
  await respondent.route(`**/api/f/${a.codigo}`, (route) => route.abort());
  await respondent
    .getByRole("button", { name: "Enviar minha perspectiva" })
    .click();
  await expect(respondent.locator(".obs-alert[role=alert]")).toBeVisible();
  await expect(respondent.getByLabel("Área", { exact: false })).toHaveValue(
    "Marketing",
  );
  await respondent.unroute(`**/api/f/${a.codigo}`);
  await respondent
    .getByRole("button", { name: "Enviar minha perspectiva" })
    .click();
  await expect(
    respondent.getByRole("heading", {
      name: "Obrigado por abrir novos caminhos.",
    }),
  ).toBeVisible();
  await a11y(respondent);
  await publicContext.close();
  expect(
    (
      await page.request.post(`/api/f/${a.codigo}`, {
        data: respostas("1", "Produto"),
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Atualizar assessments" }).click();
  await expect(
    page.locator(".row-progress").filter({ hasText: "20%" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Analisar respostas", exact: true })
    .click();
  await expect(
    page.getByText("DADOS REAIS · 2 RESPOSTAS RECEBIDAS"),
  ).toBeVisible();
  await expect(
    page.getByText("Leitura automática · sem IA", { exact: true }),
  ).toBeVisible();
  await a11y(page);
  await page.screenshot({
    path: info.outputPath("04-analise.png"),
    fullPage: true,
  });
  const slider = page.getByRole("slider");
  await slider.fill("5");
  await expect(page.locator(".scenario-score")).toContainText("2,5");
  await expect(page.locator(".maturity-number>strong")).toHaveText("2,0");
  await page
    .getByRole("button", { name: "Conselho de agentes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Crítico O que precisamos questionar" })
    .click();
  await expect(
    page.getByText("Esta leitura tem apenas 2 respostas.", { exact: false }),
  ).toBeVisible();
  await a11y(page);
  await page.screenshot({
    path: info.outputPath("05-conselho.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Plano de ação", exact: true })
    .click();
  await page.getByRole("checkbox").first().check();
  await expect(page.getByText("1 / 3 concluídas")).toBeVisible();
  await a11y(page);
  const atualizado = (await (
    await page.request.get("/api/bussola/painel")
  ).json()) as DadosPainel;
  const r = atualizado.assessments.find(
    (s) => s.codigo === a.codigo,
  )!.ultimoResultado!;
  expect(r.nivel).toBe(2);
  expect(r.respostas).toBe(2);
  await page.goto(`/r/${r.id}`);
  await page
    .getByRole("button", { name: "Plano de ação", exact: true })
    .click();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await page
    .getByRole("button", { name: "Evidências do grupo", exact: true })
    .click();
  await expect(page.locator(".area-comparison")).toContainText("Marketing");
  await expect(page.locator(".area-comparison")).toContainText("Produto");
  await a11y(page);
  await page
    .getByRole("button", { name: "Mais opções para entregar este resultado" })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Baixar respostas (CSV)", exact: true })
    .click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toBe("respostas-avaliacao.csv");
  expect(await arquivo.failure()).toBeNull();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Baixar PDF", exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await expect(
    popup.getByRole("heading", { name: "Conselho de agentes", exact: true }),
  ).toBeVisible();
  await expect(
    popup.getByText("Diagnóstico real · Leitura automática, sem IA", {
      exact: false,
    }),
  ).toBeVisible();
  await popup.close();
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await semOverflow(page);
    await page
      .getByRole("button", { name: "Conselho de agentes", exact: true })
      .click();
    await a11y(page);
    await page.screenshot({
      path: info.outputPath(`06-conselho-${width}.png`),
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Assessments", exact: false })
    .first()
    .click();
  await page.getByLabel("Buscar assessment").fill("Horizonte da área");
  await page.getByLabel("Tipo de grupo").selectOption("empresa");
  await expect(page.getByText("Nenhum assessment encontrado")).toBeVisible();
  await page.getByLabel("Tipo de grupo").selectOption("area");
  await page
    .getByRole("button", { name: "Acompanhar Horizonte da área de Marketing" })
    .click();
  await page
    .getByRole("button", { name: "Encerrar coleta", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Encerrar coleta", exact: true })
    .click();
  await expect(page.locator(".row-status")).toContainText("Encerrado");
  expect(
    (
      await page.request.post(`/api/f/${a.codigo}`, { data: respostas("5") })
    ).status(),
  ).toBe(410);
  expect(errors).toEqual([]);
});

test("limite de 200, concorrência, input inválido e diagnóstico com todos os envios", async ({
  page,
}) => {
  await login(page);
  const a = await criar(page, {
    titulo: "Coleta com 200 respostas",
    limite: 200,
    participantes: 200,
  });
  expect(
    (
      await page.request.post(`/api/f/${a.codigo}`, { data: respostas("3.5") })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/bussola/link", {
        data: {
          empresa: "X",
          titulo: "X",
          questionario: { ...QUESTIONARIO_MODELO, perguntas: [null] },
        },
      })
    ).status(),
  ).toBe(400);
  const batches = Array.from({ length: 21 }, (_, i) =>
    Array.from({ length: 10 }, (_, j) => i * 10 + j),
  );
  let ok = 0;
  for (const batch of batches) {
    const rs = await Promise.all(
      batch.map(() =>
        page.request.post(`/api/f/${a.codigo}`, { data: respostas("4") }),
      ),
    );
    for (const r of rs) {
      expect([200, 410]).toContain(r.status());
      if (r.status() === 200) ok++;
    }
  }
  expect(ok).toBe(200);
  const p = await (await page.request.get("/api/bussola/painel")).json();
  expect(
    p.assessments.find((v: AssessmentPainel) => v.codigo === a.codigo)
      .totalRespostas,
  ).toBe(200);
  const analise = await (
    await page.request.post(`/api/bussola/link/${a.codigo}/analisar`)
  ).json();
  expect(analise.avaliacao.respostas).toHaveLength(200);
  expect(analise.avaliacao.analise.nivelGeral).toBe(4);
  const semLimite = await criar(page, { limite: null, titulo: "Sem limite" });
  expect(
    (
      await page.request.post(`/api/bussola/link/${semLimite.codigo}/analisar`)
    ).status(),
  ).toBe(400);
});

test("demonstração, falha de leitura e navegação mobile", async ({
  page,
}, info) => {
  await login(page);
  await page.goto("/?exemplo=1");
  await expect(
    page.getByText("EXEMPLO ILUSTRATIVO · 8 RESPOSTAS FICTÍCIAS"),
  ).toBeVisible();
  await a11y(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await semOverflow(page);
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await a11y(page);
  await page.screenshot({
    path: info.outputPath("07-painel-mobile.png"),
    fullPage: true,
  });
  await page.route("**/api/bussola/painel", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Coleta temporariamente indisponível." }),
    }),
  );
  await page.getByRole("button", { name: "Atualizar assessments" }).click();
  await expect(page.locator(".obs-alert[role=alert]")).toContainText(
    "Coleta temporariamente indisponível.",
  );
  await page.unroute("**/api/bussola/painel");
  await page.getByRole("button", { name: "Tentar atualizar" }).click();
  await expect(page.locator(".obs-alert[role=alert]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Novo assessment", exact: true })
    .click();
  await semOverflow(page);
  await a11y(page);
});

test("trocar de diagnóstico na biblioteca carrega o registro correto", async ({
  page,
}) => {
  await login(page);
  const ids: string[] = [];
  for (const titulo of ["Norte A", "Norte B"]) {
    const r = await page.request.post("/api/bussola", {
      data: { empresa: "Exemplo", titulo },
    });
    ids.push((await r.json()).id);
  }
  await page.goto(`/r/${ids[0]}`);
  await expect(page.locator(".analysis-heading h2")).toHaveText("Norte A");
  await page.getByRole("link", { name: /Norte B/ }).click();
  await expect(page).toHaveURL(new RegExp(ids[1]));
  await expect(page.locator(".analysis-heading h2")).toHaveText("Norte B");
});

test("acompanhamento recupera falha e preserva a última consulta do grupo", async ({
  page,
}) => {
  await login(page);
  const grupo = await criar(page, {
    titulo: "Recuperação das respostas",
    grupoTipo: "area",
    grupoNome: "Operações",
  });
  expect(
    (
      await page.request.post(`/api/f/${grupo.codigo}`, {
        data: respostas("3", "Operações"),
      })
    ).ok(),
  ).toBeTruthy();
  await page.route(`**/api/bussola/link/${grupo.codigo}/respostas`, (route) =>
    route.fulfill({ status: 503, json: { error: "Falha temporária" } }),
  );
  await page.goto("/?tela=assessments");
  await page
    .getByRole("button", {
      name: "Acompanhar Recuperação das respostas",
      exact: true,
    })
    .click();
  const detalhe = page.locator(".assessment-detail");
  await expect(detalhe.getByRole("alert")).toContainText(
    "Não foi possível carregar as respostas deste grupo.",
  );
  await expect(
    detalhe.getByText("Carregando respostas…", { exact: true }),
  ).toHaveCount(0);
  await expect(
    detalhe.getByText("O grupo ainda não respondeu.", { exact: true }),
  ).toHaveCount(0);
  await page.unroute(`**/api/bussola/link/${grupo.codigo}/respostas`);
  await detalhe
    .getByRole("button", { name: "Tentar carregar respostas", exact: true })
    .click();
  await expect(detalhe.locator(".response-list")).toContainText("Operações");
  await expect(detalhe.getByRole("alert")).toHaveCount(0);
  await page.route(`**/api/bussola/link/${grupo.codigo}/respostas`, (route) =>
    route.fulfill({ status: 503, json: { error: "Falha temporária" } }),
  );
  await page
    .getByRole("button", { name: "Atualizar assessments", exact: true })
    .click();
  await expect(detalhe.getByRole("alert")).toContainText(
    "Exibindo as respostas da última consulta bem-sucedida.",
  );
  await expect(detalhe.locator(".response-list")).toContainText("Operações");
  await page.setViewportSize({ width: 390, height: 844 });
  await a11y(page);
  await semOverflow(page);
  await page.unroute(`**/api/bussola/link/${grupo.codigo}/respostas`);
  await detalhe
    .getByRole("button", { name: "Tentar carregar respostas", exact: true })
    .click();
  await expect(detalhe.getByRole("alert")).toHaveCount(0);
});

test("trocar de grupo cancela a consulta anterior sem misturar respostas", async ({
  page,
}) => {
  await login(page);
  const primeiro = await criar(page, {
    titulo: "Grupo anterior",
    grupoTipo: "area",
    grupoNome: "Financeiro",
  });
  const segundo = await criar(page, {
    titulo: "Grupo atual",
    grupoTipo: "area",
    grupoNome: "Comercial",
  });
  expect(
    (
      await page.request.post(`/api/f/${segundo.codigo}`, {
        data: respostas("4", "Comercial"),
      })
    ).ok(),
  ).toBeTruthy();
  let liberar!: () => void;
  const bloqueio = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let iniciou!: () => void;
  const consultaIniciada = new Promise<void>((resolve) => {
    iniciou = resolve;
  });
  let terminou!: () => void;
  const consultaTerminada = new Promise<void>((resolve) => {
    terminou = resolve;
  });
  await page.route(
    `**/api/bussola/link/${primeiro.codigo}/respostas`,
    async (route) => {
      iniciou();
      await bloqueio;
      try {
        await route.fulfill({
          json: {
            respostas: [
              {
                id: "antiga",
                criadoEm: new Date().toISOString(),
                respondente: { area: "Financeiro", cargo: "Direção" },
              },
            ],
          },
        });
      } finally {
        terminou();
      }
    },
  );
  await page.goto("/?tela=assessments");
  await page
    .getByRole("button", { name: "Acompanhar Grupo anterior", exact: true })
    .click();
  await consultaIniciada;
  await expect(
    page.locator(".assessment-detail").getByRole("status"),
  ).toHaveText("Carregando respostas…");
  await page
    .getByRole("button", { name: "Acompanhar Grupo atual", exact: true })
    .click();
  await expect(page.locator(".response-list")).toContainText("Comercial");
  liberar();
  await consultaTerminada;
  await expect(page.locator(".response-list")).not.toContainText("Financeiro");
  await expect(page.locator(".assessment-detail h3")).toHaveText("Grupo atual");
});

test("falha inicial do painel encerra o carregamento e não apaga erros de análise", async ({
  page,
}) => {
  await login(page);
  const grupo = await criar(page, { titulo: "Análise indisponível" });
  expect(
    (
      await page.request.post(`/api/f/${grupo.codigo}`, {
        data: respostas("3"),
      })
    ).ok(),
  ).toBeTruthy();
  await page.route("**/api/bussola/painel", (route) =>
    route.fulfill({ status: 503, json: { error: "Painel indisponível" } }),
  );
  await page.goto("/");
  await expect(page.locator(".obs-alert[role=alert]")).toContainText(
    "Painel indisponível",
  );
  await expect(
    page.getByText("Buscando seus assessments…", { exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/bussola/painel");
  await page
    .getByRole("button", { name: "Tentar atualizar", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Acompanhar Análise indisponível",
      exact: true,
    })
    .click();
  await page.route(`**/api/bussola/link/${grupo.codigo}/analisar`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "A análise não foi concluída. Tente novamente." },
    }),
  );
  await page
    .getByRole("button", { name: "Analisar respostas", exact: true })
    .click();
  await expect(page.locator(".obs-alert[role=alert]")).toContainText(
    "A análise não foi concluída.",
  );
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await page
    .getByRole("button", { name: "Atualizar assessments", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Atualizar assessments", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".obs-alert[role=alert]")).toContainText(
    "A análise não foi concluída.",
  );
  await page.getByRole("button", { name: "Fechar aviso", exact: true }).click();
  await expect(page.locator(".obs-alert[role=alert]")).toHaveCount(0);
});

import { test, expect } from "@playwright/test";
const credentials = {
  nome: "Time de teste",
  email: "orbit-test@example.test",
  senha: "Orbit-Test-2026!",
  confirmarSenha: "Orbit-Test-2026!",
};

test("workspace APIs require an authenticated account", async ({ request }) => {
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect(
    (
      await request.post("/api/workspace", {
        data: { action: "clear-examples" },
      })
    ).status(),
  ).toBe(401);
  for (const method of ["GET", "POST", "DELETE"]) {
    expect(
      (await request.fetch("/api/workspace/chatgpt", { method })).status(),
    ).toBe(401);
  }
});

test.describe("workspace flows", () => {
  test.beforeEach(async ({ page }) => {
    const state = await (await page.request.get("/api/conta")).json();
    const response = await page.request.post(
      state.existe ? "/api/conta/entrar" : "/api/conta",
      { data: credentials },
    );
    expect(response.ok()).toBeTruthy();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Tudo conectado. Tudo em movimento." }),
    ).toBeVisible();
  });

  test("edits, persists and learns from a manual correction; supports search and drag-and-drop", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(
      page.getByRole("region", { name: "Quadro Kanban" }),
    ).toBeVisible();
    await page.screenshot({ path: "/tmp/orbit-desktop.png", fullPage: true });
    await page
      .getByRole("button", {
        name: "Editar Redesenhar o fluxo de boas-vindas",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Atividade", { exact: true })
      .fill("Validar novo fluxo com clientes");
    await page.getByLabel("Status", { exact: true }).selectOption("done");
    await page
      .getByLabel("O que o agente deve aprender com esta correção?")
      .fill("Só concluir o fluxo após validação com clientes reais.");
    await page
      .getByRole("button", { name: "Salvar atividade", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.reload();
    const card = page.getByRole("button", {
      name: "Editar Validar novo fluxo com clientes",
      exact: true,
    });
    await expect(page.locator(".o-column-done")).toContainText(
      "Validar novo fluxo com clientes",
    );
    await page.getByLabel("Buscar atividades").fill("Validar novo");
    await expect(page.locator(".o-task")).toHaveCount(1);
    await page.getByLabel("Buscar atividades").fill("");
    await card.dragTo(page.locator(".o-column-archived"));
    await expect(page.locator(".o-column-archived")).toContainText(
      "Validar novo fluxo com clientes",
    );
    await page
      .getByRole("button", { name: "Skill do time", exact: true })
      .click();
    const feedback = page
      .locator(".o-feedback-card")
      .filter({ has: page.locator("textarea", { hasText: "Só concluir" }) });
    await feedback.getByRole("button", { name: "Incorporar à skill" }).click();
    await expect(page.locator(".o-skill-content")).toContainText(
      "Só concluir o fluxo após validação com clientes reais.",
    );
    expect(errors).toEqual([]);
  });

  test("creates a process draft, saves paused routines and records an honest missing-model failure", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Rotinas", exact: true }).click();
    await page
      .getByRole("button", { name: "Desenhar processo", exact: true })
      .click();
    await page
      .getByLabel("Como funciona a rotina do seu time?")
      .fill(
        "Toda segunda às 10h fazemos o alinhamento. Lemos o Slack diariamente às 17h e cruzamos com o Trello para acompanhar as entregas.",
      );
    await page.getByRole("button", { name: "Montar modelo inicial" }).click();
    await expect(
      page.getByText("Modelo sem IA.", { exact: false }),
    ).toBeVisible();
    const firstDraft = page.locator(".o-blueprint-routine").first();
    await firstDraft.getByLabel("Horário de início").fill("10:00");
    await page.getByRole("button", { name: "Salvar skill e rotinas" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const routine = page.locator(".o-routine-card").filter({
      has: page.getByRole("heading", {
        name: "Alinhamento semanal",
        exact: true,
      }),
    });
    await expect(routine).toContainText("10:00");
    await expect(routine.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await routine.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByLabel("Nome da rotina").fill("Weekly do time");
    await page
      .getByLabel("Prompt da rotina")
      .fill(
        "Leia o board e as atualizações do Slack. Identifique bloqueios e relacione as atividades ao objetivo estratégico do ciclo.",
      );
    await page.getByRole("button", { name: "Salvar rotina" }).click();
    const weekly = page.locator(".o-routine-card").filter({
      has: page.getByRole("heading", { name: "Weekly do time", exact: true }),
    });
    await weekly.getByRole("button", { name: "Executar agora" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Conecte a IA em Conexões",
    );
    await expect(page.getByRole("dialog")).toContainText("Falhou");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(page.locator(".o-history-row").first()).toContainText(
      "Weekly do time",
    );
    await page.reload();
    await expect(page.locator(".o-history-row").first()).toContainText(
      "Falhou",
    );
  });

  test("validates API writes and provides connection choices without exposing secrets", async ({
    page,
  }) => {
    const invalid = await page.request.post("/api/workspace", {
      data: {
        action: "task",
        data: { task: { title: "", status: "invalid" } },
      },
    });
    expect(invalid.status()).toBe(400);
    const local = await page.request.post("/api/workspace", {
      data: { action: "connect-zapier", data: "https://127.0.0.1/private" },
    });
    expect(local.status()).toBe(400);
    for (const method of ["POST", "DELETE"]) {
      const crossSite = await page.request.fetch("/api/workspace/chatgpt", {
        method,
        headers: { Origin: "https://unrelated.example" },
      });
      expect(crossSite.status()).toBe(403);
    }
    await page.getByRole("button", { name: "Conexões", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Zapier MCP", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "ChatGPT Sua assinatura, via Codex" })
      .click();
    await expect(
      page.getByText("Login necessário no servidor", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "OpenRouter Vários modelos, uma conexão" })
      .click();
    const data = await (await page.request.get("/api/workspace")).json();
    expect(JSON.stringify(data)).not.toContain("OPENROUTER_API_KEY");
    expect(data.connections.provider).toBe("openrouter");
  });

  test("ChatGPT authorization shows a resumable device code, expiration, cancellation and completion", async ({
    page,
  }) => {
    let phase = "idle";
    let starts = 0;
    await page.route("**/api/workspace/chatgpt", async (route) => {
      if (route.request().method() === "POST") {
        phase = "waiting";
        starts++;
      }
      if (route.request().method() === "DELETE") phase = "cancelled";
      await route.fulfill({
        json: {
          phase,
          ...(phase === "waiting"
            ? {
                code: "ABCD-1234",
                url: "https://auth.openai.com/codex/device",
                expiresAt: new Date(Date.now() + 600000).toISOString(),
              }
            : {}),
          ...(phase === "expired"
            ? { message: "Este código expirou. Inicie uma nova conexão." }
            : {}),
          ...(phase === "cancelled" ? { message: "Login cancelado." } : {}),
        },
      });
    });
    await page.getByRole("button", { name: "Conexões", exact: true }).click();
    await page
      .getByRole("button", { name: "ChatGPT Sua assinatura, via Codex" })
      .click();
    await page
      .getByRole("button", { name: "Conectar com ChatGPT", exact: true })
      .click();
    await expect(page.getByLabel("Código de autorização")).toHaveText(
      "ABCD-1234",
    );
    await expect(
      page.getByRole("link", { name: "Abrir autorização" }),
    ).toHaveAttribute("href", "https://auth.openai.com/codex/device");
    await page.screenshot({
      path: "/tmp/orbit-chatgpt-desktop.png",
      fullPage: true,
    });
    await page.reload();
    await expect(page.getByLabel("Código de autorização")).toHaveText(
      "ABCD-1234",
    );
    expect(starts).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/orbit-chatgpt-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    phase = "expired";
    await expect(
      page.getByText("Este código expirou.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("Código de autorização")).not.toBeVisible();
    await page
      .getByRole("button", { name: "Conectar com ChatGPT", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancelar login", exact: true })
      .click();
    await expect(
      page.getByText("Login cancelado.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Código de autorização")).not.toBeVisible();
    await page
      .getByRole("button", { name: "Conectar com ChatGPT", exact: true })
      .click();
    await expect(page.getByLabel("Código de autorização")).toBeVisible();
    phase = "connected";
    await expect(
      page.getByText("Login disponível no servidor", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Código de autorização")).not.toBeVisible();
    await expect(
      page.getByText("Login salvo. Execute uma rotina", { exact: false }),
    ).toBeVisible();
    expect(starts).toBe(3);
  });

  test("mobile navigation, board and card editor fit the viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/orbit-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await page.getByRole("button", { name: "Rotinas", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "O ritmo do seu time." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await page.getByRole("button", { name: "Quadro", exact: true }).click();
    await page
      .getByRole("button", { name: "Nova atividade", exact: true })
      .click();
    await page
      .getByLabel("Atividade", { exact: true })
      .fill("Atividade criada pelo celular");
    await page.getByLabel("Responsável", { exact: true }).fill("Ana");
    await page
      .getByRole("button", { name: "Salvar atividade", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator(".o-column-todo")).toContainText(
      "Atividade criada pelo celular",
    );
  });
});

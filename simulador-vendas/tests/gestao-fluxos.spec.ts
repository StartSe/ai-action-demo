import { test, expect, type APIRequestContext } from "@playwright/test";

async function criarTreino(request: APIRequestContext, nome: string) {
  const lista = await (await request.get("/api/simulacoes")).json();
  const modelo = lista.itens[0];
  const r = await request.post("/api/simulacoes", { data: { ...modelo, nome, maxTentativas: 1, permiteVoz: false, permiteTexto: true } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).simulacao.codigo as string;
}
async function entrar(request: APIRequestContext, codigo: string) {
  expect((await request.post(`/api/salas/${codigo}/identificar`, { data: { nome: "Pessoa de teste", email: `gestao-${Date.now()}@example.com` } })).ok()).toBeTruthy();
  expect((await request.post(`/api/salas/${codigo}/sessao`)).ok()).toBeTruthy();
  expect((await request.put(`/api/salas/${codigo}/sessao`, { data: { modo: "texto" } })).ok()).toBeTruthy();
}

test("pausar bloqueia o link, as APIs e uma sala aberta; reativar recupera o mesmo endereço", async ({ page }) => {
  const codigo = await criarTreino(page.request, "Pausa durante a conversa");
  try {
    await entrar(page.request, codigo);
    await page.goto(`/simular/${codigo}?pronto=1`);
    await expect(page.getByLabel("Sua mensagem")).toBeVisible();
    expect((await page.request.patch(`/api/simulacoes/${codigo}`, { data: { status: "pausada" } })).ok()).toBeTruthy();
    for (const [acao, corpo] of [["conversar", { fala: "Olá" }], ["conversar", { transcricao: [{ papel: "vendedor", texto: "Olá" }] }], ["analisar", { transcricao: [{ papel: "vendedor", texto: "Olá" }] }], ["voz", { texto: "Olá" }], ["livekit", {}], ["sessao", {}], ["identificar", { nome: "Teste", email: "teste@example.com" }]]) {
      expect((await page.request.post(`/api/salas/${codigo}/${acao}`, { data: corpo })).status()).toBe(409);
    }
    expect((await page.request.post(`/api/simulacoes/${codigo}/convite`)).status()).toBe(409);
    await expect(page.getByRole("heading", { name: "Este treino está pausado" })).toBeVisible({ timeout: 12000 });
    await expect(page.getByLabel("Sua mensagem")).toBeHidden();
    await page.screenshot({ path: "/tmp/gestao-treino-pausado.png", fullPage: true });
    expect((await page.request.patch(`/api/simulacoes/${codigo}`, { data: { status: "ativa" } })).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByLabel("Sua mensagem")).toBeVisible();
  } finally { await page.request.delete(`/api/simulacoes/${codigo}`); }
});

test("encerrar sem falar não consome a única tentativa nem cria resultado ou pendência", async ({ page }) => {
  const codigo = await criarTreino(page.request, "Microfone sem captura");
  try {
    await entrar(page.request, codigo);
    await page.goto(`/simular/${codigo}?pronto=1`);
    await page.getByRole("button", { name: "Encerrar", exact: true }).click();
    await expect(page.getByText("Nenhuma fala registrada")).toBeVisible();
    await expect(page.getByText(/não conta como tentativa nem entra nos resultados/)).toBeVisible();
    const repetida = await page.request.post(`/api/salas/${codigo}/encerrar`);
    expect(await repetida.json()).toMatchObject({ semConversa: true, tentativas: { tentativas: 0, podeTreinar: true, maxTentativas: 1 } });
    const lista = await (await page.request.get("/api/simulacoes")).json();
    expect(lista.itens.find((s: { codigo: string }) => s.codigo === codigo)).toMatchObject({ sessoes: 0, participantes: 0, notaMedia: null });
    const pendentes = await (await page.request.get("/api/sessoes/pendentes")).json();
    expect(pendentes.itens.some((s: { simulacao: string }) => s.simulacao === "Microfone sem captura")).toBe(false);
    expect((await page.request.post(`/api/salas/${codigo}/sessao`)).ok()).toBeTruthy();
  } finally { await page.request.delete(`/api/simulacoes/${codigo}`); }
});

test("editar e apagar pelo popover persistem as mudanças; cancelar preserva os dados", async ({ page }) => {
  const codigo = await criarTreino(page.request, "Treino para editar");
  const pessoa = (await (await page.request.post("/api/equipe", { data: { nome: "Pessoa para editar", email: `edicao-${Date.now()}@example.com` } })).json()).pessoa;
  try {
    await page.goto("/simulacoes");
    const card = page.locator("article").filter({ hasText: "Treino para editar" });
    await card.getByRole("button", { name: /Mais ações/ }).click();
    await page.getByRole("menuitem", { name: "Editar nome" }).click();
    await page.getByLabel("Nome do treino").fill("Treino revisado");
    await page.getByRole("button", { name: "Salvar nome" }).click();
    await expect(page.getByRole("heading", { name: "Treino revisado" })).toBeVisible();
    expect((await (await page.request.get(`/api/simulacoes/${codigo}`)).json()).simulacao.nome).toBe("Treino revisado");
    await page.getByRole("button", { name: "Mais ações do treino Treino revisado" }).click();
    await page.getByRole("menuitem", { name: "Apagar treino" }).click();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Treino revisado" })).toBeVisible();
    await page.getByRole("button", { name: "Mais ações do treino Treino revisado" }).click();
    await page.getByRole("menuitem", { name: "Apagar treino" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Apagar treino" }).click();
    await expect(page.getByRole("heading", { name: "Treino revisado" })).toBeHidden();
    expect((await page.request.get(`/api/simulacoes/${codigo}`)).status()).toBe(404);
    await page.goto(`/simular/${codigo}`);
    await expect(page.getByRole("heading", { name: "Este link não existe" })).toBeVisible();

    await page.goto("/equipe");
    await page.getByRole("button", { name: "Opções de Pessoa para editar" }).click();
    await page.getByRole("menuitem", { name: "Editar pessoa" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Pessoa revisada");
    await page.getByRole("button", { name: "Salvar pessoa" }).click();
    await expect(page.getByRole("heading", { name: "Pessoa revisada" })).toBeVisible();
    expect((await (await page.request.get(`/api/equipe/${pessoa.id}`)).json()).pessoa.nome).toBe("Pessoa revisada");
    await page.getByRole("button", { name: "Opções de Pessoa revisada" }).click();
    await page.getByRole("menuitem", { name: "Apagar pessoa" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Apagar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pessoa revisada" })).toBeHidden();
  } finally { await page.request.delete(`/api/simulacoes/${codigo}`); await page.request.delete(`/api/equipe/${pessoa.id}`); }
});

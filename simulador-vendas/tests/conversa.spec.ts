import { expect, test, type Page } from "@playwright/test";

// Recognition and speech synthesis are browser boundaries. The real library, React UI,
// persistence, session cookies and routes run unchanged against a temporary SQLite database.
async function instalarVoz(page: Page, permission = true) {
  await page.addInitScript(({ permission }) => {
    const w = window as unknown as { mockRecognition: MockRecognition; speechCount: number; speechFinish: () => void };
    class MockRecognition {
      continuous = false;
      lang = "pt-BR";
      interimResults = true;
      onresult?: (event: unknown) => void;
      onend?: () => void;
      onerror?: (event: unknown) => void;
      active = false;
      start() {
        w.mockRecognition = this;
        this.active = true;
        if (!permission) setTimeout(() => { this.onerror?.({ error: "not-allowed" }); this.active = false; this.onend?.(); }, 20);
      }
      stop() { this.active = false; setTimeout(() => this.onend?.(), 10); }
      abort() { this.stop(); }
      say(text: string, final = true) {
        const result = Object.assign([{ transcript: text, confidence: 1 }], { isFinal: final });
        this.onresult?.({ resultIndex: 0, results: [result] });
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: MockRecognition, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: MockRecognition, configurable: true });
    w.speechCount = 0;
    Object.defineProperty(window, "speechSynthesis", { value: {
      getVoices: () => [],
      speak: (utterance: SpeechSynthesisUtterance) => { w.speechCount++; w.speechFinish = () => utterance.onend?.({} as SpeechSynthesisEvent); },
      cancel: () => {},
    }, configurable: true });
  }, { permission });
}
async function abrirSala(page: Page) {
  const lista = await (await page.request.get("/api/simulacoes")).json();
  const codigo = lista.itens.find((s: { status: string }) => s.status === "ativa").codigo;
  expect((await page.request.post(`/api/salas/${codigo}/identificar`, { data: { nome: "Teste de voz", email: `voz-${Date.now()}@example.com` } })).ok()).toBeTruthy();
  expect((await page.request.post(`/api/salas/${codigo}/sessao`)).ok()).toBeTruthy();
  expect((await page.request.put(`/api/salas/${codigo}/sessao`, { data: { modo: "voz-navegador" } })).ok()).toBeTruthy();
  await page.goto(`/simular/${codigo}?pronto=1`);
  await expect(page.getByRole("button", { name: "Iniciar microfone", exact: true })).toBeVisible();
  return codigo;
}
async function falar(page: Page, text: string) {
  await page.evaluate(text => (window as unknown as { mockRecognition: { say: (text: string) => void } }).mockRecognition.say(text), text);
}

test("configuração oferece voz, sem agentes ou notificações; endpoints antigos não enviam", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByText("Voz do cliente (ElevenLabs)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Voz do cliente", { exact: true })).toBeVisible();
  await expect(page.getByText(/Agente conversacional|Feedback por e-mail|^Notificações$|^Rotinas$/)).toHaveCount(0);
  const setup = await (await page.request.get("/api/setup")).json();
  expect(setup.integracoes.map((i: { id: string }) => i.id)).toEqual(["openrouter", "elevenlabs-voz", "livekit", "mcp-crm"]);
  for (const path of ["/api/enviar-analise", "/api/rotinas/executar", "/webhook/elevenlabs"]) {
    expect((await page.request.post(path, { data: {} })).status()).toBe(410);
  }
});

test("voz envia uma vez após silêncio, permite interromper, pausar e usar teclado no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await instalarVoz(page);
  await abrirSala(page);
  const turnos: string[] = [];
  page.on("request", r => { if (r.url().endsWith("/conversar")) turnos.push(r.postData() ?? ""); });
  await page.getByRole("button", { name: "Iniciar microfone", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Estou ouvindo você");
  await falar(page, "Bom dia, como posso ajudar sua empresa?");
  await expect(page.getByRole("button", { name: "Interromper e falar" })).toBeVisible();
  expect(turnos).toHaveLength(1);
  await page.getByRole("button", { name: "Interromper e falar" }).click();
  await expect(page.getByRole("status")).toHaveText("Estou ouvindo você");
  await page.getByRole("button", { name: "Pausar microfone" }).click();
  await expect(page.getByRole("status")).toHaveText("Microfone pausado");
  expect(await page.evaluate(() => (window as unknown as { mockRecognition: { active: boolean } }).mockRecognition.active)).toBe(false);
  await page.screenshot({ path: "test-results/simulador-mobile.png", fullPage: true });
});

test("trocar para texto durante resposta impede áudio e retomada indevida; histórico persiste", async ({ page }) => {
  await instalarVoz(page);
  const codigo = await abrirSala(page);
  let liberar!: () => void;
  const espera = new Promise<void>(r => { liberar = r; });
  await page.route("**/conversar", async route => {
    const response = await route.fetch();
    await espera;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Iniciar microfone", exact: true }).click();
  await falar(page, "Quais são seus principais desafios?");
  await page.getByRole("button", { name: "Enviar fala agora" }).dblclick();
  await expect(page.getByRole("status")).toHaveText("O cliente está pensando…");
  await page.getByRole("button", { name: "Prefiro digitar" }).click();
  liberar();
  await expect(page.getByRole("status")).toHaveText("Sua vez de escrever");
  expect(await page.evaluate(() => (window as unknown as { speechCount: number }).speechCount)).toBe(0);
  await page.getByLabel("Sua mensagem").fill("Podemos combinar uma demonstração?");
  await page.getByLabel("Sua mensagem").press("Enter");
  await expect(page.getByRole("status")).toHaveText("Sua vez de escrever");
  await page.reload();
  await page.getByText(/Conversa completa/).click();
  await expect(page.getByRole("list", { name: "Conversa completa" }).getByRole("listitem").filter({ hasText: "Quais são seus principais desafios?" })).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Conversa completa" }).getByRole("listitem").filter({ hasText: "Podemos combinar uma demonstração?" })).toHaveCount(1);
  await page.getByRole("button", { name: "Encerrar e ver resultado" }).click();
  await expect(page.getByRole("button", { name: "Iniciar microfone", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Exemplo fixo/).first()).toBeVisible();
  expect(codigo).toBeTruthy();
});

test("microfone negado oferece texto e não deixa controle preso", async ({ page }) => {
  await instalarVoz(page, false);
  await abrirSala(page);
  await page.getByRole("button", { name: "Iniciar microfone", exact: true }).click();
  await expect(page.getByLabel("Sua mensagem")).toBeVisible();
  await expect(page.getByText(/microfone não está disponível/)).toBeVisible();
});

test("navegador sem reconhecimento pode continuar por texto", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined });
  });
  await abrirSala(page);
  await page.getByRole("button", { name: "Iniciar microfone", exact: true }).click();
  await expect(page.getByLabel("Sua mensagem")).toBeVisible();
  await expect(page.getByText(/Este navegador não reconhece fala/)).toBeVisible();
});

test("encerrar enquanto o cliente fala cancela o áudio e abre o resultado", async ({ page }) => {
  await instalarVoz(page);
  await abrirSala(page);
  await page.getByRole("button", { name: "Iniciar microfone", exact: true }).click();
  await falar(page, "Gostaria de entender como você vende hoje.");
  await expect(page.getByRole("button", { name: "Interromper e falar" })).toBeVisible();
  await page.getByRole("button", { name: "Encerrar e ver resultado" }).click();
  await expect(page.getByText(/Exemplo fixo/).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { mockRecognition: { active: boolean } }).mockRecognition.active)).toBe(false);
});

test("o resultado final do reconhecimento é enviado inteiro, inclusive ao parar manualmente", async ({ page }) => {
  await instalarVoz(page);
  await abrirSala(page);
  await page.getByRole("button", { name: "Iniciar microfone", exact: true }).click();
  await page.evaluate(() => {
    const rec = (window as unknown as { mockRecognition: { say: (text: string, final: boolean) => void; stop: () => void; onend: () => void; active: boolean } }).mockRecognition;
    rec.say("Bom dia", false);
    rec.stop = () => {
      rec.active = false;
      setTimeout(() => { rec.say("Bom dia, como está sua empresa?", true); rec.onend(); }, 10);
    };
  });
  const request = page.waitForRequest(r => r.url().endsWith("/conversar"));
  await page.getByRole("button", { name: "Enviar fala agora" }).click();
  expect((await request).postDataJSON().fala).toBe("Bom dia, como está sua empresa?");
});

test("dica curta acompanha a fala, persiste ao recarregar e feedback entrega plano", async ({ page }) => {
  await instalarVoz(page);
  const codigo = await abrirSala(page);
  await expect(page.getByLabel("Orientação do treino")).toContainText("Apresente-se");
  await page.getByRole("button", { name: "Prefiro digitar" }).click();
  await page.getByLabel("Sua mensagem").fill("Qual dificuldade você gostaria de resolver?");
  await page.getByLabel("Sua mensagem").press("Enter");
  const dica = page.getByLabel("Orientação do treino");
  await expect(dica).toContainText("Reconheça o tempo curto");
  await page.screenshot({ path: "test-results/conversa-dica.png", fullPage: true, animations: "disabled" });
  const primeira = await dica.textContent();
  await page.reload();
  await expect(dica).toHaveText(primeira!);
  const acesso = await page.request.post(`/api/salas/${codigo}/dica`, { data: { mensagemId: "outra-pessoa" } });
  expect(acesso.status()).toBe(409);
  await page.getByRole("button", { name: "Encerrar e ver resultado" }).click();
  await expect(page.getByText("Pontos a melhorar", { exact: true })).toBeVisible();
  await expect(page.getByText("Seu plano de ação rápido", { exact: true })).toBeVisible();
  await expect(page.getByText("Como conferir:", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/feedback-plano.png", fullPage: true, animations: "disabled" });
});

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Opt-in: usa o reconhecimento real do Chrome e sua conexão externa. Só a entrada
// do microfone é substituída por um WAV, para não captar áudio de quem executa.
const arquivo = process.env.VOZ_TESTE_ARQUIVO;
test.use({ channel: "chrome", launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test("Chrome transcreve áudio, envia a fala e recebe a resposta do cliente", async ({ page }) => {
  test.skip(!arquivo, "Defina VOZ_TESTE_ARQUIVO com um WAV de uma frase em português.");
  await page.route("**/audio-teste.wav", route => route.fulfill({ contentType: "audio/wav", body: readFileSync(arquivo!) }));
  await page.addInitScript(() => {
    const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
    const iniciar = Reconhecimento.prototype.start;
    Reconhecimento.prototype.start = function () {
      const audio = new AudioContext();
      const destino = audio.createMediaStreamDestination();
      const fonte = audio.createBufferSource();
      fonte.connect(destino);
      this.addEventListener("start", () => fonte.start(audio.currentTime + 0.3), { once: true });
      this.addEventListener("end", () => { void audio.close(); }, { once: true });
      void (async () => {
        fonte.buffer = await audio.decodeAudioData(await (await fetch("/audio-teste.wav")).arrayBuffer());
        await audio.resume();
        iniciar.call(this, destino.stream.getAudioTracks()[0]);
      })();
    };
  });
  const { itens } = await (await page.request.get("/api/simulacoes")).json();
  const codigo = itens.find((s: { status: string }) => s.status === "ativa").codigo;
  expect((await page.request.post(`/api/salas/${codigo}/identificar`, { data: { nome: "Voz Chrome", email: `chrome-${Date.now()}@example.com` } })).ok()).toBeTruthy();
  expect((await page.request.post(`/api/salas/${codigo}/sessao`)).ok()).toBeTruthy();
  expect((await page.request.put(`/api/salas/${codigo}/sessao`, { data: { modo: "voz-navegador" } })).ok()).toBeTruthy();
  await page.goto(`/simular/${codigo}?pronto=1`);
  const pedido = page.waitForRequest(r => r.url().endsWith("/conversar"));
  const resposta = page.waitForResponse(r => r.url().endsWith("/conversar"));
  await page.getByRole("button", { name: "Iniciar microfone", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Estou ouvindo você");
  const fala = (await pedido).postDataJSON().fala;
  expect(fala.length).toBeGreaterThan(10);
  const retorno = await resposta;
  expect(retorno.ok()).toBeTruthy();
  const cliente = (await retorno.json()).texto;
  await expect(page.getByText(cliente, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Pausar microfone" }).click();
  await page.getByText(/Conversa completa/).click();
  const conversa = page.getByRole("list", { name: "Conversa completa" });
  await expect(conversa.getByRole("listitem")).toHaveCount(2);
  await expect(conversa).toContainText(fala);
  await expect(conversa).toContainText(cliente);
});

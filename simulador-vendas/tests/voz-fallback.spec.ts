import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";

test("agente indisponível permite abrir microfone com voz do navegador", async ({ page }) => {
  const result = await build({
    stdin: { contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { SalaVoz } from "./components/SalaVoz";
      window.fetch = async url => Response.json(String(url).endsWith('/livekit') ? {url: 'wss://teste', token: 'teste'} : {dica: 'Apresente-se.'});
      createRoot(document.getElementById('root')).render(React.createElement(SalaVoz, {
        livekit: true, codigo: 'teste', marca: 'S', nome: 'Teste', titulo: 'Treino', cliente: {nome: 'Cliente', cargo: 'Gestor', empresa: 'Empresa'},
        objetivo: 'Conhecer o cliente', duracaoMin: 10, iniciadaEm: new Date().toISOString(), falasIniciais: [], porVoz: true, porTexto: true, vozDoServidor: false, voz: {rate: 1, pitch: 1}
      }));`, resolveDir: process.cwd(), loader: "tsx" },
    alias: { "livekit-client": path.resolve("tests/support/livekit-client.ts") },
    bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"production"' },
  });
  await page.clock.install();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: `
    window.process = { env: { NODE_ENV: "production" }, browser: true };
    class Reconhecimento {
      start() { window.microfoneAberto = true; this.onstart?.(); }
      stop() { setTimeout(() => this.onend?.(), 10); }
      abort() { this.stop(); }
    }
    window.SpeechRecognition = Reconhecimento;
    window.webkitSpeechRecognition = Reconhecimento;
  ` });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.getByRole("button", { name: "Iniciar microfone", exact: true }).click();
  await page.clock.runFor(26000);
  await expect(page.getByText(/O serviço de voz não respondeu/)).toBeVisible();
  await page.getByRole("button", { name: "Usar voz do navegador" }).click();
  await page.getByRole("button", { name: "Iniciar microfone", exact: true }).click();
  await expect(page.getByText("Estou ouvindo você", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { microfoneAberto: boolean }).microfoneAberto)).toBe(true);
});

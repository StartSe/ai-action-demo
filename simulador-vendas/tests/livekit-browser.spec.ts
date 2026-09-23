import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";

let script: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { useConversaLivekit } from "./components/useConversaLivekit";
      import { Room } from "livekit-client";
      window.pedidos = 0;
      window.fetch = async () => { window.pedidos++; return Response.json({url: "wss://teste", token: "teste"}); };
      window.salas = Room.salas;
      function Harness() {
        window.chamada = useConversaLivekit("teste", {estado: e => { window.estado = e; }, fala: () => {}, erro: e => { window.erro = e; }});
        return null;
      }
      const root = createRoot(document.getElementById("root"));
      window.desmontar = () => root.unmount();
      root.render(React.createElement(Harness));
    `, resolveDir: process.cwd(), loader: "tsx" },
    alias: { "livekit-client": path.resolve("tests/support/livekit-client.ts") },
    bundle: true, write: false, platform: "browser", format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  script = result.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => Boolean((window as unknown as Harness).chamada));
});

type Sala = { state: string; mensagens: string[]; microfones: boolean[]; pronto: () => void; agenteSaiu: () => void };
type Harness = { chamada: { iniciar: () => Promise<void>; pausar: () => Promise<void>; texto: (texto: string) => Promise<void>; finalizar: () => Promise<void> }; salas: Sala[]; pedidos: number; terminou?: boolean; erro?: string; estado?: string; desmontar: () => void };

test("texto aguarda o agente e cancela a abertura pendente do microfone", async ({ page }) => {
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.iniciar().catch(() => {}); });
  await page.waitForFunction(() => (window as unknown as Harness).salas[0]?.state === "connected");
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.texto("Bom dia").then(() => { w.terminou = true; }); });
  // A sala WebRTC já conectou, mas o agente ainda não está pronto.
  expect(await page.evaluate(() => (window as unknown as Harness).salas[0].mensagens)).toEqual([]);
  await page.evaluate(() => (window as unknown as Harness).salas[0].pronto());
  await page.waitForFunction(() => (window as unknown as Harness).terminou);
  const observado = await page.evaluate(() => { const w = window as unknown as Harness; return { pedidos: w.pedidos, mensagens: w.salas[0].mensagens, microfones: w.salas[0].microfones }; });
  expect(observado.pedidos).toBe(1);
  expect(observado.mensagens).toEqual(["Bom dia"]);
  expect(observado.microfones.at(-1)).toBe(false);
});

test("encerrar durante a conexão não abre o microfone depois", async ({ page }) => {
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.iniciar().catch(() => {}); });
  await page.waitForFunction(() => Boolean((window as unknown as Harness).salas[0]));
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.finalizar().then(() => { w.terminou = true; }); w.salas[0].pronto(); });
  await page.waitForFunction(() => (window as unknown as Harness).terminou);
  expect(await page.evaluate(() => (window as unknown as Harness).salas[0].microfones.at(-1))).toBe(false);
  expect(await page.evaluate(() => (window as unknown as Harness).salas[0].state)).toBe("disconnected");
});


test("publica o microfone antes de aguardar o agente, sem espera circular", async ({ page }) => {
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.iniciar().then(() => { w.terminou = true; }); });
  await page.waitForFunction(() => (window as unknown as Harness).salas[0]?.microfones.includes(true));
  expect(await page.evaluate(() => (window as unknown as Harness).terminou)).not.toBe(true);
  // Simula o agente que só consegue terminar a preparação após receber a faixa.
  await page.evaluate(() => (window as unknown as Harness).salas[0].pronto());
  await page.waitForFunction(() => (window as unknown as Harness).terminou);
});

test("queda do agente encerra a falsa escuta e permite abrir uma conexão nova", async ({ page }) => {
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.iniciar(); });
  await page.waitForFunction(() => (window as unknown as Harness).salas[0]?.state === "connected");
  await page.evaluate(() => (window as unknown as Harness).salas[0].pronto());
  await page.waitForFunction(() => (window as unknown as Harness).estado === "ouvindo");
  await page.evaluate(() => (window as unknown as Harness).salas[0].agenteSaiu());
  await page.waitForFunction(() => (window as unknown as Harness).estado === "parado");
  expect(await page.evaluate(() => (window as unknown as Harness).erro)).toContain("interrompida");
  expect(await page.evaluate(() => (window as unknown as Harness).salas[0].state)).toBe("disconnected");
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.iniciar(); });
  await page.waitForFunction(() => (window as unknown as Harness).salas[1]?.state === "connected");
  await page.evaluate(() => (window as unknown as Harness).salas[1].pronto());
  await page.waitForFunction(() => (window as unknown as Harness).estado === "ouvindo");
  expect(await page.evaluate(() => (window as unknown as Harness).pedidos)).toBe(2);
});

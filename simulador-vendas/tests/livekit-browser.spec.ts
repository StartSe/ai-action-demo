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
        window.chamada = useConversaLivekit("teste", {estado: () => {}, fala: () => {}, erro: () => {}});
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

type Sala = { state: string; mensagens: string[]; microfones: boolean[]; pronto: () => void };
type Harness = { chamada: { iniciar: () => Promise<void>; pausar: () => Promise<void>; texto: (texto: string) => Promise<void>; finalizar: () => Promise<void> }; salas: Sala[]; pedidos: number; terminou?: boolean; erro?: string; desmontar: () => void };

test("texto aguarda o agente e cancela a abertura pendente do microfone", async ({ page }) => {
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.iniciar(); });
  await page.waitForFunction(() => (window as unknown as Harness).salas[0]?.state === "connected");
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.texto("Bom dia").then(() => { w.terminou = true; }); });
  // A sala WebRTC já conectou, mas o agente ainda não está pronto.
  expect(await page.evaluate(() => (window as unknown as Harness).salas[0].mensagens)).toEqual([]);
  await page.evaluate(() => (window as unknown as Harness).salas[0].pronto());
  await page.waitForFunction(() => (window as unknown as Harness).terminou);
  const observado = await page.evaluate(() => { const w = window as unknown as Harness; return { pedidos: w.pedidos, mensagens: w.salas[0].mensagens, microfones: w.salas[0].microfones }; });
  expect(observado.pedidos).toBe(1);
  expect(observado.mensagens).toEqual(["Bom dia"]);
  expect(observado.microfones).not.toContain(true);
});

test("encerrar durante a conexão não abre o microfone depois", async ({ page }) => {
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.iniciar(); });
  await page.waitForFunction(() => Boolean((window as unknown as Harness).salas[0]));
  await page.evaluate(() => { const w = window as unknown as Harness; void w.chamada.finalizar().then(() => { w.terminou = true; }); w.salas[0].pronto(); });
  await page.waitForFunction(() => (window as unknown as Harness).terminou);
  expect(await page.evaluate(() => (window as unknown as Harness).salas[0].microfones)).not.toContain(true);
  expect(await page.evaluate(() => (window as unknown as Harness).salas[0].state)).toBe("disconnected");
});

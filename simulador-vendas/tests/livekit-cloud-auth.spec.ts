import { test, expect } from "./fixtures";
import { build } from "esbuild";

const cookie = (r: Response) => r.headers.get("set-cookie")!.split(";")[0];
function pedido(method: string, sessao = "", origin = "http://localhost") {
  return new Request("http://localhost/api/setup/livekit-cloud", { method, headers: { origin, cookie: sessao } });
}

test("autorização guarda credenciais cifradas, exige navegador de origem e permite repetir a confirmação", async () => {
  const { POST, PUT } = await import("../app/api/setup/livekit-cloud/route");
  const { getConfig, abrirBanco, setConfig } = await import("../lib/store");
  const original = globalThis.fetch;
  const conta = process.env.CONTA_DESLIGADA;
  process.env.CONTA_DESLIGADA = "1";
  let chamadas = 0;
  globalThis.fetch = async url => {
    chamadas++;
    if (String(url).includes("/cli/auth?")) return Response.json({ Token: "token-aprovacao", Expires: Math.floor(Date.now() / 1000) + 900 });
    return Response.json({ Key: "chave-do-projeto", Secret: "segredo-do-projeto", URL: "wss://projeto.livekit.cloud", ProjectName: "Projeto" });
  };
  try {
    expect((await POST(pedido("POST", "", "https://outro-site.test"))).status).toBe(403);
    expect(chamadas).toBe(0);
    const inicio = await POST(pedido("POST"));
    expect(inicio.status).toBe(200);
    expect(inicio.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    expect((await inicio.json()).url).toBe("https://cloud.livekit.io/cli/confirm-auth?t=token-aprovacao");
    expect((await PUT(pedido("PUT"))).status).toBe(401);
    const concluido = await PUT(pedido("PUT", cookie(inicio)));
    expect(await concluido.json()).toEqual({ conectada: true });
    expect(getConfig("LIVEKIT_API_SECRET")).toBe("segredo-do-projeto");
    const registro = abrirBanco().prepare("SELECT valor FROM config WHERE chave = 'LIVEKIT_API_SECRET'").get() as { valor: string };
    expect(registro.valor).toMatch(/^v1:/);
    expect(registro.valor).not.toContain("segredo-do-projeto");
    expect(await (await PUT(pedido("PUT", cookie(inicio)))).json()).toEqual({ conectada: true });
    expect(chamadas).toBe(2);
  } finally {
    globalThis.fetch = original;
    if (conta === undefined) delete process.env.CONTA_DESLIGADA; else process.env.CONTA_DESLIGADA = conta;
    for (const chave of ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "_LIVEKIT_CLOUD_AUTORIZACAO"]) setConfig(chave, null);
  }
});

test("cancelar durante a consulta impede gravar credenciais que chegam depois", async () => {
  const { iniciarConexaoLivekit, consultarConexaoLivekit, cancelarConexaoLivekit } = await import("../lib/livekit-cloud-auth");
  const { getConfig } = await import("../lib/store");
  const original = globalThis.fetch;
  let liberar!: (r: Response) => void;
  globalThis.fetch = async url => String(url).includes("/cli/auth?")
    ? Response.json({ Token: "temporario", Expires: Date.now() / 1000 + 900 })
    : new Promise<Response>(resolve => { liberar = resolve; });
  try {
    const auth = await iniciarConexaoLivekit();
    const resultado = consultarConexaoLivekit(auth.id);
    cancelarConexaoLivekit(auth.id);
    liberar(Response.json({ Key: "chave", Secret: "segredo", URL: "wss://projeto.livekit.cloud" }));
    await expect(resultado).rejects.toThrow("cancelada");
    expect(getConfig("LIVEKIT_API_KEY")).toBeUndefined();
  } finally { globalThis.fetch = original; }
});

test("espera aprovação, rejeita retorno inválido e preserva as credenciais anteriores", async () => {
  const { iniciarConexaoLivekit, consultarConexaoLivekit, cancelarConexaoLivekit } = await import("../lib/livekit-cloud-auth");
  const { getConfig, setConfig } = await import("../lib/store");
  const original = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes("/cli/auth?")
    ? Response.json({ Token: "temporario", Expires: Date.now() / 1000 + 900 })
    : new Response(null, { status: 401 });
  const auth = await iniciarConexaoLivekit();
  try {
    setConfig("LIVEKIT_API_KEY", "anterior");
    expect(await consultarConexaoLivekit(auth.id)).toEqual({ conectada: false });
    const salvo = JSON.parse(getConfig("_LIVEKIT_CLOUD_AUTORIZACAO")!);
    setConfig("_LIVEKIT_CLOUD_AUTORIZACAO", JSON.stringify({ ...salvo, proximaConsulta: 0 }));
    globalThis.fetch = async () => Response.json({ Key: "nova", Secret: "segredo", URL: "http://localhost:1234" });
    await expect(consultarConexaoLivekit(auth.id)).rejects.toThrow("não concluiu");
    expect(getConfig("LIVEKIT_API_KEY")).toBe("anterior");
    setConfig("_LIVEKIT_CLOUD_AUTORIZACAO", JSON.stringify({ ...salvo, expira: Date.now() - 1 }));
    await expect(consultarConexaoLivekit(auth.id)).rejects.toThrow("expirou");
  } finally { cancelarConexaoLivekit(auth.id); setConfig("LIVEKIT_API_KEY", null); globalThis.fetch = original; }
});

test("botão abre autorização, acompanha a aprovação e atualiza configurações", async ({ page }) => {
  const result = await build({ stdin: { contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {ConectarLivekit} from "./components/ConectarLivekit";
    window.open = () => null;
    window.fetch = async (_url, options) => options.method === "POST"
      ? Response.json({url: "https://cloud.livekit.io/cli/confirm-auth?t=teste", expira: Date.now()+900000})
      : Response.json({conectada: true});
    createRoot(document.getElementById("root")).render(React.createElement(ConectarLivekit, {configurada:false,porAmbiente:false,aoConectar:()=>{document.title="conectado"}}));
  `, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"production"' } });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.getByRole("button", { name: "Conectar LiveKit Cloud" }).click();
  await expect(page.getByRole("link", { name: "Abrir autorização no LiveKit" })).toHaveAttribute("href", "https://cloud.livekit.io/cli/confirm-auth?t=teste");
  await expect(page.getByRole("status")).toContainText("credenciais foram salvas", { timeout: 8000 });
  await expect(page).toHaveTitle("conectado");
});

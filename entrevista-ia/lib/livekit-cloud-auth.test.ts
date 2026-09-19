import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-autorizacao-"));
process.env.DATA_DIR = pasta;
delete process.env.CONTA_DESLIGADA;
const { getConfig, setConfig, abrirBanco } = await import("./store");
const { criarConta, entrar, cookieDeSessao } = await import("./conta");
const { POST, PUT, DELETE } = await import("../app/api/setup/livekit-cloud/route");
const { iniciarConexaoLivekit, consultarConexaoLivekit, cancelarConexaoLivekit } = await import("./livekit-cloud-auth");
criarConta({ nome: "Teste", email: "teste@example.com", senha: "SenhaTeste!987654" });
const sessao = cookieDeSessao(entrar({ email: "teste@example.com", senha: "SenhaTeste!987654" }).token, true).split(";")[0];
const chaves = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "_LIVEKIT_CLOUD_AUTORIZACAO"];
beforeEach(() => { for (const chave of chaves) { delete process.env[chave]; setConfig(chave, null); } });
after(() => { abrirBanco().close(); fs.rmSync(pasta, { recursive: true, force: true }); });
function pedido(method: string, cookie = "", origin = "https://app.test", logado = true) {
  return new Request("https://app.test/api/setup/livekit-cloud", { method, headers: { origin, cookie: [logado ? sessao : "", cookie].join("; ") } });
}
const token = () => Response.json({ Token: "aprovacao-teste", Expires: Math.floor(Date.now() / 1000) + 900 });
const credenciais = () => Response.json({ Key: "chave-teste", Secret: "segredo-teste", URL: "wss://projeto.livekit.cloud" });
const cookie = (r: Response) => r.headers.get("set-cookie")!.split(";")[0];

test("rotas exigem login, origem e cookie da autorização", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => token());
  for (const [method, route] of [["POST", POST], ["PUT", PUT], ["DELETE", DELETE]] as const) {
    assert.equal((await route(pedido(method, "", "https://app.test", false))).status, 401);
    assert.equal((await route(pedido(method, "", "https://outro.test"))).status, 403);
  }
  assert.equal((await PUT(pedido("PUT"))).status, 401);
  assert.equal(mock.mock.callCount(), 0);
});

test("autoriza, cifra os três campos e confirma sem expor segredo ao navegador", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).includes("/cli/auth?") ? token() : credenciais());
  const inicio = await POST(pedido("POST"));
  assert.equal(inicio.status, 200);
  assert.match(inicio.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict.*Secure/);
  assert.deepEqual(Object.keys(await inicio.clone().json()).sort(), ["expira", "url"]);
  assert.equal((await inicio.json()).url, "https://cloud.livekit.io/cli/confirm-auth?t=aprovacao-teste");
  const resultado = await PUT(pedido("PUT", cookie(inicio)));
  assert.deepEqual(await resultado.json(), { conectada: true });
  assert.equal(getConfig("LIVEKIT_API_SECRET"), "segredo-teste");
  for (const chave of chaves.slice(0, 3)) {
    const linha = abrirBanco().prepare("SELECT valor FROM config WHERE chave = ?").get(chave) as { valor: string };
    assert.match(linha.valor, /^v1:/);
    assert.ok(!linha.valor.includes("segredo-teste"));
  }
  assert.ok(!getConfig("_LIVEKIT_CLOUD_AUTORIZACAO")!.includes("aprovacao-teste"));
  assert.deepEqual(await (await PUT(pedido("PUT", cookie(inicio)))).json(), { conectada: true });
  assert.equal(mock.mock.callCount(), 2);
});

test("aguarda aprovação, limita consultas, recusa URL inválida e preserva conexão anterior", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).includes("/cli/auth?") ? token() : new Response(null, { status: 401 }));
  const auth = await iniciarConexaoLivekit();
  setConfig("LIVEKIT_API_KEY", "anterior");
  assert.deepEqual(await consultarConexaoLivekit(auth.id), { conectada: false });
  assert.deepEqual(await consultarConexaoLivekit(auth.id), { conectada: false });
  assert.equal(mock.mock.callCount(), 2);
  const salvo = JSON.parse(getConfig("_LIVEKIT_CLOUD_AUTORIZACAO")!);
  setConfig("_LIVEKIT_CLOUD_AUTORIZACAO", JSON.stringify({ ...salvo, proximaConsulta: 0 }));
  mock.mock.mockImplementation(async () => Response.json({ Key: "nova", Secret: "novo", URL: "http://localhost:1234" }));
  await assert.rejects(consultarConexaoLivekit(auth.id), /não concluiu/);
  assert.equal(getConfig("LIVEKIT_API_KEY"), "anterior");
  setConfig("_LIVEKIT_CLOUD_AUTORIZACAO", JSON.stringify({ ...salvo, expira: Date.now() - 1 }));
  await assert.rejects(consultarConexaoLivekit(auth.id), /expirou/);
  assert.equal(getConfig("_LIVEKIT_CLOUD_AUTORIZACAO"), undefined);
});

test("cancelamento impede resposta tardia de substituir credenciais", async (t) => {
  let liberar!: (r: Response) => void;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).includes("/cli/auth?") ? token() : new Promise<Response>(resolve => { liberar = resolve; }));
  const auth = await iniciarConexaoLivekit();
  const consulta = consultarConexaoLivekit(auth.id);
  cancelarConexaoLivekit(auth.id);
  liberar(credenciais());
  await assert.rejects(consulta, /cancelada/);
  assert.equal(getConfig("LIVEKIT_API_SECRET"), undefined);
});

test("recusa do provedor encerra tentativa e configuração por ambiente bloqueia troca", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).includes("/cli/auth?") ? token() : new Response(null, { status: 404 }));
  const auth = await iniciarConexaoLivekit();
  await assert.rejects(iniciarConexaoLivekit(), /em andamento/);
  await assert.rejects(consultarConexaoLivekit(auth.id), /recusado/);
  assert.equal(getConfig("_LIVEKIT_CLOUD_AUTORIZACAO"), undefined);
  process.env.LIVEKIT_URL = "wss://ambiente.livekit.cloud";
  try { await assert.rejects(iniciarConexaoLivekit(), /ambiente/); }
  finally { delete process.env.LIVEKIT_URL; }
});

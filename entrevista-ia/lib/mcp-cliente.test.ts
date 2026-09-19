import assert from "node:assert/strict";
import { test } from "node:test";
import { chamar, conectar, ErroMCP, listarFerramentas } from "./mcp-cliente";
import { chamarFerramenta, esquecerFerramentas, testarPesquisa, conexaoBrightData, FERRAMENTAS } from "./pesquisa-cliente";

function json(id: number, result: unknown, headers: Record<string, string> = {}) {
  return Response.json({ jsonrpc: "2.0", id, result }, { headers });
}
const inicializacao = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "teste", version: "1" } };

test("Bright Data: teste de conexão inicializa sessão e a pesquisa a reutiliza", async (t) => {
  const metodos: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(new URL(url).searchParams.get("token"), "token-falso");
    const pedido = JSON.parse(init.body as string);
    const headers = new Headers(init.headers);
    assert.equal(headers.get("Accept"), "application/json, text/event-stream");
    metodos.push(pedido.method);
    if (pedido.method === "initialize") {
      assert.equal(headers.get("Mcp-Session-Id"), null);
      return json(pedido.id, inicializacao, { "Mcp-Session-Id": "sessao-teste" });
    }
    assert.equal(headers.get("Mcp-Session-Id"), "sessao-teste");
    assert.equal(headers.get("MCP-Protocol-Version"), "2025-03-26");
    if (pedido.method === "notifications/initialized") {
      assert.equal(pedido.id, undefined);
      return new Response(null, { status: 202 });
    }
    if (pedido.method === "tools/list") return json(pedido.id, { tools: Object.values(FERRAMENTAS).map((name) => ({ name })) });
    return json(pedido.id, { content: [{ type: "text", text: '{"encontrado":true}' }] });
  });
  esquecerFerramentas();
  const config = { BRIGHTDATA_API_TOKEN: "token-falso", BRIGHTDATA_MCP_URL: "https://teste.invalid/mcp" };
  assert.equal((await testarPesquisa(config)).ok, true);
  const valor = await chamarFerramenta("search_engine", {}, { conexao: conexaoBrightData(config) });
  assert.deepEqual(valor, { encontrado: true });
  assert.deepEqual(metodos, ["initialize", "notifications/initialized", "tools/list", "tools/call"]);
});

test("SSE fragmentado: ignora progresso e cancela stream após resposta, mesmo aberto", async (t) => {
  let cancelado = false;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const p = JSON.parse(init.body as string);
    if (p.method === "initialize") return json(p.id, inicializacao);
    if (p.method === "notifications/initialized") return new Response(null, { status: 202 });
    const texto = `: ping\r\n\r\ndata: {"method":"notifications/progress"}\r\n\r\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: p.id, result: { content: [{ type: "text", text: "Olá" }] } })}\r\n\r\n`;
    return new Response(new ReadableStream({ start(c) { for (const byte of new TextEncoder().encode(texto)) c.enqueue(Uint8Array.of(byte)); }, cancel() { cancelado = true; } }), { headers: { "content-type": "text/event-stream" } });
  });
  assert.equal(await chamar(conectar("https://teste.invalid/sse"), "busca", {}), "Olá");
  assert.equal(cancelado, true);
});

test("sessão expirada é reinicializada uma vez; chamadas concorrentes compartilham initialize", async (t) => {
  let inicios = 0;
  let chamadas = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const p = JSON.parse(init.body as string);
    if (p.method === "initialize") return json(p.id, inicializacao, { "Mcp-Session-Id": `s${++inicios}` });
    if (p.method === "notifications/initialized") return new Response(null, { status: 202 });
    chamadas++;
    if (new Headers(init.headers).get("Mcp-Session-Id") === "s1") return new Response("Expired", { status: 404 });
    return json(p.id, { tools: [] });
  });
  const c = conectar("https://teste.invalid/mcp");
  await Promise.all([listarFerramentas(c), listarFerramentas(c)]);
  assert.equal(inicios, 2);
  assert.equal(chamadas, 4);
});

test("401 original é traduzido sem segunda sondagem sem sessão", async (t) => {
  let chamadas = 0;
  t.mock.method(globalThis, "fetch", async () => { chamadas++; return new Response("Unauthorized", { status: 401 }); });
  const resultado = await testarPesquisa({ BRIGHTDATA_API_TOKEN: "fake", BRIGHTDATA_MCP_URL: "https://recusado.invalid/mcp" });
  assert.match(resultado.mensagem, /token foi recusado/);
  assert.equal(chamadas, 1);
});

test("erro de ferramenta não é sucesso nem causa repetição automática", async (t) => {
  let chamadas = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const p = JSON.parse(init.body as string);
    if (p.method === "initialize") return json(p.id, inicializacao);
    if (p.method === "notifications/initialized") return new Response(null, { status: 202 });
    chamadas++;
    return json(p.id, { isError: true, content: [{ type: "text", text: "quota exceeded" }] });
  });
  await assert.rejects(chamar(conectar("https://erro.invalid/mcp"), "search_engine", {}), (e: unknown) => e instanceof ErroMCP && e.detalhe === "quota exceeded");
  assert.equal(chamadas, 1);
});

test("servidor sem sessão: autenticação e paginação das ferramentas", async (t) => {
  const cursores: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const p = JSON.parse(init.body as string);
    const headers = new Headers(init.headers);
    assert.equal(headers.get("Authorization"), "Bearer teste");
    assert.equal(headers.get("Mcp-Session-Id"), null);
    if (p.method === "initialize") return json(p.id, inicializacao);
    if (p.method === "notifications/initialized") return new Response(null, { status: 202 });
    cursores.push(p.params.cursor);
    return json(p.id, p.params.cursor ? { tools: [{ name: "segunda" }] } : { tools: [{ name: "primeira" }], nextCursor: "pagina2" });
  });
  assert.deepEqual((await listarFerramentas(conectar("https://stateless.invalid/mcp", "teste"))).map((f) => f.nome), ["primeira", "segunda"]);
  assert.deepEqual(cursores, [undefined, "pagina2"]);
});

test("renovação tem limite; falha de rede não repete ferramentas", async (t) => {
  let inicios = 0;
  let chamadas = 0;
  let rede = false;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const p = JSON.parse(init.body as string);
    if (p.method === "initialize") { inicios++; return json(p.id, inicializacao, { "Mcp-Session-Id": "sessao" }); }
    if (p.method === "notifications/initialized") return new Response(null, { status: 202 });
    chamadas++;
    if (rede) throw new TypeError("fetch failed");
    return new Response("expired", { status: 404 });
  });
  await assert.rejects(listarFerramentas(conectar("https://expira.invalid/mcp")), (e: unknown) => e instanceof ErroMCP && e.status === 404);
  assert.equal(inicios, 2);
  assert.equal(chamadas, 2);
  rede = true;
  await assert.rejects(chamar(conectar("https://rede.invalid/mcp"), "tool", {}), (e: unknown) => e instanceof ErroMCP && e.status === 0);
  assert.equal(chamadas, 3);
});

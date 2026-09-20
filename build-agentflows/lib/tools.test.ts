import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "agentflows-tools-"));
process.env.DATA_DIR = dir;
const { setConfig } = await import("./store");
const tools = await import("./tools");
const store = await import("./flow-store");
const { block } = await import("./flow-types");
const { chatGPT } = await import("./chatgpt");
chatGPT().account = async () => ({
  account: { type: "chatgpt", email: "t@example.com", planType: "plus" },
  login: null,
  error: null,
});
test.after(() => rmSync(dir, { recursive: true, force: true }));
test("calculadora resolve expressões sem executar código", () => {
  assert.equal(tools.calculate("(1200*0.15)+80"), 260);
  assert.equal(tools.calculate("2^3^2"), 512);
  assert.equal(tools.calculate("-4 + 10 % 3"), -3);
  assert.equal(tools.calculate("1,5*2"), 3);
  assert.throws(() => tools.calculate("process.exit()"), /apenas números/);
  assert.throws(() => tools.calculate("(1+2"), /Parêntese/);
  assert.throws(() => tools.calculate("1/0"), /não é um número/);
});
test("requisição HTTP recusa endereços internos", async () => {
  assert.equal(tools.isPrivateHost("localhost"), true);
  assert.equal(tools.isPrivateHost("192.168.1.10"), true);
  assert.equal(tools.isPrivateHost("api.exemplo.com"), false);
  await assert.rejects(() => tools.fetchText("http://127.0.0.1:3000/x"), /não pode ser acessado/);
  await assert.rejects(() => tools.fetchText("ftp://exemplo.com"), /não pode ser acessado/);
});
test("catálogo agrupa ferramentas prontas e de cada servidor; ids antigos apontam para Ferramentas", async () => {
  const fetch0 = globalThis.fetch;
  setConfig("FERRAMENTAS_URL", "https://tools.example/mcp");
  setConfig("FERRAMENTAS_CODIGO", "abc");
  const crm = (await import("./conexoes")).adicionarServidorMCP("CRM", "https://crm.example/mcp", "xyz");
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body));
    if (String(url).includes("crm.example") && b.method === "tools/list")
      return Response.json({ result: { tools: [{ name: "criar_contato", description: "Cria contato" }] } });
    if (b.method === "tools/list")
      return Response.json({ result: { tools: [{ name: "buscar", inputSchema: { type: "object" } }] } });
    return Response.json({ result: { content: [{ type: "text", text: JSON.stringify({ ok: true, name: b.params.name }) }] } });
  }) as typeof fetch;
  try {
    const groups = await tools.listTools();
    assert.deepEqual(
      groups.map((g) => g.name),
      ["Ferramentas prontas", "Ferramentas", "CRM"],
    );
    const builtin = groups[0].tools.map((t) => t.name);
    assert.ok(builtin.includes("calculadora") && builtin.includes("executar_fluxo"));
    assert.ok(!builtin.includes("enviar_whatsapp"), "WhatsApp só aparece quando conectado");
    assert.equal(groups[2].tools[0].id, `mcp:${crm.prefixo}:criar_contato`);
    const resolved = await tools.resolveTools(["buscar", `mcp:${crm.prefixo}:criar_contato`, "interno:calculadora"]);
    assert.deepEqual(resolved.map((t) => t.name), ["calculadora", "buscar", "criar_contato"]);
    assert.match(await resolved[1].call({ q: 1 }), /"name":"buscar"/);
    assert.equal(await resolved[0].call({ expressao: "2+2" }), "4");
    await assert.rejects(() => tools.resolveTools(["interno:enviar_whatsapp"]), /não está disponível/);
    await assert.rejects(() => tools.resolveTools(["mcp:FERRAMENTAS:inexistente"]), /não está disponível/);
  } finally {
    globalThis.fetch = fetch0;
    (await import("./conexoes")).removerServidorMCP(crm.prefixo);
  }
});
test("executar_fluxo roda um fluxo publicado pelo nome", async () => {
  const f = store.createFlow("Resumo");
  const g = {
    nodes: [block("start", "inicio", 0, 0), block("end", "fim", 0, 0)],
    edges: [{ id: "1", source: "inicio", target: "fim" }],
  };
  g.nodes[1].data.config.text = "Recebido: {{input}}";
  store.saveFlow(f.id, { name: f.name, description: "", graph: g });
  store.publishFlow(f.id);
  const out = await tools.callTool("interno:executar_fluxo", { fluxo: "resumo", entrada: "olá" });
  assert.deepEqual(JSON.parse(out).output, "Recebido: olá");
  await assert.rejects(() => tools.callTool("interno:executar_fluxo", { fluxo: "nada", entrada: "x" }), /não encontrado/);
});

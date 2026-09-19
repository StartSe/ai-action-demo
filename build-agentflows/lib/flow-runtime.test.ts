import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "agentflows-test-"));
process.env.DATA_DIR = dir;
const store = await import("./flow-store");
const runtime = await import("./flow-runtime");
const { setConfig } = await import("./store");
const { block, template } = await import("./flow-types");
const { FERRAMENTAS } = await import("./ferramentas");
test.after(() => rmSync(dir, { recursive: true, force: true }));
function flow(graph = template()) {
  const f = store.createFlow("Teste");
  return store.saveFlow(f.id, { name: f.name, description: "", graph });
}
test("demo executa grafo, referências e preserva versão publicada", async () => {
  const f = flow();
  store.publishFlow(f.id);
  const g = template();
  g.nodes[2].data.config.text = "rascunho";
  store.saveFlow(f.id, { name: "Editado", description: "", graph: g });
  const r = await runtime.startRun(f.id, "Olá", true, true);
  assert.equal(r.status, "completed");
  assert.equal(r.version, 1);
  assert.match(r.output, /Demonstração/);
  assert.equal(r.trace.length, 3);
  const draft = await runtime.startRun(f.id, "Olá", false, true);
  assert.equal(draft.output, "rascunho");
  assert.equal(draft.version, 0);
  store.publishFlow(f.id, false);
  await assert.rejects(() => runtime.startRun(f.id, "Olá", true), /Publique/);
});
test("grafo inválido recusa IDs repetidos, conexões incompletas e blocos órfãos", () => {
  const g = template();
  g.nodes.push(g.nodes[0]);
  assert.throws(() => store.validateGraph(g), /inválido/);
  const b = template();
  b.edges = [];
  assert.throws(() => store.validateGraph(b, true), /Conecte/);
  const c = template();
  c.nodes.push(block("end", "orfao", 0, 0));
  assert.throws(() => store.validateGraph(c, true), /conectados/);
  const d = template();
  d.nodes[0].data.config.state = "[]";
  assert.throws(() => store.validateGraph(d, true), /estado inicial/);
});
test("condição respeita saídas e estado compartilhado", async () => {
  const start = block("start", "start", 0, 0),
    state = block("state", "save", 0, 0),
    condition = block("condition", "check", 0, 0),
    yes = block("end", "yes", 0, 0),
    no = block("end", "no", 0, 0);
  state.data.config = { key: "assunto", value: "{{input}}" };
  condition.data.config.value = "{{state.assunto}}";
  yes.data.config.text = "Prioritário: {{nodes.save}}";
  no.data.config.text = "Normal";
  const f = flow({
    nodes: [start, state, condition, yes, no],
    edges: [
      { id: "1", source: "start", target: "save" },
      { id: "2", source: "save", target: "check" },
      { id: "3", source: "check", target: "yes", sourceHandle: "yes" },
      { id: "4", source: "check", target: "no", sourceHandle: "no" },
    ],
  });
  assert.equal(
    (await runtime.startRun(f.id, "urgente", false, true)).output,
    "Prioritário: urgente",
  );
  assert.equal(
    (await runtime.startRun(f.id, "olá", false, true)).output,
    "Normal",
  );
});
test("aprovação persiste e só uma decisão pode retomar o checkpoint", async () => {
  const g = template();
  g.nodes[1] = block("approval", "analista", 0, 0);
  g.edges[1].sourceHandle = "yes";
  g.nodes.push(block("end", "rejeitada", 0, 0));
  g.nodes[3].data.config.text = "Não aprovado";
  g.edges.push({
    id: "no",
    source: "analista",
    target: "rejeitada",
    sourceHandle: "no",
  });
  const f = flow(g);
  const r = await runtime.startRun(f.id, "Revisar", false, true);
  assert.equal(r.status, "waiting");
  store.interruptRuns();
  assert.equal(store.getRun(r.id).status, "waiting");
  assert.throws(() => store.deleteFlow(f.id), /pendentes/);
  const resumed = await runtime.resumeRun(r.id, "no");
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.output, "Não aprovado");
  await assert.rejects(() => runtime.resumeRun(r.id, "yes"), /aguardando/);
  const again = await runtime.startRun(f.id, "Revisar", false, true);
  assert.equal(runtime.cancelRun(again.id).status, "cancelled");
  await assert.rejects(() => runtime.resumeRun(again.id, "yes"), /aguardando/);
});
test("repetição tem limite e registro por passagem", async () => {
  const a = block("start", "s", 0, 0),
    l = block("loop", "l", 0, 0),
    v = block("state", "v", 0, 0),
    e = block("end", "e", 0, 0);
  v.data.config = { key: "a", value: "{{last}}!" };
  const f = flow({
    nodes: [a, l, v, e],
    edges: [
      { id: "a", source: "s", target: "l" },
      { id: "b", source: "l", target: "v", sourceHandle: "repeat" },
      { id: "c", source: "v", target: "l" },
      { id: "d", source: "l", target: "e", sourceHandle: "done" },
    ],
  });
  const r = await runtime.startRun(f.id, "x", false, true);
  assert.equal(r.status, "completed");
  assert.equal(r.output, "x!!!");
  assert.equal(r.visits.l, 4);
});
test("referência ausente falha com diagnóstico e mantém etapas", async () => {
  const g = template();
  g.nodes[2].data.config.text = "{{state.ausente}}";
  const f = flow(g);
  const r = await runtime.startRun(f.id, "x", false, true);
  assert.equal(r.status, "failed");
  assert.match(r.error!, /não tem valor/);
  assert.equal(r.trace.length, 2);
});
test("sem chave, demo nunca realiza chamadas externas", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("NÃO DEVERIA CHAMAR");
  };
  try {
    const g = template();
    g.nodes[1] = block("http", "analista", 0, 0);
    g.nodes[1].data.config.url = "https://example.com";
    const f = flow(g);
    const r = await runtime.startRun(f.id, "x");
    assert.equal(r.demo, true);
    assert.equal(r.status, "completed");
  } finally {
    globalThis.fetch = original;
  }
});
test("agente real escolhe ferramenta MCP autorizada e usa retorno", async () => {
  const original = globalThis.fetch;
  setConfig("OPENROUTER_API_KEY", "test-key");
  setConfig("FERRAMENTAS_URL", "https://tools.example/mcp");
  setConfig("FERRAMENTAS_CODIGO", "test-code");
  let calls = 0;
  const bodies: unknown[] = [];
  globalThis.fetch = async (url, init) => {
    const b = JSON.parse(init?.body as string);
    bodies.push(b);
    if (String(url).includes("tools.example")) {
      if (b.method === "tools/list")
        return Response.json({
          result: {
            tools: [
              {
                name: "buscar",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        });
      return Response.json({
        result: { content: [{ type: "text", text: "Encontrado" }] },
      });
    }
    calls++;
    return Response.json({
      choices: [
        {
          message:
            calls === 1
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "tool1",
                      type: "function",
                      function: { name: "buscar", arguments: "{}" },
                    },
                  ],
                }
              : {
                  role: "assistant",
                  content: "Resultado da ferramenta incorporado.",
                },
        },
      ],
    });
  };
  try {
    const g = template();
    g.nodes[1].data.config.tools = "buscar";
    const f = flow(g);
    const r = await runtime.startRun(f.id, "Pesquisar", false, false);
    assert.equal(r.status, "completed");
    assert.equal(r.demo, false);
    assert.equal(calls, 2);
    assert.match(r.output, /incorporado/);
    assert.ok(r.trace.some((t) => t.label === "Ferramenta: buscar"));
    assert.equal(bodies.length, 4);
  } finally {
    globalThis.fetch = original;
    setConfig("OPENROUTER_API_KEY", null);
    setConfig("FERRAMENTAS_URL", null);
    setConfig("FERRAMENTAS_CODIGO", null);
  }
});
test("erros MCP e HTTP encerram a execução sem respostas de sucesso", async () => {
  const original = globalThis.fetch;
  setConfig("OPENROUTER_API_KEY", "test-key");
  setConfig("FERRAMENTAS_URL", "https://tools.example/mcp");
  setConfig("FERRAMENTAS_CODIGO", "test-code");
  try {
    globalThis.fetch = async () =>
      Response.json({
        result: { isError: true, content: [{ text: "Falhou" }] },
      });
    const g = template();
    g.nodes[1] = block("tool", "analista", 0, 0);
    g.nodes[1].data.config.tool = "buscar";
    let f = flow(g);
    assert.equal((await runtime.startRun(f.id, "x")).status, "failed");
    g.nodes[1] = block("http", "analista", 0, 0);
    g.nodes[1].data.config.url = "https://api.example";
    globalThis.fetch = async () => new Response("falha", { status: 503 });
    f = flow(g);
    const r = await runtime.startRun(f.id, "x");
    assert.equal(r.status, "failed");
    assert.match(r.error!, /503/);
  } finally {
    globalThis.fetch = original;
    setConfig("OPENROUTER_API_KEY", null);
  }
});
test("MCP lista apenas publicados e execução usa o mesmo motor", async () => {
  const f = flow();
  store.publishFlow(f.id);
  const list = (await FERRAMENTAS[0].executar({})) as { id: string }[];
  assert.ok(list.some((x) => x.id === f.id));
  const r = (await FERRAMENTAS[1].executar({ id: f.id, input: "Olá" })) as {
    status: string;
  };
  assert.equal(r.status, "completed");
});
test("reinício marca execução ativa interrompida sem repetir ações", () => {
  const f = flow();
  const now = new Date().toISOString();
  store.putRun({
    id: "interrupted",
    flowId: f.id,
    name: f.name,
    version: 0,
    status: "running",
    demo: true,
    input: "x",
    output: "",
    graph: f.graph,
    next: "inicio",
    state: {},
    outputs: {},
    visits: {},
    trace: [],
    createdAt: now,
    updatedAt: now,
  });
  store.interruptRuns();
  assert.equal(store.getRun("interrupted").status, "failed");
});

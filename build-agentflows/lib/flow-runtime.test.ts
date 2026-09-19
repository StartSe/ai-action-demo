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
const { chatGPT } = await import("./chatgpt");
const bridge = chatGPT();
bridge.account = async () => ({
  account: { type: "chatgpt", email: "teste@example.com", planType: "plus" },
  login: null,
  error: null,
});
bridge.run = async () => "Resposta ChatGPT simulada no teste";
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
test("somente ChatGPT: chave antiga nunca habilita execução real", async () => {
  const account = bridge.account;
  bridge.account = async () => ({ account: null, login: null, error: null });
  setConfig("OPENROUTER_API_KEY", "chave-antiga-ignorada");
  try {
    const f = flow();
    await assert.rejects(
      () => runtime.startRun(f.id, "Olá"),
      /Conecte o ChatGPT/,
    );
    assert.equal((await runtime.startRun(f.id, "Olá", false, true)).demo, true);
  } finally {
    bridge.account = account;
    setConfig("OPENROUTER_API_KEY", null);
  }
});
test("simulação explícita nunca usa ChatGPT ou ferramentas externas", async () => {
  const fetch = globalThis.fetch,
    run = bridge.run;
  globalThis.fetch = async () => {
    throw Error("Não deve chamar");
  };
  bridge.run = async () => {
    throw Error("Não deve chamar");
  };
  try {
    const g = template();
    g.nodes[1] = block("http", "analista", 0, 0);
    g.nodes[1].data.config.url = "https://example.com";
    const r = await runtime.startRun(flow(g).id, "Olá", false, true);
    assert.equal(r.status, "completed");
    assert.match(r.output, /Demonstração/);
  } finally {
    globalThis.fetch = fetch;
    bridge.run = run;
  }
});
test("agente ChatGPT recebe somente ferramentas autorizadas e registra chamadas e texto", async () => {
  const fetch = globalThis.fetch,
    run = bridge.run;
  setConfig("FERRAMENTAS_URL", "https://tools.example/mcp");
  setConfig("FERRAMENTAS_CODIGO", "test-code");
  globalThis.fetch = async (_, init) => {
    const b = JSON.parse(init?.body as string);
    return Response.json({
      result:
        b.method === "tools/list"
          ? {
              tools: [
                {
                  name: "buscar",
                  description: "Busca informações",
                  inputSchema: { type: "object", properties: {} },
                },
                { name: "nao_autorizada" },
              ],
            }
          : { content: [{ type: "text", text: "Encontrado" }] },
    });
  };
  bridge.run = async (options) => {
    assert.deepEqual(
      options.tools!.map((t) => t.name),
      ["buscar"],
    );
    const result = await options.tools![0].call({ query: "x" });
    assert.match(result, /Encontrado/);
    options.onText?.("Resposta parcial");
    return "Resposta final baseada na ferramenta";
  };
  try {
    const g = template();
    g.nodes[1].data.config.tools = "buscar";
    const r = await runtime.startRun(flow(g).id, "Pesquisar");
    assert.equal(r.status, "completed");
    assert.equal(r.demo, false);
    assert.match(r.output, /Resposta final/);
    assert.ok(r.trace.some((t) => t.label === "Ferramenta: buscar"));
  } finally {
    globalThis.fetch = fetch;
    bridge.run = run;
  }
});
test("falhas ChatGPT não caem para outro provedor nem para demonstração", async () => {
  const run = bridge.run;
  bridge.run = async () => {
    throw Error("Limite da assinatura atingido");
  };
  try {
    const r = await runtime.startRun(flow().id, "Pesquisar");
    assert.equal(r.status, "failed");
    assert.equal(r.demo, false);
    assert.match(r.error!, /Limite da assinatura/);
  } finally {
    bridge.run = run;
  }
});
test("cancelamento interrompe o agente e impede próximas etapas", async () => {
  const run = bridge.run;
  let began!: () => void;
  const ready = new Promise<void>((r) => (began = r));
  bridge.run = async (options) =>
    new Promise((_, reject) => {
      options.signal?.addEventListener(
        "abort",
        () => reject(Error("Cancelado")),
        { once: true },
      );
      began();
    });
  try {
    const f = flow();
    const pending = runtime.startRun(f.id, "Pesquisar");
    await ready;
    const r = store.listRuns(f.id)[0];
    runtime.cancelRun(r.id);
    const result = await pending;
    assert.equal(result.status, "cancelled");
    assert.ok(!result.trace.some((t) => t.nodeId === "resposta"));
  } finally {
    bridge.run = run;
  }
});
test("MCP lista publicados e executa pelo mesmo motor ChatGPT", async () => {
  const f = flow();
  store.publishFlow(f.id);
  const list = (await FERRAMENTAS[0].executar({})) as { id: string }[];
  assert.ok(list.some((x) => x.id === f.id));
  const r = (await FERRAMENTAS[1].executar({ id: f.id, input: "Olá" })) as {
    status: string;
    demo: boolean;
  };
  assert.equal(r.status, "completed");
  assert.equal(r.demo, false);
});
test("modelos de exemplo possuem grafos executáveis", async () => {
  const { PRESETS, preset } = await import("./flow-presets");
  for (const p of PRESETS) {
    store.validateGraph(preset(p.id), true);
    const r = await runtime.startRun(
      flow(preset(p.id)).id,
      "urgente",
      false,
      true,
    );
    assert.ok(["completed", "waiting"].includes(r.status));
  }
});
test("reinício interrompe execução ativa e preserva aprovação pendente", async () => {
  const r = await runtime.startRun(flow().id, "x", false, true);
  r.status = "running";
  store.putRun(r);
  store.interruptRuns();
  assert.equal(store.getRun(r.id).status, "failed");
});

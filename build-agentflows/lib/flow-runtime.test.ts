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
test("OpenRouter só vale para blocos que escolhem um modelo dele; sem fallback", async () => {
  const account = bridge.account,
    run = bridge.run,
    fetch0 = globalThis.fetch;
  bridge.account = async () => ({ account: null, login: null, error: null });
  bridge.run = async () => {
    throw new Error("Conecte sua conta ChatGPT para executar este agente.");
  };
  setConfig("OPENROUTER_API_KEY", null);
  try {
    const f = flow();
    await assert.rejects(
      () => runtime.startRun(f.id, "Olá"),
      /Conecte o ChatGPT/,
    );
    setConfig("OPENROUTER_API_KEY", "sk-or-teste");
    // Bloco em "Automático · ChatGPT" continua exigindo o ChatGPT: nada de cair para outro provedor.
    const r = await runtime.startRun(f.id, "Olá");
    assert.equal(r.status, "failed");
    assert.match(r.error || "", /ChatGPT/);
    // Bloco com modelo do OpenRouter roda por ele.
    const g = template();
    g.nodes[1].data.config.model = "openrouter:openai/gpt-4.1-mini";
    const f2 = flow(g);
    let chamado = "";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      chamado = String(url) + " " + JSON.parse(String(init?.body)).model;
      return new Response(
        JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "Via OpenRouter" } }] }),
        { status: 200 },
      );
    }) as typeof fetch;
    const r2 = await runtime.startRun(f2.id, "Olá");
    assert.equal(r2.status, "completed");
    assert.equal(r2.output, "Via OpenRouter");
    assert.match(chamado, /openrouter\.ai.* openai\/gpt-4\.1-mini$/);
    assert.equal((await runtime.startRun(f.id, "Olá", false, true)).demo, true);
  } finally {
    bridge.account = account;
    bridge.run = run;
    globalThis.fetch = fetch0;
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

test("LLM sem mensagem recebe a conversa e depois o resultado anterior", async () => {
  const g = template();
  g.nodes[1].data.config.prompt = "";
  const segundo = block("llm", "revisor", 0, 0);
  segundo.data.config.prompt = "";
  g.nodes.splice(2, 0, segundo);
  g.edges = [
    { id: "1", source: "inicio", target: "analista" },
    { id: "2", source: "analista", target: "revisor" },
    { id: "3", source: "revisor", target: "resposta" },
  ];
  const f = flow(g);
  const r = await runtime.startRun(f.id, "Pedido atrasado", false, true);
  assert.equal(r.status, "completed");
  assert.match(r.trace[1].output, /Entrada analisada: Pedido atrasado/);
  assert.match(r.trace[2].output, /Entrada analisada: \[Demonstração\] Agente/);
  const c = { prompt: "Contexto: {{input}}" };
  assert.equal(runtime.message(c, r), "Contexto: Pedido atrasado");
});

test("dois agentes reutilizam a mesma ferramenta com seleção independente e sem credenciais no fluxo", async () => {
  const original = bridge.run;
  const seen: string[][] = [];
  bridge.run = async ({ tools = [] }) => {
    seen.push(tools.map((t) => t.name));
    const calc = tools.find((t) => t.name === "calculadora")!;
    return calc.call({ expressao: "6 * 7" });
  };
  try {
    const start = block("start", "start", 0, 0), one = block("agent", "one", 0, 0), two = block("agent", "two", 0, 0), end = block("end", "end", 0, 0);
    one.data.config.tools = "interno:calculadora,interno:data_hora";
    two.data.config.tools = "interno:calculadora";
    end.data.config.text = "{{last}}";
    const f = flow({ nodes: [start, one, two, end], edges: [{ id: "1", source: "start", target: "one" }, { id: "2", source: "one", target: "two" }, { id: "3", source: "two", target: "end" }] });
    const run = await runtime.startRun(f.id, "Calcule", false, false);
    assert.equal(run.status, "completed");
    assert.equal(run.output, "42");
    assert.deepEqual(seen, [["calculadora", "data_hora"], ["calculadora"]]);
    assert.equal(run.trace.filter((t) => t.label === "Ferramenta: calculadora").length, 2);
  } finally { bridge.run = original; }
});

test("Agente e LLM terminais entregam a resposta e atualizam variáveis compartilhadas", async () => {
  for (const kind of ["agent", "llm"] as const) {
    const start = block("start", "inicio", 0, 0), first = block(kind, "primeiro", 0, 0), last = block(kind, "ultimo", 0, 0);
    start.data.label = "Não pode renomear";
    start.data.config.state = JSON.stringify({ Resumo: "", Anterior: "inicial" });
    first.data.config.stateUpdates = JSON.stringify([{ key: "Resumo", value: "{{nodes.primeiro}}" }, { key: "Anterior", value: "{{fluxo.Resumo}}" }]);
    last.data.config.prompt = "Resumo recebido: {{fluxo.Resumo}}";
    last.data.config.stateUpdates = JSON.stringify([{ key: "Resumo", value: "{{last}}" }]);
    const f = flow({ nodes: [start, first, last], edges: [{ id: "a", source: "inicio", target: "primeiro" }, { id: "b", source: "primeiro", target: "ultimo" }] });
    assert.equal(f.graph.nodes[0].data.label, "Início");
    store.publishFlow(f.id);
    const r = await runtime.startRun(f.id, "Olá", true, true);
    assert.equal(r.status, "completed");
    assert.match(r.output, /Resumo recebido:/);
    assert.equal(r.state.Resumo, r.output);
    assert.equal(r.state.Anterior, ""); // assignments read the same pre-update state
    assert.equal(runtime.interpolate("{{state.Resumo}}", r), r.output);
  }
});
test("recusa variáveis desconhecidas, atualizações duplicadas e agentes desconectados", () => {
  const g = template();
  g.nodes[0].data.config.state = '{"Resumo":""}';
  g.nodes[1].data.config.stateUpdates = '[{"key":"Ausente","value":"x"}]';
  assert.throws(() => store.validateGraph(g, true), /variáveis/);
  g.nodes[1].data.config.stateUpdates = '[{"key":"Resumo","value":"x"},{"key":"Resumo","value":"y"}]';
  assert.throws(() => store.validateGraph(g, true), /repetições/);
  delete g.nodes[1].data.config.stateUpdates;
  g.nodes.push(block("agent", "solto", 0, 0));
  assert.throws(() => store.validateGraph(g, true), /conectados/);
});
test("novo fluxo começa com Início e Agente, sem Resposta obrigatória", () => {
  const f = store.createFlow();
  assert.deepEqual(f.graph.nodes.map((n) => n.data.kind), ["start", "agent"]);
  store.validateGraph(f.graph, true);
});

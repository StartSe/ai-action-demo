import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "agentflows-generator-"));
process.env.DATA_DIR = dir;
const { generateFlow, parseGenerated, GENERATOR_SYSTEM } = await import(
  "./flow-generator"
);
test.after(() => rmSync(dir, { recursive: true, force: true }));
const good = JSON.stringify({
  name: "Triagem de pedidos",
  description: "Classifica e responde pedidos de clientes.",
  nodes: [
    { id: "inicio", kind: "start", label: "Início", config: {} },
    {
      id: "classificador",
      kind: "agent",
      label: "Classificador",
      config: { system: "Classifique a urgência.", prompt: "{{input}}" },
    },
    {
      id: "urgente",
      kind: "condition",
      label: "É urgente?",
      config: { value: "{{last}}", operator: "contains", compare: "urgente" },
    },
    { id: "escala", kind: "approval", label: "Revisar", config: { prompt: "Confirme o encaminhamento." } },
    { id: "fim", kind: "end", label: "Resposta", config: { text: "{{nodes.classificador}}" } },
    { id: "recusado", kind: "end", label: "Encerrar", config: { text: "Encaminhamento não aprovado." } },
  ],
  edges: [
    { source: "inicio", target: "classificador", handle: "ignorado" },
    { source: "classificador", target: "urgente" },
    { source: "urgente", target: "escala", handle: "yes" },
    { source: "urgente", target: "fim", handle: "no" },
    { source: "escala", target: "fim", handle: "yes" },
    { source: "escala", target: "recusado", handle: "no" },
  ],
});
test("resposta válida vira grafo executável com layout e instruções preenchidas", () => {
  const g = parseGenerated("Aqui está:\n```json\n" + good + "\n```");
  assert.equal(g.name, "Triagem de pedidos");
  assert.equal(g.graph.nodes.length, 6);
  assert.equal(g.graph.edges.length, 6);
  const agent = g.graph.nodes.find((n) => n.id === "classificador")!;
  assert.equal(agent.data.config.system, "Classifique a urgência.");
  assert.equal(agent.data.config.model, "");
  assert.equal(g.graph.edges[0].sourceHandle, undefined);
  assert.equal(g.graph.edges[2].sourceHandle, "yes");
  const xs = g.graph.nodes.map((n) => n.position.x);
  assert.ok(new Set(xs).size >= 4);
});
test("resposta sem JSON ou com tipo desconhecido é recusada com diagnóstico", () => {
  assert.throws(() => parseGenerated("não sei"), /formato esperado/);
  assert.throws(
    () =>
      parseGenerated(
        JSON.stringify({ nodes: [{ id: "a", kind: "vetor" }], edges: [] }),
      ),
    /desconhecido/,
  );
  assert.throws(
    () =>
      parseGenerated(
        JSON.stringify({
          nodes: [
            { id: "inicio", kind: "start" },
            { id: "a", kind: "agent", config: { prompt: "{{input}}" } },
          ],
          edges: [{ source: "inicio", target: "a" }],
        }),
      ),
    /Resposta/,
  );
});
test("gerador pede correção uma vez e devolve o fluxo corrigido", async () => {
  const calls: string[] = [];
  const g = await generateFlow("Quero triagem de pedidos", async (system, prompt) => {
    calls.push(prompt);
    assert.equal(system, GENERATOR_SYSTEM);
    return calls.length === 1 ? "{ nada }" : good;
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1], /recusada/);
  assert.equal(g.graph.nodes.length, 6);
  await assert.rejects(
    () => generateFlow("x", async () => "sem json"),
    /formato esperado/,
  );
  await assert.rejects(() => generateFlow(""), /Descreva/);
});

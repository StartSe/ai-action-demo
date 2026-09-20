import test from "node:test";
import assert from "node:assert/strict";
import { block, template, type Graph } from "./flow-types";
import { connect, connectionProblem, outputLabel, outputs } from "./flow-graph";
test("cada tipo de bloco expõe as saídas certas", () => {
  assert.deepEqual(outputs("agent"), [{ id: null, label: "" }]);
  assert.deepEqual(
    outputs("condition").map((o) => o.id),
    ["yes", "no"],
  );
  assert.deepEqual(
    outputs("loop").map((o) => o.id),
    ["repeat", "done"],
  );
  assert.deepEqual(outputs("end"), []);
  assert.equal(outputLabel("approval", "no"), "Rejeitar");
  assert.equal(outputLabel("agent", null), "");
});
test("conexão recusa auto-conexão, Início como destino e saída da Resposta", () => {
  const g = template();
  assert.match(
    connectionProblem(g, { source: "analista", target: "analista" })!,
    /blocos diferentes/,
  );
  assert.match(
    connectionProblem(g, { source: "analista", target: "inicio" })!,
    /Início/,
  );
  assert.match(
    connectionProblem(g, { source: "resposta", target: "analista" })!,
    /Resposta/,
  );
});
test("cada saída aceita uma única conexão", () => {
  const g = template();
  assert.match(
    connectionProblem(g, { source: "inicio", target: "resposta" })!,
    /já está conectada/,
  );
  const c = block("condition", "cond", 0, 0);
  const g2: Graph = {
    nodes: [...g.nodes, c],
    edges: [{ id: "x", source: "cond", target: "resposta", sourceHandle: "yes" }],
  };
  assert.equal(
    connectionProblem(g2, { source: "cond", target: "analista", sourceHandle: "no" }),
    null,
  );
  assert.match(
    connectionProblem(g2, { source: "cond", target: "analista", sourceHandle: "yes" })!,
    /já está conectada/,
  );
});
test("ciclos só existem pela saída Repetir", () => {
  const g: Graph = {
    nodes: [
      block("start", "inicio", 0, 0),
      block("agent", "a", 0, 0),
      block("loop", "rep", 0, 0),
      block("end", "fim", 0, 0),
    ],
    edges: [
      { id: "1", source: "inicio", target: "a" },
      { id: "2", source: "a", target: "rep" },
    ],
  };
  assert.equal(
    connectionProblem(g, { source: "rep", target: "a", sourceHandle: "repeat" }),
    null,
  );
  assert.match(
    connectionProblem(g, { source: "rep", target: "a", sourceHandle: "done" })!,
    /ciclo/,
  );
  const withLoop = connect(g, { source: "rep", target: "a", sourceHandle: "repeat" });
  assert.equal(
    connectionProblem(withLoop, { source: "rep", target: "fim", sourceHandle: "done" }),
    null,
  );
  const done = connect(withLoop, { source: "rep", target: "fim", sourceHandle: "done" });
  assert.equal(done.edges.at(-1)?.id, "rep-done-fim");
  assert.equal(done.edges.at(-2)?.sourceHandle, "repeat");
});

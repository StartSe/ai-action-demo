import assert from "node:assert/strict";
import test from "node:test";
import { radarDemo } from "../lib/demo";
import {
  ALTURA, LARGURA, MARGEM_X, MARGEM_Y,
  caixaEnvolvente, comunidades, curvaAresta, enquadrar, estatisticas, interpolar, layoutForca, posicoesIniciais,
} from "../lib/grafo-layout";
import type { Aresta, No } from "../lib/types";

const demo = radarDemo(30);

test("demo (27 nós): nada fora da moldura, distância mínima ≥ 60, aresta média entre 90 e 130, determinístico", () => {
  const p = layoutForca(demo.nos, demo.arestas);
  assert.equal(p.size, demo.nos.length);
  const e = estatisticas(p, demo.arestas);
  assert.deepEqual(e.foraDaMoldura, []);
  assert.ok(e.distanciaMinima >= 60, `distância mínima ${e.distanciaMinima}`);
  assert.ok(e.comprimentoMedioAresta >= 90 && e.comprimentoMedioAresta <= 130, `aresta média ${e.comprimentoMedioAresta}`);
  const p2 = layoutForca(demo.nos, demo.arestas);
  assert.deepEqual([...p.entries()], [...p2.entries()]);
  p.forEach((v) => { assert.equal(v.x, Math.round(v.x * 100) / 100); assert.equal(v.y, Math.round(v.y * 100) / 100); });
});

test("comunidades: 3 grupos no demo cobrindo todos os ids; sem arestas, um grupo por nó", () => {
  const g = comunidades(demo.nos, demo.arestas);
  assert.equal(g.length, 3);
  const todos = g.flat().sort();
  assert.deepEqual(todos, demo.nos.map((n) => n.id).sort());
  assert.equal(comunidades(demo.nos, []).length, demo.nos.length);
});

test("enquadrar: dois pontos vão para as margens, um ponto vai para o centro, vazio continua vazio", () => {
  const dois = enquadrar(new Map([["a", { x: 10, y: 10 }], ["b", { x: 50, y: 30 }]]));
  assert.deepEqual(dois.get("a"), { x: MARGEM_X, y: MARGEM_Y });
  assert.deepEqual(dois.get("b"), { x: LARGURA - MARGEM_X, y: ALTURA - MARGEM_Y });
  assert.deepEqual(enquadrar(new Map([["a", { x: 3, y: 4 }]])).get("a"), { x: LARGURA / 2, y: ALTURA / 2 });
  assert.equal(enquadrar(new Map()).size, 0);
});

test("caixaEnvolvente: min/max dos nós pedidos, ignora id inexistente, null sem nó válido", () => {
  const p = layoutForca(demo.nos, demo.arestas);
  const c = caixaEnvolvente(["sinal-1", "sinal-2", "nao-existe"], p)!;
  const a = p.get("sinal-1")!, b = p.get("sinal-2")!;
  assert.deepEqual(c, { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) });
  assert.equal(caixaEnvolvente(["nao-existe"], p), null);
  assert.equal(caixaEnvolvente([], p), null);
});

test("posicoesIniciais e interpolar: mesmas chaves, temas no centro, progresso 0 = início e 1 = fim", () => {
  const fim = layoutForca(demo.nos, demo.arestas);
  const inicio = posicoesIniciais(demo.nos, demo.arestas, fim);
  assert.deepEqual([...inicio.keys()].sort(), [...fim.keys()].sort());
  demo.nos.filter((n) => n.tipo === "tema").forEach((n) => assert.deepEqual(inicio.get(n.id), { x: LARGURA / 2, y: ALTURA / 2 }));
  // Um sinal nasce em cima do tema da sua comunidade.
  assert.deepEqual(inicio.get("sinal-1"), fim.get("tema-1"));
  assert.deepEqual([...interpolar(inicio, fim, () => 0).entries()], [...inicio.entries()]);
  assert.deepEqual([...interpolar(inicio, fim, () => 1).entries()], [...fim.entries()]);
  const meio = interpolar(inicio, fim, () => 0.5).get("sinal-1")!;
  assert.ok(Math.abs(meio.x - (inicio.get("sinal-1")!.x + fim.get("sinal-1")!.x) / 2) < 1e-9);
});

test("curvaAresta: caminho M…Q…, ponto médio entre as pontas e mesma curva com os argumentos trocados", () => {
  const a = { x: 100, y: 100 }, b = { x: 300, y: 200 };
  const c1 = curvaAresta(a, b), c2 = curvaAresta(b, a);
  assert.match(c1.d, /^M [\d.]+ [\d.]+ Q [\d.]+ [\d.]+ [\d.]+ [\d.]+$/);
  assert.equal(c1.d, c2.d);
  assert.deepEqual(c1.meio, c2.meio);
  assert.ok(c1.meio.x > 100 && c1.meio.x < 300);
  const folga = 0.12 * Math.sqrt(200 * 200 + 100 * 100);
  assert.ok(c1.meio.y > 100 - folga && c1.meio.y < 200 + folga);
});

test("radar sintético de 120 nós: layout cabe na moldura e roda em menos de 300 ms", () => {
  const nos: No[] = [];
  const arestas: Aresta[] = [];
  for (let t = 1; t <= 3; t++) nos.push({ id: `t${t}`, rotulo: `Tema ${t}`, tipo: "tema", peso: 9 });
  for (let s = 1; s <= 12; s++) {
    nos.push({ id: `s${s}`, rotulo: `Sinal ${s}`, tipo: "sinal", peso: 6 });
    arestas.push({ origem: `s${s}`, destino: `t${((s - 1) % 3) + 1}`, relacao: "pertence a", peso: 4 });
  }
  for (let a = 1; a <= 105; a++) {
    nos.push({ id: `a${a}`, rotulo: `Ator ${a}`, tipo: a % 2 ? "ator" : "tecnologia", peso: 4 });
    arestas.push({ origem: `s${((a - 1) % 12) + 1}`, destino: `a${a}`, relacao: "usa", peso: 2 });
  }
  assert.equal(nos.length, 120);
  const t0 = performance.now();
  const p = layoutForca(nos, arestas);
  const ms = performance.now() - t0;
  assert.ok(ms < 300, `layout levou ${ms.toFixed(0)} ms`);
  assert.deepEqual(estatisticas(p, arestas).foraDaMoldura, []);
});

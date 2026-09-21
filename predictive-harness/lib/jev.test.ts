import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Pergunta } from "./jev";
const dir = mkdtempSync(join(tmpdir(), "harness-jev-"));
process.env.DATA_DIR = dir;
const jev = await import("./jev");
test.after(() => rmSync(dir, { recursive: true, force: true }));

const perguntas: Record<"intencao" | "urgente" | "nivel", Pergunta> = {
  intencao: { type: "choice", instructions: "?", criteria: { a: "A", b: "B" } },
  urgente: { type: "noul", instructions: "?" },
  nivel: { type: "score", instructions: "?", criteria: ["baixo", "medio", "alto"] },
};
const respostaOk = {
  id: "gen-1",
  model: "typesafe/jev-1.13",
  answers: {
    intencao: { choice: "b", probabilities: { a: 0.2, b: 0.8 }, confidence: 0.9 },
    urgente: { noul: 0.72 },
    nivel: { score: 1.4, legend: ["baixo", "medio", "alto"], probabilities: [0.1, 0.5, 0.4], confidence: 0.55 },
  },
  usage: { prompt_tokens: 1000, completion_tokens: 0 },
};

test("envia modelo, estado e perguntas com a chave e normaliza os três tipos", async () => {
  const chamadas: { url: string; body: Record<string, unknown>; auth: string }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: String((init?.headers as Record<string, string>).Authorization) });
    return new Response(JSON.stringify(respostaOk), { status: 200 });
  }) as typeof fetch;
  const d = await jev.decidir({ x: 1 }, perguntas, { fetcher, chave: "sk-or-teste" });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, "https://openrouter.ai/api/v1/systemone");
  assert.equal(chamadas[0].auth, "Bearer sk-or-teste");
  assert.equal(chamadas[0].body.model, jev.JEV_MODELO);
  assert.deepEqual(chamadas[0].body.state, { x: 1 });
  assert.deepEqual(Object.keys(chamadas[0].body.questions as object), ["intencao", "urgente", "nivel"]);
  assert.equal(jev.escolha(d, "intencao").valor, "b");
  assert.equal(jev.escolha(d, "intencao").probabilidade, 0.8);
  assert.equal(jev.escolha(d, "intencao").baixa, false);
  assert.equal(jev.sim(d, "urgente").valor, true);
  assert.equal(jev.sim(d, "urgente").probabilidade, 0.72);
  assert.equal(jev.pontuacao(d, "nivel").valor, 1.4);
  assert.equal(jev.pontuacao(d, "nivel").baixa, true, "confiança 0,55 fica abaixo do mínimo");
  assert.equal(d.tokens, 1000);
  assert.ok(Math.abs(d.custoUsd - 0.000042) < 1e-9);
  assert.equal(d.caminho, "/api/v1/systemone");
});

test("cai para o caminho alternativo quando o documentado responde 404 e lembra a escolha", async () => {
  const urls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    urls.push(String(url));
    if (String(url).endsWith("/api/v1/systemone")) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify({ ...respostaOk, answers: [{ id: "urgente", noul: 0.9 }] }), { status: 200 });
  }) as typeof fetch;
  const d = await jev.decidir("estado", { urgente: perguntas.urgente }, { fetcher, chave: "k" });
  assert.deepEqual(urls, ["https://openrouter.ai/api/v1/systemone", "https://openrouter.ai/api/alpha/decisions"]);
  assert.equal(d.caminho, "/api/alpha/decisions");
  assert.equal(d.respostas.urgente.sim, 0.9, "respostas em lista são indexadas pelo id");
  const urls2: string[] = [];
  const fetcher2 = (async (url: string | URL | Request) => {
    urls2.push(String(url));
    return new Response(JSON.stringify(respostaOk), { status: 200 });
  }) as typeof fetch;
  await jev.decidir("estado", { urgente: perguntas.urgente }, { fetcher: fetcher2, chave: "k" });
  assert.equal(urls2[0], "https://openrouter.ai/api/alpha/decisions", "o caminho que funcionou vem primeiro na próxima chamada");
});

test("erros do OpenRouter viram mensagens claras e sem chave o harness recusa", async () => {
  const fetcher = (async () => new Response("", { status: 402 })) as typeof fetch;
  await assert.rejects(() => jev.decidir("e", { urgente: perguntas.urgente }, { fetcher, chave: "k" }), /saldo do OpenRouter/);
  await assert.rejects(() => jev.decidir("e", { urgente: perguntas.urgente }, { fetcher, chave: "" }), /Conecte o OpenRouter/);
});

test("normalizar aceita variações da beta sem quebrar", () => {
  assert.equal(jev.normalizar({ type: "noul", instructions: "" }, 0.3).sim, 0.3);
  assert.equal(jev.normalizar({ type: "noul", instructions: "" }, { probability: 0.6 }).sim, 0.6);
  assert.equal(jev.normalizar({ type: "choice", instructions: "", criteria: { a: "", b: "" } }, { probabilities: { a: 0.3, b: 0.7 } }).escolha, "b");
  assert.equal(jev.normalizar({ type: "score", instructions: "", criteria: ["x", "y"] }, undefined).pontuacao, undefined);
});

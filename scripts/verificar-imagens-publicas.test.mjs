import assert from "node:assert/strict";
import { test } from "node:test";
import { verificarImagem, mensagemResultado } from "./verificar-imagens-publicas.mjs";

function simular({ anonimo = [200], manifesto = 200, visibilidade = "public", api = 200, autenticado = 200 } = {}) {
  const chamadas = [];
  const pausas = [];
  let tentativa = 0;
  return { chamadas, pausas, opcoes: {
    ator: "ator-teste", senha: "segredo-nao-deve-aparecer",
    esperar: async ms => { pausas.push(ms); },
    fetch: async (url, { headers }) => {
      chamadas.push(url);
      if (url.startsWith("https://api.github.com/")) return Response.json({ visibility: visibilidade }, { status: api });
      if (url.includes("/token?")) {
        const logado = headers.Authorization?.startsWith("Basic ");
        const status = logado ? autenticado : anonimo[Math.min(tentativa++, anonimo.length - 1)];
        if (status === 0) throw new Error("erro de rede com detalhe sensível");
        return Response.json({ token: logado ? "token-autenticado" : "token-anonimo" }, { status });
      }
      return Response.json({}, { status: headers.Authorization === "Bearer token-autenticado" ? manifesto : 200 });
    },
  } };
}

test("download anônimo bem-sucedido dispensa credenciais e a API", async () => {
  const s = simular();
  assert.equal((await verificarImagem("app", s.opcoes)).situacao, "publica");
  assert.equal(s.chamadas.length, 2);
  assert.deepEqual(s.pausas, []);
});

test("repete falha temporária com um novo token antes de diagnosticar visibilidade", async () => {
  const s = simular({ anonimo: [401, 503, 200] });
  assert.equal((await verificarImagem("app", s.opcoes)).situacao, "publica");
  assert.deepEqual(s.pausas, [5000, 10000]);
  assert.ok(s.chamadas.every(url => !url.startsWith("https://api.github.com/")));
});

test("pacote Public com acesso anônimo negado não é classificado como privado", async () => {
  const s = simular({ anonimo: [401], visibilidade: "public" });
  const resultado = await verificarImagem("app", s.opcoes);
  assert.equal(resultado.situacao, "publica_indisponivel");
  assert.match(mensagemResultado(resultado), /GitHub confirma Public/);
  assert.doesNotMatch(JSON.stringify(resultado), /segredo|token-autenticado|token-anonimo/);
  assert.deepEqual(s.pausas, [5000, 10000, 15000]);
});

test("só afirma restrição quando a API confirma Private ou Internal", async () => {
  for (const visibilidade of ["private", "internal"]) {
    const s = simular({ anonimo: [401], visibilidade });
    const resultado = await verificarImagem("app", s.opcoes);
    assert.equal(resultado.situacao, "restrita");
    assert.match(mensagemResultado(resultado), /API do GitHub confirmou visibilidade/);
  }
});

test("credencial sem permissão e erros de rede não são interpretados como pacote privado ou ausente", async () => {
  for (const status of [0, 401, 429, 503]) {
    const s = simular({ anonimo: [status], autenticado: status, api: 403 });
    const resultado = await verificarImagem("app", s.opcoes);
    assert.equal(resultado.situacao, "inconclusiva");
    assert.doesNotMatch(mensagemResultado(resultado), /segredo|sensível/);
  }
});

test("tag latest ausente exige 404 confirmado no manifesto autenticado", async () => {
  const s = simular({ anonimo: [401], manifesto: 404 });
  assert.equal((await verificarImagem("app", s.opcoes)).situacao, "ausente");
  const negado = simular({ anonimo: [401], autenticado: 403, api: 404 });
  assert.equal((await verificarImagem("app", negado.opcoes)).situacao, "inconclusiva");
});

test("sem credencial administrativa, relata a falha anônima sem inventar visibilidade", async () => {
  const s = simular({ anonimo: [401] });
  assert.equal((await verificarImagem("app", { ...s.opcoes, senha: "" })).situacao, "inconclusiva");
});

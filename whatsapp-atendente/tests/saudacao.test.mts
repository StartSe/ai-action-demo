// Saudação e perguntas de teste (0.3.0, US-008): como o atendente se apresenta passou a ser um campo da
// configuração, e é ele que entra no prompt e na primeira bolha do celular. A IA é falsa (`globalThis.fetch`
// em `openrouter.ai`), e é por ela que dá para conferir o que foi parar no `system` enviado ao modelo.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-saudacao-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { migrarConfig, getConfig } = await import("../lib/estado");
const { configExemplo, PERGUNTAS_EXEMPLO } = await import("../lib/demo");
const { apagarConversa } = await import("../lib/conversas");
const { responder } = await import("../lib/atendente");
const { GET: getConfigRota, PUT: putConfig } = await import("../app/api/config/route");
const { LIMITE_PERGUNTA, LIMITE_SAUDACAO, MAX_PERGUNTAS } = await import("../lib/types");

const originalFetch = globalThis.fetch;
after(async () => {
  // A janela da rajada (3 s) pode estar aberta; apagar o DATA_DIR antes dela fechar suja o log.
  await new Promise((r) => setTimeout(r, 3500));
  globalThis.fetch = originalFetch;
  rmSync(pasta, { recursive: true, force: true });
});

/** O `system` de cada chamada ao modelo, para conferir o que o prompt levou. */
const prompts: string[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const endereco = String(url);
  if (endereco.includes("openrouter.ai")) {
    const corpo = JSON.parse(String(init?.body ?? "{}")) as { messages?: { role: string; content: string }[] };
    prompts.push(corpo.messages?.find((m) => m.role === "system")?.content ?? "");
    return Response.json({ choices: [{ message: { content: "A limpeza custa R$ 150." } }] });
  }
  throw new Error(`Chamada inesperada no teste: ${endereco}`);
}) as typeof fetch;

/** Liga a IA (chave falsa) só durante `fn`. */
async function comIA(fn: () => Promise<void>) {
  process.env.OPENROUTER_API_KEY = "chave-de-teste";
  try {
    await fn();
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
}

function corpoValido(extra: Record<string, unknown>) {
  return {
    negocio: "Padaria do Bairro",
    atendente: "Duda",
    objetivo: "atendimento",
    tom: "profissional",
    baseConhecimento: "Pão francês: R$ 0,90 a unidade.",
    naoSei: "humano",
    ...extra,
  };
}

function put(corpo: Record<string, unknown>) {
  return putConfig(new Request("http://x/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }));
}

test("PUT /api/config grava saudação e perguntas de teste, e o GET as devolve", async () => {
  const perguntas = ["Vocês abrem domingo?", "Fazem bolo de aniversário?"];
  const r = await put(corpoValido({ saudacao: "  Oi! Aqui é a Duda, da padaria.  ", perguntasSugeridas: [...perguntas, "   "] }));
  assert.equal(r.status, 200);
  const gravada = await r.json();
  assert.equal(gravada.saudacao, "Oi! Aqui é a Duda, da padaria.", "o texto é gravado sem os espaços das pontas");
  assert.deepEqual(gravada.perguntasSugeridas, perguntas, "pergunta em branco não é pergunta");
  const lida = await (await getConfigRota()).json();
  assert.equal(lida.saudacao, "Oi! Aqui é a Duda, da padaria.");
  assert.deepEqual(lida.perguntasSugeridas, perguntas);
});

test("PUT /api/config recusa saudação e perguntas fora do tamanho, com frase de negócio", async () => {
  const longa = await put(corpoValido({ saudacao: "a".repeat(LIMITE_SAUDACAO + 1) }));
  assert.equal(longa.status, 400);
  assert.match((await longa.json()).error, /saudação/i);

  const muitas = await put(corpoValido({ perguntasSugeridas: Array.from({ length: MAX_PERGUNTAS + 1 }, (_, i) => `Pergunta ${i}`) }));
  assert.equal(muitas.status, 400);
  assert.match((await muitas.json()).error, /perguntas/i);

  const comprida = await put(corpoValido({ perguntasSugeridas: ["b".repeat(LIMITE_PERGUNTA + 1)] }));
  assert.equal(comprida.status, 400);
  assert.match((await comprida.json()).error, /pergunta/i);

  // Nada disso derrubou o que já estava salvo.
  assert.equal(getConfig().saudacao, "Oi! Aqui é a Duda, da padaria.");
});

test("migrarConfig não inventa saudação nem perguntas para uma configuração antiga", () => {
  // `tom: "cordial"` é o formato antigo (a assinatura só aceita os tons de hoje, daí a conversão).
  const antiga = migrarConfig({ negocio: "Loja", atendente: "Ana", baseConhecimento: "x", horario: "", naoSei: "humano", tom: "cordial" } as unknown as Parameters<typeof migrarConfig>[0]);
  assert.equal(antiga.saudacao, undefined, "herdar a saudação do exemplo faria a loja se apresentar como a clínica");
  assert.equal(antiga.perguntasSugeridas, undefined);
  // Valor salvo torto não impede a configuração de abrir: o que não serve sai.
  const torta = migrarConfig({ ...antiga, saudacao: "  ", perguntasSugeridas: ["Ok", "", "c".repeat(LIMITE_PERGUNTA + 10)] as string[] });
  assert.equal(torta.saudacao, undefined);
  assert.deepEqual(torta.perguntasSugeridas, ["Ok", "c".repeat(LIMITE_PERGUNTA)]);
  // A empresa de exemplo tem as duas coisas: é ela que enche a demonstração.
  assert.ok(configExemplo.saudacao);
  assert.deepEqual(configExemplo.perguntasSugeridas, PERGUNTAS_EXEMPLO);
});

test("a saudação configurada entra no prompt; sem ela, a instrução não existe", async () => {
  const numero = "simulador";
  await comIA(async () => {
    await put(corpoValido({ saudacao: "Oi! Aqui é a Duda, da padaria." }));
    prompts.length = 0;
    await responder({ numero, texto: "Quanto custa o pão?", origem: "simulador" });
    assert.ok(prompts.length, "a IA falsa foi chamada");
    assert.match(prompts[0]!, /apresente-se assim: "Oi! Aqui é a Duda, da padaria\."/);
    apagarConversa(numero);

    await put(corpoValido({}));
    prompts.length = 0;
    await responder({ numero, texto: "Quanto custa o pão?", origem: "simulador" });
    assert.doesNotMatch(prompts[0]!, /apresente-se assim/);
    apagarConversa(numero);
  });
});

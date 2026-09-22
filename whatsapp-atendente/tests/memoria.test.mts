// Resumo rolante da conversa (0.3.0, US-011): passando de 20 mensagens, o começo da conversa vira um
// parágrafo guardado em `conversas.resumo` (lib/memoria.ts) e é ele que entra no prompt no lugar das
// mensagens mais antigas. A IA é falsa (`globalThis.fetch` em `openrouter.ai`) e guarda o `system` e o
// `prompt` de cada chamada: é assim que se confere o que foi enviado ao modelo.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-memoria-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { migrarConfig } = await import("../lib/estado");
const { apagarConversa, obterConversa, resolver, resumoDaConversa } = await import("../lib/conversas");
const { responder } = await import("../lib/atendente");
const { atualizarResumo, FONTE_RESUMO, MENSAGENS_COM_RESUMO } = await import("../lib/memoria");

const originalFetch = globalThis.fetch;
after(async () => {
  // A janela da rajada (3 s) pode estar aberta; apagar o DATA_DIR antes dela fechar suja o log.
  await new Promise((r) => setTimeout(r, 3500));
  globalThis.fetch = originalFetch;
  rmSync(pasta, { recursive: true, force: true });
});

/** O que a IA falsa devolve quando pedem um resumo (o JSON de lib/memoria.ts). */
let resumoDaIA = "O cliente Paulo quer agendar uma limpeza para sexta de manhã e já informou o telefone.";
/** Os pedidos de resumo que chegaram à IA falsa, na ordem. */
const pedidosDeResumo: string[] = [];
/** Os prompts de RESPOSTA ao cliente que chegaram à IA falsa, na ordem. */
const promptsDeResposta: string[] = [];

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const endereco = String(url);
  if (!endereco.includes("openrouter.ai")) throw new Error(`Chamada inesperada no teste: ${endereco}`);
  const corpo = JSON.parse(String(init?.body ?? "{}")) as { messages?: { role: string; content: string }[] };
  const messages = corpo.messages ?? [];
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const prompt = messages.find((m) => m.role === "user")?.content ?? "";
  // A classificação de assunto e o resumo usam o mesmo endereço; cada um se reconhece pelo próprio system.
  if (system.includes("separa por assunto")) {
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"assunto":"Outros"}' } }] });
  }
  if (system.includes("resume conversas")) {
    pedidosDeResumo.push(prompt);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ resumo: resumoDaIA }) } }] });
  }
  promptsDeResposta.push(prompt);
  return Response.json({ choices: [{ finish_reason: "stop", message: { content: "Certo, anotado!" } }] });
}) as typeof fetch;

const CONFIG = migrarConfig({
  negocio: "Clínica Teste",
  atendente: "Ana",
  baseConhecimento: "Limpeza: R$ 150. Atendemos de segunda a sexta, das 8h às 18h.",
});

/** Conversa de verdade: cada rodada grava uma mensagem do cliente e uma resposta do atendente. */
async function conversar(numero: string, rodadas: number, prefixo = "mensagem") {
  process.env.OPENROUTER_API_KEY = "chave-de-teste";
  try {
    for (let i = 0; i < rodadas; i++) {
      await responder({ numero, texto: `${prefixo} ${i + 1}`, origem: "simulador", config: CONFIG });
    }
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
}

async function comIA<T>(fn: () => Promise<T>): Promise<T> {
  process.env.OPENROUTER_API_KEY = "chave-de-teste";
  try {
    return await fn();
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
}

test("conversa curta não é resumida: o histórico inteiro ainda vai no prompt", async () => {
  const numero = "55110000301";
  await conversar(numero, 5); // 10 mensagens, abaixo das 20 do histórico
  assert.equal(await comIA(() => atualizarResumo(numero)), null);
  assert.deepEqual(resumoDaConversa(numero), { resumo: null, ateId: 0 });
  apagarConversa(numero);
});

test("30 mensagens produzem resumo e a marca de até onde ele cobre", async () => {
  const numero = "55110000302";
  await conversar(numero, 15); // 30 mensagens
  const resumo = await comIA(() => atualizarResumo(numero));
  assert.equal(resumo, resumoDaIA);

  const gravado = resumoDaConversa(numero);
  assert.equal(gravado.resumo, resumoDaIA);
  const conversa = obterConversa(numero);
  assert.equal(conversa?.resumo, resumoDaIA, "a conversa que a tela lê traz o resumo para o painel");
  const mensagens = conversa?.mensagens ?? [];
  // O resumo cobre tudo o que está antes das 12 mensagens que continuam indo inteiras no prompt.
  assert.equal(gravado.ateId, mensagens[mensagens.length - MENSAGENS_COM_RESUMO - 1].id);

  // O pedido levou as 18 mensagens anteriores às últimas 12, e nenhuma das 12.
  const pedido = pedidosDeResumo.at(-1) ?? "";
  assert.match(pedido, /mensagem 1$/m);
  assert.match(pedido, /mensagem 9$/m);
  assert.equal(pedido.includes("mensagem 10"), false, "as últimas 12 mensagens ficam de fora: o modelo vai lê-las inteiras");

  apagarConversa(numero);
});

test("a resposta seguinte vai com o resumo e só as últimas 12 mensagens, e o resumo entra nas fontes", async () => {
  const numero = "55110000303";
  await conversar(numero, 15);
  await comIA(() => atualizarResumo(numero));

  promptsDeResposta.length = 0;
  await conversar(numero, 1, "pergunta nova");
  const prompt = promptsDeResposta.at(-1) ?? "";
  assert.match(prompt, /^Resumo do começo desta conversa: /, "o resumo abre o prompt");
  assert.match(prompt, new RegExp(resumoDaIA.slice(0, 30)));
  const linhas = prompt.split("\n").filter((l) => l.startsWith("Cliente: ") || l.startsWith("Ana: "));
  assert.equal(linhas.length, MENSAGENS_COM_RESUMO, "com resumo, só as últimas 12 mensagens vão inteiras");
  assert.equal(prompt.includes("mensagem 1\n"), false, "o começo da conversa só aparece pelo resumo");

  const resposta = obterConversa(numero)?.mensagens.filter((m) => m.papel === "atendente").at(-1);
  assert.deepEqual(
    resposta?.detalhes?.fontes.map((f) => f.tipo),
    ["resumo", "base"],
    "o bloco \"Por que respondeu assim\" mostra o resumo como fonte, antes da base"
  );
  assert.equal(resposta?.detalhes?.fontes[0].nome, FONTE_RESUMO);

  apagarConversa(numero);
});

test("o resumo seguinte mescla o anterior e não é refeito a cada mensagem", async () => {
  const numero = "55110000304";
  await conversar(numero, 15);
  await comIA(() => atualizarResumo(numero));
  const marcaInicial = resumoDaConversa(numero).ateId;

  // Duas rodadas (4 mensagens) ainda não justificam uma ida à IA: elas continuam no histórico recente.
  await conversar(numero, 2, "pouca coisa");
  assert.equal(await comIA(() => atualizarResumo(numero)), null);
  assert.equal(resumoDaConversa(numero).ateId, marcaInicial, "a marca não se mexe sem resumo novo");

  // Mais quatro rodadas passam das 8 mensagens não resumidas: agora vale reescrever.
  resumoDaIA = "Paulo agendou a limpeza para sexta às 9h e pediu a nota fiscal no e-mail dele.";
  await conversar(numero, 4, "coisa nova");
  assert.equal(await comIA(() => atualizarResumo(numero)), resumoDaIA);
  assert.equal(resumoDaConversa(numero).resumo, resumoDaIA);
  assert.ok(resumoDaConversa(numero).ateId > marcaInicial, "a marca avança junto");
  assert.match(pedidosDeResumo.at(-1) ?? "", /Resumo do que já aconteceu antes:/, "o resumo anterior vai junto para ser mesclado");

  apagarConversa(numero);
});

test("marcar como resolvida não apaga o resumo; apagar a conversa apaga", async () => {
  const numero = "55110000305";
  await conversar(numero, 15);
  await comIA(() => atualizarResumo(numero));
  resolver(numero);
  assert.equal(resumoDaConversa(numero).resumo, resumoDaIA, "o cliente que volta continua com o que já foi combinado");
  apagarConversa(numero);
  assert.deepEqual(resumoDaConversa(numero), { resumo: null, ateId: 0 });
});

test("sem IA conectada nada é resumido", async () => {
  const numero = "55110000306";
  await conversar(numero, 15);
  assert.equal(await atualizarResumo(numero), null, "sem chave, nem a chamada acontece");
  assert.equal(resumoDaConversa(numero).resumo, null);
  apagarConversa(numero);
});

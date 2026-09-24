// Fundação de resiliência da 0.3.0 (US-001): mensagem repetida do canal vira UMA mensagem, uma rajada
// de mensagens vira UMA resposta, e a IA não responde por cima de uma pessoa que assumiu a conversa.
// Sem OPENROUTER_API_KEY o atendente responde pelo caminho local (lib/demo.ts), o que basta aqui: o
// que está em teste é a fila e a guarda, não o texto da resposta.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-rajada-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { registrarMensagemCliente, obterConversa, assumir, apagarConversa } = await import("../lib/conversas");
const { motivoParaNaoResponder, podeResponder, responder } = await import("../lib/atendente");
const { agendarResposta, janelaAberta } = await import("../lib/rajada");
const { segundosDigitando } = await import("../lib/zapi");
const { setConfig } = await import("../lib/store");
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; rmSync(pasta, { recursive: true, force: true }); });

// z-api falsa: conta os `send-text` e guarda o corpo de cada um.
const envios: { phone: string; message: string; delayTyping?: number }[] = [];
setConfig("ZAPI_INSTANCE_ID", "inst-teste");
setConfig("ZAPI_TOKEN", "token-teste");
setConfig("ZAPI_CLIENT_TOKEN", "client-teste");
globalThis.fetch = async (url, opts) => {
  const endereco = String(url);
  if (endereco.includes("/send-text")) {
    envios.push(JSON.parse(String(opts?.body)));
    return Response.json({ zaapId: "z1", messageId: `m${envios.length}`, id: "i1" });
  }
  throw new Error(`Chamada inesperada no teste: ${endereco}`);
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const JANELA = 150;

test("o mesmo aviso do canal duas vezes vira UMA mensagem no banco", () => {
  const numero = "5511900000001";
  const primeira = registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp", idExterno: "ABC123" });
  const segunda = registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp", idExterno: "ABC123" });
  assert.equal(primeira.duplicada, false);
  assert.equal(segunda.duplicada, true);
  assert.equal(segunda.mensagemId, primeira.mensagemId);
  assert.equal(obterConversa(numero)!.mensagens.length, 1);
  // Sem id externo (simulador, MCP) nada é deduplicado: texto igual é mensagem nova.
  registrarMensagemCliente({ numero, texto: "Oi" });
  assert.equal(obterConversa(numero)!.mensagens.length, 2);
  apagarConversa(numero);
});

test("três mensagens dentro da janela geram UM send-text, respondendo à sequência inteira", async () => {
  const numero = "5511900000002";
  envios.length = 0;
  for (const texto of ["Oi", "Queria saber o preço", "da limpeza"]) {
    registrarMensagemCliente({ numero, texto, origem: "whatsapp", idExterno: `${numero}-${texto}` });
    agendarResposta(numero, "whatsapp", { janelaMs: JANELA });
    await esperar(40);
  }
  assert.equal(janelaAberta(numero), true);
  // A janela fecha 150 ms depois da ÚLTIMA mensagem, e a resposta local leva ~700 ms.
  await esperar(JANELA + 1200);
  assert.equal(janelaAberta(numero), false);
  assert.equal(envios.length, 1, "uma resposta só para a rajada");
  assert.equal(envios[0].phone, numero);
  assert.ok(envios[0].delayTyping! >= 1 && envios[0].delayTyping! <= 3);
  const conversa = obterConversa(numero)!;
  // Só a conversa em si: o evento da linha do tempo e a nota interna da transferência ("pediu ajuda de
  // uma pessoa", US-002 e US-014) podem vir depois.
  const soConversa = conversa.mensagens.filter((m) => m.papel !== "evento" && m.papel !== "nota");
  assert.deepEqual(soConversa.map((m) => m.papel), ["cliente", "cliente", "cliente", "atendente"]);
  assert.equal(soConversa[3].texto, envios[0].message);
  apagarConversa(numero);
});

test("assumir durante a janela impede a resposta da IA", async () => {
  const numero = "5511900000003";
  envios.length = 0;
  registrarMensagemCliente({ numero, texto: "Quero falar com alguém", origem: "whatsapp", idExterno: `${numero}-1` });
  agendarResposta(numero, "whatsapp", { janelaMs: JANELA });
  assumir(numero);
  await esperar(JANELA + 1200);
  assert.equal(envios.length, 0, "a IA não responde por cima de quem assumiu");
  assert.deepEqual(obterConversa(numero)!.mensagens.map((m) => m.papel), ["cliente", "evento"], "só a mensagem e o evento de assumir");
  apagarConversa(numero);
});

test("assumir ENQUANTO a IA escreve descarta a resposta pronta (segunda conferência)", async () => {
  const numero = "5511900000004";
  envios.length = 0;
  registrarMensagemCliente({ numero, texto: "Qual o horário?", origem: "whatsapp", idExterno: `${numero}-1` });
  agendarResposta(numero, "whatsapp", { janelaMs: JANELA });
  // A janela já fechou e a resposta local está nos 700 ms de espera: a pessoa assume agora.
  await esperar(JANELA + 200);
  assumir(numero);
  await esperar(1200);
  assert.equal(envios.length, 0);
  assert.deepEqual(obterConversa(numero)!.mensagens.map((m) => m.papel), ["cliente", "evento"], "só a mensagem e o evento de assumir");
  apagarConversa(numero);
});

test("podeResponder: falso quando alguém assumiu ou quando chegou mensagem mais nova", () => {
  const numero = "5511900000005";
  const primeira = registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp" });
  assert.equal(podeResponder(numero, primeira.mensagemId), true);
  const segunda = registrarMensagemCliente({ numero, texto: "Tem vaga?", origem: "whatsapp" });
  assert.equal(podeResponder(numero, primeira.mensagemId), false);
  assert.match(motivoParaNaoResponder(numero, primeira.mensagemId)!, /mensagem nova/);
  assert.equal(podeResponder(numero, segunda.mensagemId), true);
  assumir(numero);
  assert.match(motivoParaNaoResponder(numero, segunda.mensagemId)!, /assumiu/);
  assert.match(motivoParaNaoResponder("nao-existe", 1)!, /não existe/);
  apagarConversa(numero);
});

test("simulador e MCP continuam síncronos: responder() devolve a resposta na mesma chamada", async () => {
  const r = await responder({ numero: "simulador", texto: "Qual o horário de atendimento?" });
  assert.ok(r.resposta && r.resposta.length > 0);
  assert.equal(envios.length, 0, "o simulador não passa pelo número da empresa");
  // Mensagem repetida por id externo não gera segunda resposta.
  const a = await responder({ numero: "5511900000006", texto: "Oi", origem: "whatsapp", idExterno: "REP-1" });
  const b = await responder({ numero: "5511900000006", texto: "Oi", origem: "whatsapp", idExterno: "REP-1" });
  assert.ok(a.resposta);
  assert.equal(b.resposta, null);
  assert.equal(b.descartada, "mensagem repetida");
  apagarConversa("simulador");
  apagarConversa("5511900000006");
});

test("delayTyping proporcional ao tamanho, entre 1 e 3 segundos", () => {
  assert.equal(segundosDigitando("Oi!"), 1);
  assert.equal(segundosDigitando("x".repeat(81)), 2);
  assert.equal(segundosDigitando("x".repeat(500)), 3);
});

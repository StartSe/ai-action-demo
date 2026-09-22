// Quem atende (0.3.0, US-013): responder já assume a conversa. O que está em teste é o SERVIDOR —
// a mensagem escrita por uma pessoa numa conversa que era da IA grava `humano`, escreve
// "Você assumiu a conversa" na linha do tempo e zera a espera do cliente —, mais o caminho de volta
// (devolver) e o de reabrir uma conversa resolvida. A z-api é falsa (`globalThis.fetch`) e as rotas do
// Next são chamadas direto, como funções.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-quem-atende-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { apagarConversa, obterConversa, obterRegistro, registrarMensagemCliente, registrarResposta, resolver } = await import("../lib/conversas");
const { setConfig } = await import("../lib/store");
const { POST: postMensagem } = await import("../app/api/conversas/[numero]/mensagens/route");
const { POST: postDevolver } = await import("../app/api/conversas/[numero]/devolver/route");
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  rmSync(pasta, { recursive: true, force: true });
});

setConfig("ZAPI_INSTANCE_ID", "inst-teste");
setConfig("ZAPI_TOKEN", "token-teste");
setConfig("ZAPI_CLIENT_TOKEN", "client-teste");
const envios: { phone: string; message: string }[] = [];
globalThis.fetch = async (url, opts) => {
  const endereco = String(url);
  if (endereco.includes("/send-text")) {
    envios.push(JSON.parse(String(opts?.body)));
    return Response.json({ zaapId: "z1", messageId: `msg-${envios.length}`, id: "i1" });
  }
  if (/\/update-webhook-[a-z-]+$/.test(endereco)) return Response.json({ value: true });
  throw new Error(`Chamada inesperada no teste: ${endereco}`);
};

const params = (numero: string) => ({ params: Promise.resolve({ numero }) });
const enviarComoPessoa = (numero: string, texto: string) =>
  postMensagem(new Request("http://app/api/conversas/x/mensagens", { method: "POST", body: JSON.stringify({ texto }) }), params(numero));
const textosDeEvento = (numero: string) => obterConversa(numero)!.mensagens.filter((m) => m.papel === "evento").map((m) => m.texto);

test("responder numa conversa da IA assume: status `humano`, evento na linha do tempo e espera zerada", async () => {
  const numero = "5511900000200";
  registrarMensagemCliente({ numero, texto: "Vocês atendem no sábado?", origem: "whatsapp", idExterno: `${numero}-1` });
  // A IA pediu ajuda de uma pessoa: a conversa fica em `atencao` e o cliente passa a esperar.
  registrarResposta({ numero, texto: "Vou chamar uma pessoa para você.", transferir: true, motivo: "sem_informacao", atendente: "Bia" });
  assert.equal(obterRegistro(numero)!.status, "atencao");
  assert.ok(obterRegistro(numero)!.esperandoDesde, "a conversa transferida marca desde quando o cliente espera");

  const r = await enviarComoPessoa(numero, "Atendemos das 9h às 13h no sábado!");
  assert.equal(r.status, 200);
  const registro = obterRegistro(numero)!;
  assert.equal(registro.status, "humano");
  assert.equal(registro.esperandoDesde, null, "quem responde acaba com a espera do cliente");
  assert.ok(textosDeEvento(numero).includes("Você assumiu a conversa"));
  assert.equal(envios.length, 1, "a resposta saiu pelo número da empresa");

  // O evento vem ANTES da mensagem que assumiu: quem lê a conversa vê onde a IA parou.
  const mensagens = obterConversa(numero)!.mensagens;
  const iEvento = mensagens.findIndex((m) => m.texto === "Você assumiu a conversa");
  const iHumana = mensagens.findIndex((m) => m.papel === "humano");
  assert.ok(iEvento >= 0 && iEvento < iHumana);
  apagarConversa(numero);
});

test("responder de novo na conversa já assumida não repete o evento", async () => {
  const numero = "5511900000201";
  registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp", idExterno: `${numero}-1` });
  await enviarComoPessoa(numero, "Oi! Sou a Ana, do atendimento.");
  await enviarComoPessoa(numero, "Em que posso ajudar?");
  assert.equal(textosDeEvento(numero).filter((t) => t === "Você assumiu a conversa").length, 1);
  apagarConversa(numero);
});

test("a resposta da rota traz a conversa com o que o atendente lembra do cliente", async () => {
  const numero = "5511900000202";
  registrarMensagemCliente({ numero, texto: "Bom dia", origem: "whatsapp", idExterno: `${numero}-1` });
  const r = await enviarComoPessoa(numero, "Bom dia!");
  const dados = (await r.json()) as { conversa?: { contato?: unknown } };
  assert.ok(dados.conversa, "a rota devolve a conversa inteira");
  assert.ok("contato" in dados.conversa!, "o painel do contato não pode perder a memória ao enviar uma mensagem");
  apagarConversa(numero);
});

test("devolver volta a conversa para a IA, e reabrir uma resolvida faz o mesmo", async () => {
  const numero = "5511900000203";
  registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp", idExterno: `${numero}-1` });
  await enviarComoPessoa(numero, "Oi! Já respondo.");
  assert.equal(obterRegistro(numero)!.status, "humano");

  const devolvida = await postDevolver(new Request("http://app/x", { method: "POST" }), params(numero));
  assert.equal(devolvida.status, 200);
  assert.equal(obterRegistro(numero)!.status, "ia");

  // "Reabrir" da conversa resolvida é a mesma rota: ela volta para o atendente virtual.
  resolver(numero);
  assert.equal(obterRegistro(numero)!.status, "resolvida");
  await postDevolver(new Request("http://app/x", { method: "POST" }), params(numero));
  assert.equal(obterRegistro(numero)!.status, "ia");
  apagarConversa(numero);
});

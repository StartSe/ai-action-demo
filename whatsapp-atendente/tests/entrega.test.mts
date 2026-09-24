// Status de entrega das mensagens enviadas (0.3.0, US-003): o que sai pelo número da empresa passa por
// `enviando` → `enviada` → `entregue` → `lida`, ou cai em `falhou` com "Tentar de novo". A z-api é
// falsa (`globalThis.fetch`), com um interruptor para o `send-text` aceitar ou recusar; sem
// OPENROUTER_API_KEY a resposta da IA vem do caminho local, o que basta: o que está em teste é a
// entrega, não o texto. As rotas do Next são chamadas direto, como funções.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-entrega-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { apagarConversa, assumir, atualizarEntrega, obterConversa, registrarMensagemCliente, registrarMensagemHumana, registrarResposta } = await import(
  "../lib/conversas"
);
const { responder } = await import("../lib/atendente");
const { agendarResposta } = await import("../lib/rajada");
const { configurarWebhooks, garantirWebhooks } = await import("../lib/zapi");
const { getConfig, setConfig } = await import("../lib/store");
const { POST: postMensagem } = await import("../app/api/conversas/[numero]/mensagens/route");
const { POST: postReenviar } = await import("../app/api/conversas/[numero]/mensagens/[id]/reenviar/route");
const { POST: postWebhook } = await import("../app/webhook/zapi/route");
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  rmSync(pasta, { recursive: true, force: true });
});

// z-api falsa: `send-text` devolve um messageId novo a cada chamada, ou 500 quando o interruptor está
// desligado; os `update-webhook-*` são contados.
const envios: { phone: string; message: string }[] = [];
/** Contador dos ids que a z-api falsa deu; nunca zera, para dois testes não reaproveitarem um id. */
let idsDados = 0;
const cadastros: string[] = [];
let zapiNoAr = true;
setConfig("ZAPI_INSTANCE_ID", "inst-teste");
setConfig("ZAPI_TOKEN", "token-teste");
setConfig("ZAPI_CLIENT_TOKEN", "client-teste");
setConfig("WHATSAPP_WEBHOOK_CHAVE", "chave-de-teste");
globalThis.fetch = async (url, opts) => {
  const endereco = String(url);
  if (endereco.includes("/send-text")) {
    if (!zapiNoAr) return new Response(JSON.stringify({ error: "instance is not connected" }), { status: 500 });
    envios.push(JSON.parse(String(opts?.body)));
    return Response.json({ zaapId: "z1", messageId: `msg-${++idsDados}`, id: "i1" });
  }
  const cadastro = endereco.match(/\/(update-webhook-[a-z-]+)$/);
  if (cadastro) {
    cadastros.push(cadastro[1]);
    return Response.json({ value: true });
  }
  throw new Error(`Chamada inesperada no teste: ${endereco}`);
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const JANELA = 100;
const params = (numero: string) => ({ params: Promise.resolve({ numero }) });
const paramsMensagem = (numero: string, id: number) => ({ params: Promise.resolve({ numero, id: String(id) }) });
const aviso = (corpo: Record<string, unknown>) =>
  postWebhook(new Request("http://app/webhook/zapi?chave=chave-de-teste", { method: "POST", body: JSON.stringify({ instanceId: "inst-teste", ...corpo }) }));

function ultimaEnviada(numero: string) {
  const m = obterConversa(numero)!.mensagens.filter((x) => x.papel === "atendente" || x.papel === "humano");
  return m[m.length - 1];
}

test("mensagem escrita para um número real nasce `enviando`; nas outras conversas, sem status", () => {
  const numero = "5511900000100";
  registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp", idExterno: `${numero}-1` });
  registrarResposta({ numero, texto: "Olá!" });
  assert.equal(ultimaEnviada(numero).statusEntrega, "enviando");
  registrarMensagemHumana(numero, "Aqui é a Ana.");
  assert.equal(ultimaEnviada(numero).statusEntrega, "enviando");
  apagarConversa(numero);
});

test("a resposta da IA numa conversa do WhatsApp fica `enviada` com o id da z-api, e os avisos só avançam", async () => {
  const numero = "5511900000101";
  envios.length = 0;
  registrarMensagemCliente({ numero, texto: "Qual o horário?", origem: "whatsapp", idExterno: `${numero}-1` });
  agendarResposta(numero, "whatsapp", { janelaMs: JANELA });
  // A janela fecha e a resposta local leva ~700 ms; a z-api falsa confirma na hora.
  await esperar(JANELA + 1200);
  assert.equal(envios.length, 1);
  const idZapi = `msg-${idsDados}`;
  const resposta = ultimaEnviada(numero);
  assert.equal(resposta.statusEntrega, "enviada");
  assert.equal(resposta.erroEnvio, undefined);

  // Os avisos de status chegam pelo id que o send-text devolveu, e só avançam: READ e depois RECEIVED deixa `lida`.
  assert.equal(atualizarEntrega(idZapi, "lida"), true);
  assert.equal(ultimaEnviada(numero).statusEntrega, "lida");
  assert.equal(atualizarEntrega(idZapi, "entregue"), true);
  assert.equal(ultimaEnviada(numero).statusEntrega, "lida", "lida nunca volta para entregue");
  assert.equal(atualizarEntrega(idZapi, "enviada"), true);
  assert.equal(ultimaEnviada(numero).statusEntrega, "lida");
  assert.equal(atualizarEntrega("id-que-nao-existe", "entregue"), false, "id desconhecido não é erro, só false");
  apagarConversa(numero);
});

test("simulador e conversa sem número real não ganham status de entrega", async () => {
  const r = await responder({ numero: "simulador", texto: "Qual o horário de atendimento?" });
  assert.ok(r.resposta);
  assert.equal(ultimaEnviada("simulador").statusEntrega, undefined);
  registrarMensagemHumana("simulador", "Olá!");
  assert.equal(ultimaEnviada("simulador").statusEntrega, undefined);
  apagarConversa("simulador");
});

test("o webhook MessageStatusCallback mapeia SENT/RECEIVED/READ/PLAYED, ignora READ_BY_ME e nunca volta", async () => {
  const numero = "5511900000102";
  registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp", idExterno: `${numero}-1` });
  const id = registrarResposta({ numero, texto: "Olá!" });
  // O envio pela z-api dá o id externo à mensagem.
  const { marcarEnviada } = await import("../lib/conversas");
  marcarEnviada(id, "zapi-abc");
  assert.equal(ultimaEnviada(numero).statusEntrega, "enviada");

  let r = await aviso({ type: "MessageStatusCallback", status: "READ", ids: ["zapi-abc"], phone: numero });
  assert.equal(r.status, 200);
  await esperar(20);
  assert.equal(ultimaEnviada(numero).statusEntrega, "lida");
  await aviso({ type: "MessageStatusCallback", status: "RECEIVED", ids: ["zapi-abc"], phone: numero });
  await esperar(20);
  assert.equal(ultimaEnviada(numero).statusEntrega, "lida", "RECEIVED depois de READ não volta");
  await aviso({ type: "MessageStatusCallback", status: "READ_BY_ME", ids: ["zapi-abc"], phone: numero });
  await aviso({ type: "MessageStatusCallback", status: "RECEIVED", ids: ["nao-passou-pelo-app"], phone: numero });
  await esperar(20);
  assert.equal(ultimaEnviada(numero).statusEntrega, "lida");

  // Um segundo envio, para PLAYED e a ordem normal.
  const id2 = registrarResposta({ numero, texto: "Segue o áudio." });
  marcarEnviada(id2, "zapi-def");
  await aviso({ type: "MessageStatusCallback", status: "SENT", ids: ["zapi-def"], phone: numero });
  await esperar(20);
  assert.equal(ultimaEnviada(numero).statusEntrega, "enviada");
  await aviso({ type: "MessageStatusCallback", status: "RECEIVED", ids: ["zapi-def"], phone: numero });
  await esperar(20);
  assert.equal(ultimaEnviada(numero).statusEntrega, "entregue");
  await aviso({ type: "MessageStatusCallback", status: "PLAYED", ids: ["zapi-def"], phone: numero });
  await esperar(20);
  assert.equal(ultimaEnviada(numero).statusEntrega, "lida");

  // Chave errada: 401 sem processar.
  r = await postWebhook(new Request("http://app/webhook/zapi?chave=errada", { method: "POST", body: JSON.stringify({ instanceId: "inst-teste", type: "MessageStatusCallback" }) }));
  assert.equal(r.status, 401);
  apagarConversa(numero);
});

test("mensagem de uma pessoa: falha vira `falhou` no banco, e Tentar de novo com a z-api de volta deixa `enviada`", async () => {
  const numero = "5511900000103";
  envios.length = 0;
  registrarMensagemCliente({ numero, texto: "Quero falar com alguém", origem: "whatsapp", idExterno: `${numero}-1` });
  assumir(numero);

  zapiNoAr = false;
  let r = await postMensagem(new Request("http://app", { method: "POST", body: JSON.stringify({ texto: "Sou a Ana, posso ajudar?" }) }), params(numero));
  assert.equal(r.ok, false);
  let dados = (await r.json()) as { error: string; conversa: { mensagens: { papel: string; statusEntrega?: string; erroEnvio?: string }[] }; mensagemComErro: number };
  assert.match(dados.error, /QR Code|não está conectado/);
  const gravada = ultimaEnviada(numero);
  assert.equal(gravada.papel, "humano");
  assert.equal(gravada.texto, "Sou a Ana, posso ajudar?");
  assert.equal(gravada.statusEntrega, "falhou", "a marcação vem do banco");
  assert.equal(gravada.erroEnvio, dados.error);
  assert.equal(dados.mensagemComErro, gravada.id);
  assert.equal(envios.length, 0);

  // Reenviar com a z-api ainda fora continua `falhou`, sem gravar mensagem nova.
  const antes = obterConversa(numero)!.mensagens.length;
  r = await postReenviar(new Request("http://app", { method: "POST" }), paramsMensagem(numero, gravada.id));
  assert.equal(r.ok, false);
  assert.equal(obterConversa(numero)!.mensagens.length, antes, "reenviar não duplica a mensagem");
  assert.equal(ultimaEnviada(numero).statusEntrega, "falhou");

  // A z-api voltou: o mesmo texto sai, a MESMA linha vira `enviada` e o erro some.
  zapiNoAr = true;
  r = await postReenviar(new Request("http://app", { method: "POST" }), paramsMensagem(numero, gravada.id));
  assert.equal(r.status, 200);
  dados = await r.json();
  assert.equal(envios.length, 1);
  assert.equal(envios[0].message, "Sou a Ana, posso ajudar?");
  const depois = ultimaEnviada(numero);
  assert.equal(depois.id, gravada.id);
  assert.equal(depois.statusEntrega, "enviada");
  assert.equal(depois.erroEnvio, undefined);
  assert.equal(obterConversa(numero)!.mensagens.length, antes);

  // Reenviar o que já saiu é recusado: mandaria o texto duas vezes ao cliente.
  r = await postReenviar(new Request("http://app", { method: "POST" }), paramsMensagem(numero, gravada.id));
  assert.equal(r.status, 409);
  assert.equal(envios.length, 1);
  // Mensagem que não existe.
  r = await postReenviar(new Request("http://app", { method: "POST" }), paramsMensagem(numero, 999999));
  assert.equal(r.status, 404);
  apagarConversa(numero);
});

test("a resposta da IA que a z-api recusa fica `falhou` com a frase de negócio", async () => {
  const numero = "5511900000104";
  envios.length = 0;
  zapiNoAr = false;
  registrarMensagemCliente({ numero, texto: "Qual o horário?", origem: "whatsapp", idExterno: `${numero}-1` });
  agendarResposta(numero, "whatsapp", { janelaMs: JANELA });
  await esperar(JANELA + 1200);
  const resposta = ultimaEnviada(numero);
  assert.equal(resposta.papel, "atendente");
  assert.equal(resposta.statusEntrega, "falhou");
  assert.match(resposta.erroEnvio ?? "", /QR Code|não está conectado/);
  zapiNoAr = true;
  apagarConversa(numero);
});

test("configurarWebhooks cadastra o aviso de status, e garantirWebhooks recadastra quando a lista de avisos mudou", async () => {
  cadastros.length = 0;
  await configurarWebhooks("https://app.exemplo.com.br");
  assert.deepEqual(cadastros, ["update-webhook-received", "update-webhook-connected", "update-webhook-disconnected", "update-webhook-message-status"]);
  const marca = getConfig("ZAPI_AVISOS_CADASTRADOS")!;
  assert.match(marca, /update-webhook-message-status/);
  assert.match(marca, /https:\/\/app\.exemplo\.com\.br\/webhook\/zapi\?chave=chave-de-teste$/);

  // Já cadastrado com a lista atual: não fala com a z-api.
  cadastros.length = 0;
  await garantirWebhooks("https://app.exemplo.com.br");
  assert.equal(cadastros.length, 0);

  // Uma instância cadastrada por uma versão anterior (só o endereço, sem a lista) é recadastrada.
  setConfig("ZAPI_AVISOS_CADASTRADOS", "https://app.exemplo.com.br/webhook/zapi?chave=chave-de-teste");
  await garantirWebhooks("https://app.exemplo.com.br");
  assert.equal(cadastros.length, 4);
  // E um endereço novo também.
  cadastros.length = 0;
  await garantirWebhooks("https://outro.exemplo.com.br");
  assert.equal(cadastros.length, 4);
});

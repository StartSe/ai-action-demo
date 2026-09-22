// Transferência com motivo, falha da IA sem silêncio e linha do tempo (0.3.0, US-002). A IA é falsa:
// `globalThis.fetch` responde no lugar do OpenRouter, ora com um marcador de transferência, ora com
// erro 500. A chave existe só dentro dos testes que precisam da IA ligada (`comIA`).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-transferencia-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { lerMotivo, semMarcador, rotuloMotivo, FRASE_FALHA_PADRAO } = await import("../lib/transferencia");
const {
  apagarConversa,
  assumir,
  devolver,
  historicoRecente,
  mensagensSemResposta,
  obterConversa,
  registrarEvento,
  registrarMensagemCliente,
  registrarMensagemHumana,
  registrarResposta,
  resolver,
} = await import("../lib/conversas");
const { responder } = await import("../lib/atendente");
const { linhasParaExportar } = await import("../lib/metricas");
const { ultimaFalhaEnvio } = await import("../lib/whatsapp");
const { setConfig } = await import("../lib/store");
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  rmSync(pasta, { recursive: true, force: true });
});

/** O que a IA falsa devolve na próxima chamada: um texto (resposta do modelo) ou um status de erro. */
let iaFalsa: { texto: string } | { status: number } = { texto: "Claro!" };
globalThis.fetch = async (url) => {
  const endereco = String(url);
  if (endereco.includes("openrouter.ai")) {
    if ("status" in iaFalsa) return new Response(JSON.stringify({ error: { message: "quebrou" } }), { status: iaFalsa.status });
    return Response.json({ choices: [{ message: { content: iaFalsa.texto } }] });
  }
  throw new Error(`Chamada inesperada no teste: ${endereco}`);
};

/** Liga a IA (chave falsa no banco) só durante `fn`. */
async function comIA(fn: () => Promise<void>) {
  process.env.OPENROUTER_API_KEY = "chave-de-teste";
  try {
    await fn();
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
}

test("lerMotivo reconhece [TRANSFERIR] (sem motivo) e [TRANSFERIR:motivo], e semMarcador limpa o fim", () => {
  assert.equal(lerMotivo("Vou chamar alguém.\n[TRANSFERIR]"), "sem_informacao");
  assert.equal(lerMotivo("Vou chamar alguém.\n[TRANSFERIR:cliente_pediu]"), "cliente_pediu");
  assert.equal(lerMotivo("Sinto muito.\n[transferir: reclamacao]  \n"), "reclamacao");
  assert.equal(lerMotivo("Texto\n[TRANSFERIR:inventado]"), "sem_informacao", "motivo desconhecido cai no padrão");
  assert.equal(lerMotivo("Resposta normal, sem marcador."), null);
  assert.equal(lerMotivo("O marcador [TRANSFERIR] no meio não conta."), null);
  assert.equal(semMarcador("Vou chamar alguém.\n[TRANSFERIR:cliente_pediu]\n"), "Vou chamar alguém.");
  assert.equal(rotuloMotivo("falha"), "Falha ao responder");
});

test("registrarResposta com transferência grava atenção, motivo, espera e o evento da linha do tempo", () => {
  const numero = "5511900000101";
  registrarMensagemCliente({ numero, texto: "Quero falar com uma pessoa", origem: "whatsapp" });
  registrarResposta({ numero, texto: "Claro, já chamo alguém.", transferir: true, motivo: "cliente_pediu", atendente: "Bia" });
  const c = obterConversa(numero)!;
  assert.equal(c.status, "atencao");
  assert.equal(c.motivoTransferencia, "cliente_pediu");
  assert.ok(c.esperandoDesde, "a espera começa na transferência");
  assert.deepEqual(c.mensagens.map((m) => m.papel), ["cliente", "atendente", "evento", "nota"]);
  assert.equal(c.mensagens[2].texto, "Bia pediu ajuda de uma pessoa · O cliente pediu uma pessoa");
  // Eventos não entram na memória da IA nem contam como resposta pendente.
  assert.deepEqual(historicoRecente(numero).map((m) => m.papel), ["cliente", "atendente"]);
  registrarMensagemCliente({ numero, texto: "Ok, aguardo", origem: "whatsapp" });
  assert.deepEqual(mensagensSemResposta(numero).map((m) => m.texto), ["Ok, aguardo"]);
  assert.equal(obterConversa(numero)!.naoLidas, 0, "evento não conta como não lida (e atenção não soma não lidas)");
  // A planilha traz o motivo.
  const linha = linhasParaExportar("hoje").find((l) => l.numero === numero)!;
  assert.equal(linha.motivoTransferencia, "cliente_pediu");
  assert.equal(linha.totalMensagens, 3, "o evento não conta como mensagem na planilha");
  apagarConversa(numero);
});

test("assumir, devolver e resolver escrevem na linha do tempo e zeram o que devem", () => {
  const numero = "5511900000102";
  registrarMensagemCliente({ numero, texto: "Fazem cirurgia?", origem: "whatsapp" });
  registrarResposta({ numero, texto: "Vou chamar alguém.", transferir: true, motivo: "sem_informacao", atendente: "Bia" });
  assumir(numero);
  let c = obterConversa(numero)!;
  assert.equal(c.status, "humano");
  assert.equal(c.motivoTransferencia, "sem_informacao", "assumir mantém o motivo");
  assert.ok(c.esperandoDesde, "assumir não é responder: a espera continua");
  assert.equal(c.mensagens.at(-1)!.texto, "Você assumiu a conversa");
  // A pessoa respondeu: a espera acaba.
  registrarMensagemHumana(numero, "Fazemos sim, na unidade centro.");
  assert.equal(obterConversa(numero)!.esperandoDesde, null);
  // Cliente escreve de novo com a conversa em humano: a espera recomeça uma vez só.
  registrarMensagemCliente({ numero, texto: "Quanto custa?", origem: "whatsapp" });
  const desde = obterConversa(numero)!.esperandoDesde;
  assert.ok(desde);
  registrarMensagemCliente({ numero, texto: "?", origem: "whatsapp" });
  assert.equal(obterConversa(numero)!.esperandoDesde, desde, "segunda mensagem não reinicia a contagem");
  assert.equal(obterConversa(numero)!.naoLidas, 2);
  devolver(numero, "Bia");
  c = obterConversa(numero)!;
  assert.equal(c.status, "ia");
  assert.equal(c.motivoTransferencia, null, "devolver zera o motivo");
  assert.equal(c.esperandoDesde, null);
  assert.equal(c.mensagens.at(-1)!.texto, "Conversa devolvida para Bia");
  resolver(numero);
  c = obterConversa(numero)!;
  assert.equal(c.status, "resolvida");
  assert.equal(c.mensagens.at(-1)!.texto, "Marcada como resolvida");
  // Reabertura pelo cliente: evento antes da mensagem que reabriu.
  registrarMensagemCliente({ numero, texto: "Voltei", origem: "whatsapp" });
  c = obterConversa(numero)!;
  assert.equal(c.status, "ia");
  assert.deepEqual(c.mensagens.slice(-2).map((m) => [m.papel, m.texto]), [["evento", "Conversa reaberta pelo cliente"], ["cliente", "Voltei"]]);
  // Um evento avulso não mexe em atualizado_em.
  const antes = obterConversa(numero)!.atualizadoEm;
  registrarEvento(numero, "Teste");
  assert.equal(obterConversa(numero)!.atualizadoEm, antes);
  apagarConversa(numero);
});

test("IA respondendo com [TRANSFERIR:cliente_pediu] grava atenção, motivo e evento, sem o marcador no texto", async () => {
  const numero = "5511900000103";
  await comIA(async () => {
    iaFalsa = { texto: "Claro, já chamo uma pessoa da equipe para falar com você.\n[TRANSFERIR:cliente_pediu]" };
    const r = await responder({ numero, texto: "Quero falar com um humano", origem: "whatsapp" });
    assert.equal(r.transferir, true);
    assert.equal(r.motivo, "cliente_pediu");
    assert.equal(r.resposta, "Claro, já chamo uma pessoa da equipe para falar com você.");
  });
  const c = obterConversa(numero)!;
  assert.equal(c.status, "atencao");
  assert.equal(c.motivoTransferencia, "cliente_pediu");
  assert.deepEqual(c.mensagens.map((m) => m.papel), ["cliente", "atendente", "evento", "nota"]);
  assert.ok(!c.mensagens[1].texto.includes("TRANSFERIR"));
  assert.match(c.mensagens[2].texto, /pediu ajuda de uma pessoa · O cliente pediu uma pessoa$/);
  apagarConversa(numero);
});

test("IA devolvendo 500 numa conversa do WhatsApp: frase de reserva, atenção e motivo falha", async () => {
  const numero = "5511900000104";
  setConfig("WHATSAPP_ULTIMA_FALHA", "");
  await comIA(async () => {
    iaFalsa = { status: 500 };
    const r = await responder({ numero, texto: "Oi, tudo bem?", origem: "whatsapp" });
    assert.equal(r.resposta, FRASE_FALHA_PADRAO);
    assert.equal(r.transferir, true);
    assert.equal(r.motivo, "falha");
  });
  const c = obterConversa(numero)!;
  assert.equal(c.status, "atencao");
  assert.equal(c.motivoTransferencia, "falha");
  assert.deepEqual(c.mensagens.map((m) => m.papel), ["cliente", "atendente", "evento", "nota"]);
  assert.equal(c.mensagens[1].texto, FRASE_FALHA_PADRAO);
  assert.match(c.mensagens[2].texto, /Falha ao responder$/);
  assert.match(ultimaFalhaEnvio()?.mensagem ?? "", /A IA não conseguiu responder/);
  apagarConversa(numero);
});

test("IA devolvendo 500 no simulador continua sendo erro (a bolha vermelha)", async () => {
  await comIA(async () => {
    iaFalsa = { status: 500 };
    await assert.rejects(responder({ numero: "simulador", texto: "Oi", origem: "simulador" }));
  });
  const c = obterConversa("simulador")!;
  assert.deepEqual(c.mensagens.map((m) => m.papel), ["cliente"], "nada foi respondido nem transferido");
  assert.equal(c.status, "ia");
  apagarConversa("simulador");
});

test("sem IA, a transferência do caminho local ganha o motivo padrão", async () => {
  const numero = "5511900000105";
  const r = await responder({ numero, texto: "Vocês fazem cirurgia cardíaca?", origem: "whatsapp" });
  assert.equal(r.transferir, true);
  assert.equal(r.motivo, "sem_informacao");
  assert.equal(obterConversa(numero)!.motivoTransferencia, "sem_informacao");
  apagarConversa(numero);
});

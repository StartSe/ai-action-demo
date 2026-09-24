// Notas internas (0.3.0, US-014): a anotação da equipe dentro da conversa. O que está em teste é o
// SERVIDOR — gravar e apagar pelas rotas, não mexer em status, não lidas nem última mensagem, ficar
// fora do que a IA lê, a marca `temNotas` na lista e a nota automática que a transferência deixa. A
// z-api é falsa (`globalThis.fetch`) e as rotas do Next são chamadas direto, como funções.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-notas-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { apagarConversa, historicoRecente, listarConversas, obterConversa, obterRegistro, registrarMensagemCliente, registrarResposta, resolver } =
  await import("../lib/conversas");
const { LIMITE_NOTA } = await import("../lib/types");
const { POST: postNota } = await import("../app/api/conversas/[numero]/notas/route");
const { DELETE: deleteNota } = await import("../app/api/conversas/[numero]/notas/[id]/route");
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  rmSync(pasta, { recursive: true, force: true });
});

const envios: unknown[] = [];
globalThis.fetch = async (url, opts) => {
  const endereco = String(url);
  if (endereco.includes("/send-text")) {
    envios.push(JSON.parse(String(opts?.body)));
    return Response.json({ zaapId: "z1", messageId: `msg-${envios.length}`, id: "i1" });
  }
  throw new Error(`Chamada inesperada no teste: ${endereco}`);
};

const params = (numero: string) => ({ params: Promise.resolve({ numero }) });
const paramsNota = (numero: string, id: number) => ({ params: Promise.resolve({ numero, id: String(id) }) });
const anotar = (numero: string, texto: string) =>
  postNota(new Request("http://app/api/conversas/x/notas", { method: "POST", body: JSON.stringify({ texto }) }), params(numero));
const notasDe = (numero: string) => obterConversa(numero)!.mensagens.filter((m) => m.papel === "nota");

test("a nota grava sem enviar nada, sem mexer no status, nas não lidas nem na última mensagem", async () => {
  const numero = "5511900000401";
  registrarMensagemCliente({ numero, texto: "Vocês abrem no sábado?", origem: "whatsapp", idExterno: `${numero}-1` });
  const antes = obterRegistro(numero)!;

  const r = await anotar(numero, "Cliente é do plano Amil; conferir carteirinha na chegada.");
  assert.equal(r.status, 200);
  const { conversa } = (await r.json()) as { conversa: { mensagens: { papel: string; texto: string }[] } };
  assert.equal(conversa.mensagens.filter((m) => m.papel === "nota").length, 1);

  const depois = obterRegistro(numero)!;
  assert.equal(depois.status, antes.status, "anotar não muda quem atende");
  assert.equal(depois.naoLidas, antes.naoLidas, "a nota não é mensagem de ninguém: não conta como não lida");
  assert.equal(depois.atualizadoEm, antes.atualizadoEm, "anotar não joga a conversa para o topo da lista");
  assert.equal(envios.length, 0, "nada saiu pelo número da empresa");

  const naLista = listarConversas().find((c) => c.numero === numero)!;
  assert.equal(naLista.ultima_mensagem, "Vocês abrem no sábado?", "a prévia continua sendo a última mensagem do cliente");
  assert.equal(naLista.temNotas, true, "a lista marca a conversa que tem anotação");

  // A IA nunca lê uma nota interna.
  assert.ok(!historicoRecente(numero).some((m) => m.texto.includes("Amil")));
  apagarConversa(numero);
});

test("a nota funciona em qualquer status, inclusive na conversa resolvida, e não assume nada", async () => {
  const numero = "5511900000402";
  registrarMensagemCliente({ numero, texto: "Obrigado!", origem: "whatsapp", idExterno: `${numero}-1` });
  resolver(numero);
  assert.equal(obterRegistro(numero)!.status, "resolvida");

  const r = await anotar(numero, "Combinado: retorno em 6 meses.");
  assert.equal(r.status, 200);
  assert.equal(obterRegistro(numero)!.status, "resolvida", "anotar numa conversa resolvida não a reabre");
  assert.equal(notasDe(numero).length, 1);
  apagarConversa(numero);
});

test("texto vazio e texto acima do teto são recusados com frase de negócio", async () => {
  const numero = "5511900000403";
  registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp", idExterno: `${numero}-1` });

  const vazia = await anotar(numero, "   ");
  assert.equal(vazia.status, 400);
  assert.match(((await vazia.json()) as { error: string }).error, /Escreva a nota/);

  const grande = await anotar(numero, "a".repeat(LIMITE_NOTA + 1));
  assert.equal(grande.status, 400);
  assert.match(((await grande.json()) as { error: string }).error, /caracteres/);

  const noLimite = await anotar(numero, "a".repeat(LIMITE_NOTA));
  assert.equal(noLimite.status, 200);
  assert.equal(notasDe(numero).length, 1, "só a nota que cabe foi gravada");
  apagarConversa(numero);
});

test("apagar tira a nota da conversa; um id que não é nota devolve 404", async () => {
  const numero = "5511900000404";
  registrarMensagemCliente({ numero, texto: "Quanto custa?", origem: "whatsapp", idExterno: `${numero}-1` });
  await anotar(numero, "Orçamento enviado por e-mail em 12/09.");
  const nota = notasDe(numero)[0]!;
  const mensagemDoCliente = obterConversa(numero)!.mensagens.find((m) => m.papel === "cliente")!;

  const recusa = await deleteNota(new Request("http://app", { method: "DELETE" }), paramsNota(numero, mensagemDoCliente.id));
  assert.equal(recusa.status, 404, "a rota de notas não apaga mensagem da conversa");
  assert.ok(obterConversa(numero)!.mensagens.some((m) => m.id === mensagemDoCliente.id));

  const r = await deleteNota(new Request("http://app", { method: "DELETE" }), paramsNota(numero, nota.id));
  assert.equal(r.status, 200);
  assert.equal(notasDe(numero).length, 0);
  assert.equal(listarConversas().find((c) => c.numero === numero)!.temNotas, false);
  apagarConversa(numero);
});

test("a transferência deixa uma nota com o motivo, a pergunta e a assinatura do atendente", async () => {
  const numero = "5511900000405";
  registrarMensagemCliente({ numero, texto: "Fazem cirurgia cardíaca?", origem: "whatsapp", idExterno: `${numero}-1` });
  registrarResposta({ numero, texto: "Vou chamar uma pessoa da equipe.", transferir: true, motivo: "sem_informacao", atendente: "Bia" });

  const notas = notasDe(numero);
  assert.equal(notas.length, 1);
  assert.equal(notas[0]!.texto, "Pedi ajuda porque a base não tinha a informação. Pergunta: “Fazem cirurgia cardíaca?” — Bia");
  // O evento continua existindo: a nota conta a razão, a linha do tempo conta quando aconteceu.
  assert.ok(obterConversa(numero)!.mensagens.some((m) => m.papel === "evento" && m.texto.includes("pediu ajuda de uma pessoa")));

  // Uma resposta normal não anota nada.
  registrarMensagemCliente({ numero, texto: "E limpeza?", origem: "whatsapp", idExterno: `${numero}-2` });
  registrarResposta({ numero, texto: "A limpeza custa R$ 180.", atendente: "Bia" });
  assert.equal(notasDe(numero).length, 1);
  apagarConversa(numero);
});

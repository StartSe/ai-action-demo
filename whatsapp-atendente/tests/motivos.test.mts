// Por que a IA precisou de gente (0.3.0, US-019). O que está em teste é o que alimenta o cartão
// "Por que o atendente pediu ajuda" de Relatórios: a contagem por motivo e a contagem de mensagens
// que o canal recusou (`lib/metricas.ts`), mais a frase de leitura por motivo dominante
// (`lib/transferencia.ts`). Sem conta, sem chave e sem rede.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-motivos-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { apagarConversa, devolver, marcarFalhaEnvio, registrarMensagemCliente, registrarResposta } = await import("../lib/conversas");
const { calcular } = await import("../lib/metricas");
const { leituraDosMotivos, SEM_TRANSFERENCIAS } = await import("../lib/transferencia");

after(() => rmSync(pasta, { recursive: true, force: true }));

/** Uma conversa que o atendente transferiu por este motivo, do jeito que o app grava de verdade. */
function transferida(numero: string, motivo: "sem_informacao" | "fora_do_escopo" | "cliente_pediu" | "falha") {
  registrarMensagemCliente({ numero, texto: "Uma pergunta qualquer", origem: "whatsapp" });
  return registrarResposta({ numero, texto: "Vou chamar alguém da equipe.", transferir: true, motivo, atendente: "Bia" });
}

test("a leitura aponta um próximo passo pelo motivo mais frequente, e nada quando não houve transferência", () => {
  assert.equal(leituraDosMotivos([]), SEM_TRANSFERENCIAS);
  assert.match(leituraDosMotivos([]).texto, /Nenhuma transferência/);

  const base = leituraDosMotivos([{ motivo: "sem_informacao", total: 4 }, { motivo: "falha", total: 1 }]);
  assert.match(base.texto, /a base não cobre/);
  assert.equal(base.acao?.url, "/assistente#conhecimento");

  // O dominante manda: com uma falha à frente, a leitura deixa de ser sobre a base e passa a ser sobre a IA.
  const falha = leituraDosMotivos([{ motivo: "falha", total: 3 }, { motivo: "sem_informacao", total: 1 }]);
  assert.equal(falha.acao?.url, "/setup#openrouter");

  // "O cliente pediu uma pessoa" não é problema do atendente: a leitura não oferece ação nenhuma.
  assert.equal(leituraDosMotivos([{ motivo: "cliente_pediu", total: 2 }]).acao, undefined);
});

test("os motivos do período são agrupados e ordenados do mais frequente para o menos", () => {
  const numeros = ["5511900000001", "5511900000002", "5511900000003"];
  transferida(numeros[0], "sem_informacao");
  transferida(numeros[1], "sem_informacao");
  transferida(numeros[2], "cliente_pediu");

  const { motivos } = calcular("hoje");
  assert.deepEqual(motivos, [
    { motivo: "sem_informacao", total: 2 },
    { motivo: "cliente_pediu", total: 1 },
  ]);

  // Devolver a conversa para a IA zera o motivo: ela deixou de estar parada por ele.
  devolver(numeros[0], "Bia");
  assert.deepEqual(calcular("hoje").motivos, [
    { motivo: "cliente_pediu", total: 1 },
    { motivo: "sem_informacao", total: 1 },
  ]);

  numeros.forEach(apagarConversa);
});

test("mensagem que o canal recusou conta como não entregue no período", () => {
  const numero = "5511900000009";
  assert.equal(calcular("hoje").naoEntregues, 0);

  registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp" });
  const mensagemId = registrarResposta({ numero, texto: "Olá! Como posso ajudar?" });
  marcarFalhaEnvio(mensagemId, "O número não está conectado.");

  assert.equal(calcular("hoje").naoEntregues, 1);
  apagarConversa(numero);
});

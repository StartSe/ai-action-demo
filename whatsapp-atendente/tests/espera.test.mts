// Quem está esperando há muito tempo (0.3.0, US-017). O que está em teste é o SERVIDOR e as regras
// puras: a consulta leve que alimenta o contador do cabeçalho e o som (`esperasAbertas`), a rota
// `GET /api/conversas/esperando` com o limite salvo na configuração, e lib/espera.ts (quem está
// esperando, há quanto tempo e quando isso passou do limite). Sem conta, sem chave e sem rede.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-espera-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { apagarConversa, assumir, esperasAbertas, registrarMensagemCliente, registrarMensagemHumana, registrarResposta, resolver } =
  await import("../lib/conversas");
const { duracaoEspera, estaEsperando, lerAvisoEspera, minutosEsperando, passouDoLimite, textoEspera } = await import("../lib/espera");
const { getConfig, migrarConfig, setConfig } = await import("../lib/estado");
const { GET: getEsperando } = await import("../app/api/conversas/esperando/route");

after(() => rmSync(pasta, { recursive: true, force: true }));

const minutosAtras = (n: number) => new Date(Date.now() - n * 60_000);
const esperando = async () => (await getEsperando().then((r) => r.json())) as { atencao: number; esperando: number; atrasadas: number; limiteMin: number };

test("uma conversa espera quando a IA pediu ajuda, ou quando alguém assumiu e o cliente escreveu de novo", () => {
  assert.equal(estaEsperando("atencao", 0), true);
  assert.equal(estaEsperando("humano", 2), true);
  // Assumida e sem nada por ler: quem atende já está com ela na mão, ninguém está parado esperando.
  assert.equal(estaEsperando("humano", 0), false);
  assert.equal(estaEsperando("ia", 3), false);
  assert.equal(estaEsperando("resolvida", 0), false);
});

test("a duração é lida em minutos inteiros e escrita em linguagem de gente", () => {
  assert.equal(minutosEsperando(null), null);
  assert.equal(minutosEsperando("não é data"), null);
  assert.equal(minutosEsperando(minutosAtras(20).toISOString()), 20);
  assert.equal(duracaoEspera(0), "menos de 1 min");
  assert.equal(duracaoEspera(20), "20 min");
  assert.equal(duracaoEspera(60), "1 h");
  assert.equal(duracaoEspera(130), "2 h 10 min");
  assert.equal(duracaoEspera(60 * 24 * 3), "3 dias");
  assert.equal(textoEspera("atencao", 0, minutosAtras(20).toISOString()), "Esperando há 20 min");
  assert.equal(textoEspera("ia", 0, minutosAtras(20).toISOString()), null);
  // Sem a marca de espera (conversa gravada antes da coluna existir) não há o que mostrar.
  assert.equal(textoEspera("atencao", 0, null), null);
});

test("passar do limite é ter esperado pelo menos o que a operação aceita", () => {
  assert.equal(passouDoLimite(minutosAtras(4).toISOString(), 10), false);
  assert.equal(passouDoLimite(minutosAtras(20).toISOString(), 10), true);
  assert.equal(passouDoLimite(minutosAtras(20).toISOString(), 30), false);
  assert.equal(passouDoLimite(null, 5), false);
});

test("o limite salvo aceita só os quatro valores do campo; o resto vale o padrão", () => {
  assert.equal(lerAvisoEspera(5), 5);
  assert.equal(lerAvisoEspera("30"), 30);
  assert.equal(lerAvisoEspera(7), 10);
  assert.equal(lerAvisoEspera(undefined), 10);
  // Configuração gravada antes desta história abre com o padrão, sem quebrar nada do resto.
  assert.equal(migrarConfig({ negocio: "Loja", atendente: "Ana" }).avisoEsperaMin, 10);
});

test("a consulta leve traz quem está parado, e a rota compara com o limite salvo", async () => {
  registrarMensagemCliente({ numero: "5511900000001", texto: "Quero falar com alguém", origem: "whatsapp", em: minutosAtras(25) });
  registrarResposta({ numero: "5511900000001", texto: "Vou chamar uma pessoa", transferir: true, motivo: "cliente_pediu", em: minutosAtras(25) });
  registrarMensagemCliente({ numero: "5511900000002", texto: "Oi", origem: "whatsapp", em: minutosAtras(2) });
  registrarResposta({ numero: "5511900000002", texto: "Preciso de ajuda aqui", transferir: true, motivo: "sem_informacao", em: minutosAtras(2) });
  // Assumida e respondida: some da lista de quem espera.
  registrarMensagemCliente({ numero: "5511900000003", texto: "Bom dia", origem: "whatsapp", em: minutosAtras(40) });
  assumir("5511900000003");
  registrarMensagemHumana("5511900000003", "Bom dia, já vejo isso");

  const abertas = esperasAbertas();
  assert.deepEqual(abertas.map((e) => e.numero).sort(), ["5511900000001", "5511900000002"]);

  const antes = await esperando();
  assert.equal(antes.atencao, 2);
  assert.equal(antes.esperando, 2);
  assert.equal(antes.limiteMin, 10);
  assert.equal(antes.atrasadas, 1, "só a de 25 minutos passou do limite de 10");

  // O limite é da operação: subir para 30 minutos tira a de 25 do vermelho, sem mexer em conversa nenhuma.
  setConfig({ ...getConfig(), avisoEsperaMin: 30 });
  const depois = await esperando();
  assert.equal(depois.limiteMin, 30);
  assert.equal(depois.atrasadas, 0);
  setConfig({ ...getConfig(), avisoEsperaMin: 10 });

  // O cliente volta a escrever numa conversa já assumida: ela passa a esperar de novo, sem estar em atenção.
  registrarMensagemCliente({ numero: "5511900000003", texto: "Alô?", origem: "whatsapp", em: minutosAtras(15) });
  const comNaoLida = await esperando();
  assert.equal(comNaoLida.atencao, 2, "a assumida continua fora do contador de atenção");
  assert.equal(comNaoLida.esperando, 3);
  assert.equal(comNaoLida.atrasadas, 2);

  resolver("5511900000001");
  const resolvida = await esperando();
  assert.equal(resolvida.atencao, 1);
  assert.equal(resolvida.atrasadas, 1);

  for (const numero of ["5511900000001", "5511900000002", "5511900000003"]) apagarConversa(numero);
  const vazio = await esperando();
  assert.equal(vazio.esperando, 0);
});

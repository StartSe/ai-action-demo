// Atualização em tempo real (0.3.0, US-004): quem escreve no banco publica um aviso em lib/eventos.ts,
// e `GET /api/eventos` entrega esses avisos às telas abertas por `text/event-stream`. Aqui o fluxo é
// lido direto do corpo da resposta da rota (chamada como função, sem servidor HTTP) e o "navegador" é
// um leitor de `ReadableStream`. Sem OPENROUTER_API_KEY: o que está em teste é o aviso, não o texto.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-eventos-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { apagarConversa, assumir, marcarLido, registrarMensagemCliente, registrarResposta } = await import("../lib/conversas");
const { assinantes, conexoesAbertas, fecharTodasAsConexoes, publicar } = await import("../lib/eventos");
const { gravarConexao } = await import("../lib/zapi");
const { GET: getEventos } = await import("../app/api/eventos/route");

after(() => {
  fecharTodasAsConexoes();
  rmSync(pasta, { recursive: true, force: true });
});

type EventoLido = { tipo: string; numero?: string };

/** Uma "aba aberta": liga no fluxo e vai juntando o que chega, como o `EventSource` do navegador faz. */
function abrirAba() {
  const abortar = new AbortController();
  const resposta = getEventos(new Request("http://localhost/api/eventos", { signal: abortar.signal }));
  const leitor = (resposta.body as ReadableStream<Uint8Array>).getReader();
  const decodificador = new TextDecoder();
  let pendente = "";
  let tudo = "";
  const eventos: EventoLido[] = [];
  const lendo = (async () => {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) return;
      const pedaco = decodificador.decode(value, { stream: true });
      tudo += pedaco;
      pendente += pedaco;
      for (const bloco of pendente.split("\n\n")) {
        const dado = bloco.split("\n").find((l) => l.startsWith("data: "));
        if (dado) eventos.push(JSON.parse(dado.slice(6)) as EventoLido);
      }
      pendente = pendente.slice(pendente.lastIndexOf("\n\n") + 2);
    }
  })();
  return { resposta, eventos, bruto: () => tudo, fechar: () => abortar.abort(), lendo };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("o fluxo tem o cabeçalho de eventos, abre com um comentário e se fecha no abort", async () => {
  const antes = conexoesAbertas();
  const aba = abrirAba();
  await esperar(20);
  assert.equal(aba.resposta.headers.get("Content-Type"), "text/event-stream; charset=utf-8");
  assert.match(aba.resposta.headers.get("Cache-Control") ?? "", /no-cache/);
  // O primeiro pedaço é uma linha de comentário do protocolo, a mesma forma do `: ping` de 25 s.
  assert.match(aba.bruto(), /^: conectado\n\n$/);
  assert.equal(conexoesAbertas(), antes + 1);
  assert.equal(assinantes(), antes + 1);

  aba.fechar();
  await aba.lendo;
  assert.equal(conexoesAbertas(), antes);
  assert.equal(assinantes(), antes, "a assinatura sai junto com a conexão: um fluxo fechado não pode continuar escutando");
});

test("duas abas recebem o mesmo aviso, com o número da conversa", async () => {
  const uma = abrirAba();
  const outra = abrirAba();
  await esperar(20);

  publicar({ tipo: "conversa", numero: "5511999999999" });
  await esperar(20);

  for (const aba of [uma, outra]) {
    assert.deepEqual(aba.eventos, [{ tipo: "conversa", numero: "5511999999999" }]);
    aba.fechar();
  }
  await Promise.all([uma.lendo, outra.lendo]);
});

test("mensagem do cliente, resposta com transferência e ações avisam as telas", async () => {
  const numero = "5511911112222";
  const aba = abrirAba();
  await esperar(20);

  registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp", nome: "Ana" });
  registrarResposta({ numero, texto: "Vou chamar alguém", transferir: true, motivo: "cliente_pediu", atendente: "Bia" });
  assumir(numero);
  await esperar(20);

  const tipos = aba.eventos.map((e) => e.tipo);
  assert.ok(tipos.includes("conversa"), "a mensagem do cliente avisa a lista e a conversa aberta");
  assert.ok(
    aba.eventos.some((e) => e.tipo === "atencao" && e.numero === numero),
    "a transferência avisa que esta conversa passou a esperar por uma pessoa"
  );
  assert.ok(aba.eventos.every((e) => e.tipo === "conexao" || e.numero === numero), "nenhum aviso sai com o número errado");

  aba.fechar();
  await aba.lendo;
  apagarConversa(numero);
});

test("ler uma conversa sem nada por ler não avisa ninguém (senão a tela se recarregaria sem fim)", async () => {
  const numero = "5511933334444";
  registrarMensagemCliente({ numero, texto: "Oi", origem: "whatsapp" });
  assumir(numero); // zera as não lidas
  registrarMensagemCliente({ numero, texto: "Alguém aí?", origem: "whatsapp" }); // volta a ter uma por ler

  const aba = abrirAba();
  await esperar(20);

  marcarLido(numero);
  await esperar(20);
  assert.equal(aba.eventos.length, 1, "a primeira leitura zera as não lidas e avisa");

  marcarLido(numero);
  await esperar(20);
  assert.equal(aba.eventos.length, 1, "a segunda leitura não muda nada e não avisa");

  aba.fechar();
  await aba.lendo;
  apagarConversa(numero);
});

test("a conexão do número só avisa quando o estado muda", async () => {
  const aba = abrirAba();
  await esperar(20);

  gravarConexao({ conectado: true, numero: "5511988887777", em: new Date().toISOString() });
  gravarConexao({ conectado: true, em: new Date().toISOString() });
  gravarConexao({ conectado: true, em: new Date().toISOString() });
  await esperar(20);
  assert.deepEqual(aba.eventos, [{ tipo: "conexao" }], "as consultas seguintes gravam a mesma conexão e não avisam de novo");

  gravarConexao({ conectado: false, em: new Date().toISOString() });
  await esperar(20);
  assert.equal(aba.eventos.length, 2, "o número caiu: isso é mudança de estado e avisa");

  aba.fechar();
  await aba.lendo;
});

test("o desligamento do processo fecha todas as conexões abertas", async () => {
  const uma = abrirAba();
  const outra = abrirAba();
  await esperar(20);
  assert.equal(conexoesAbertas(), 2);

  fecharTodasAsConexoes();
  await Promise.all([uma.lendo, outra.lendo]);
  assert.equal(conexoesAbertas(), 0);
  assert.equal(assinantes(), 0);
});

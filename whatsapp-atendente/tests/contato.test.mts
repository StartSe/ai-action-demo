// O que o atendente lembra de cada cliente (0.3.0, US-012): a tabela `contatos` de lib/memoria.ts, que
// atravessa as conversas do mesmo número. A IA é falsa (`globalThis.fetch` em `openrouter.ai`) e
// devolve os fatos que ela "anotou"; ela também guarda o `system` de cada resposta ao cliente, que é
// como se confere que a memória entrou mesmo no prompt seguinte. As rotas do Next são chamadas direto,
// como funções.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-contato-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { migrarConfig } = await import("../lib/estado");
const { apagarConversa, obterConversa, registrarMensagemCliente } = await import("../lib/conversas");
const { responder } = await import("../lib/atendente");
const { atualizarMemoria, obterContato, salvarContato } = await import("../lib/memoria");
const { linhasParaExportar } = await import("../lib/metricas");
const { PUT: putContato, DELETE: deleteContato } = await import("../app/api/conversas/[numero]/contato/route");
const { DELETE: deleteConversa } = await import("../app/api/conversas/[numero]/route");

const originalFetch = globalThis.fetch;
after(async () => {
  // A janela da rajada (3 s) pode estar aberta; apagar o DATA_DIR antes dela fechar suja o log.
  await new Promise((r) => setTimeout(r, 3500));
  globalThis.fetch = originalFetch;
  rmSync(pasta, { recursive: true, force: true });
});

/** O que a IA falsa devolve quando pedem para anotar o que lembrar do cliente. */
const anotacaoDaIA = { memoria: "Se apresentou como Paulo. Quer uma limpeza na sexta de manhã.", nome: "Paulo Andrade", email: "", telefone: "11 98888-7777" };
/** O que ela devolve quando a anotação é de uma pessoa e ela só pode acrescentar. */
let acrescimoDaIA = "Também pediu um orçamento de clareamento.";
/** Os `system` das respostas ao cliente, na ordem: é neles que a memória tem que aparecer. */
const systemsDeResposta: string[] = [];
/** Os pedidos de anotação que chegaram à IA falsa. */
const pedidosDeMemoria: { system: string; prompt: string }[] = [];

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const endereco = String(url);
  if (!endereco.includes("openrouter.ai")) throw new Error(`Chamada inesperada no teste: ${endereco}`);
  const corpo = JSON.parse(String(init?.body ?? "{}")) as { messages?: { role: string; content: string }[] };
  const messages = corpo.messages ?? [];
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const prompt = messages.find((m) => m.role === "user")?.content ?? "";
  // Cada uso de askJSON neste app se reconhece por uma frase do próprio `system`.
  if (system.includes("separa por assunto")) return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"assunto":"Outros"}' } }] });
  if (system.includes("resume conversas")) return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"resumo":"resumo qualquer"}' } }] });
  if (system.includes("precisa lembrar de um cliente")) {
    pedidosDeMemoria.push({ system, prompt });
    const conteudo = system.includes('"acrescentar"') ? JSON.stringify({ acrescentar: acrescimoDaIA }) : JSON.stringify(anotacaoDaIA);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: conteudo } }] });
  }
  systemsDeResposta.push(system);
  return Response.json({ choices: [{ finish_reason: "stop", message: { content: "Certo, anotado!" } }] });
}) as typeof fetch;

const CONFIG = migrarConfig({
  negocio: "Clínica Teste",
  atendente: "Ana",
  baseConhecimento: "Limpeza: R$ 150. Atendemos de segunda a sexta, das 8h às 18h.",
});

async function comIA<T>(fn: () => Promise<T>): Promise<T> {
  process.env.OPENROUTER_API_KEY = "chave-de-teste";
  try {
    return await fn();
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
}

/** Uma conversa de verdade: cada rodada grava uma mensagem do cliente e uma resposta do atendente. */
async function conversar(numero: string, rodadas: number, prefixo = "mensagem") {
  await comIA(async () => {
    for (let i = 0; i < rodadas; i++) await responder({ numero, texto: `${prefixo} ${i + 1}`, origem: "whatsapp", config: CONFIG });
  });
}

const params = (numero: string) => ({ params: Promise.resolve({ numero }) });

function pedido(corpo: unknown): Request {
  return new Request("http://localhost/api/conversas/x/contato", { method: "PUT", body: JSON.stringify(corpo) });
}

test("poucas mensagens não viram anotação; a partir de quatro, sim", async () => {
  const numero = "55110000401";
  await conversar(numero, 3);
  assert.equal(await comIA(() => atualizarMemoria(numero)), null, "três mensagens do cliente ainda não justificam uma ida à IA");
  assert.equal(obterContato(numero), null);

  await conversar(numero, 1, "outra");
  const contato = await comIA(() => atualizarMemoria(numero));
  assert.equal(contato?.memoria, anotacaoDaIA.memoria);
  assert.equal(contato?.nomeInformado, "Paulo Andrade");
  assert.equal(contato?.telefoneRetorno, "11 98888-7777");
  assert.equal(contato?.email, null, "campo que o cliente não informou fica vazio, não inventado");
  assert.equal(contato?.atualizadoPor, "ia");

  // A conversa que a tela lê traz o contato junto (quem junta as duas tabelas é a rota; aqui a
  // conversa sozinha vem sem ele, de propósito).
  assert.equal(obterConversa(numero)?.contato, null);
  apagarConversa(numero);
});

test("a anotação entra no system da resposta seguinte e vira fonte da bolha", async () => {
  const numero = "55110000402";
  await conversar(numero, 4);
  await comIA(() => atualizarMemoria(numero));

  systemsDeResposta.length = 0;
  await conversar(numero, 1, "pergunta nova");
  const system = systemsDeResposta.at(-1) ?? "";
  assert.match(system, /O que você já sabe sobre este cliente \(de conversas anteriores\): Se apresentou como Paulo/);
  assert.match(system, /Este cliente se chama Paulo Andrade/, "com o nome informado, a saudação passa a usar o nome");

  const resposta = obterConversa(numero)?.mensagens.filter((m) => m.papel === "atendente").at(-1);
  assert.deepEqual(resposta?.detalhes?.fontes.map((f) => f.tipo), ["memoria", "base"], "a memória é a primeira fonte do bloco");
  apagarConversa(numero);
});

test("a proibição do que nunca pode ser anotado vai no pedido à IA", async () => {
  const numero = "55110000403";
  await conversar(numero, 4);
  pedidosDeMemoria.length = 0;
  await comIA(() => atualizarMemoria(numero));
  const { system } = pedidosDeMemoria.at(-1) ?? { system: "" };
  for (const proibido of ["saúde", "CPF", "senhas", "cartão", "opinião"]) assert.match(system, new RegExp(proibido));
  apagarConversa(numero);
});

test("editar pela rota marca 'pessoa', e a IA passa a só acrescentar", async () => {
  const numero = "55110000404";
  await conversar(numero, 4);
  await comIA(() => atualizarMemoria(numero));

  const r = await putContato(pedido({ memoria: "Paulo prefere ser chamado de Paulinho. Só vem de manhã." }), params(numero));
  assert.equal(r.status, 200);
  const dados = (await r.json()) as { conversa: { contato: { memoria: string; atualizadoPor: string; nomeInformado: string | null } } };
  assert.equal(dados.conversa.contato.atualizadoPor, "pessoa");
  assert.match(dados.conversa.contato.memoria, /Paulinho/);
  assert.equal(dados.conversa.contato.nomeInformado, "Paulo Andrade", "salvar só o parágrafo não apaga o que o cliente tinha informado");

  // Mais mensagens: a IA não pode reescrever o que a pessoa acabou de corrigir.
  await conversar(numero, 4, "depois");
  const contato = await comIA(() => atualizarMemoria(numero));
  assert.match(contato?.memoria ?? "", /^Paulo prefere ser chamado de Paulinho\./, "o que a pessoa escreveu continua no começo, intacto");
  assert.match(contato?.memoria ?? "", /clareamento/, "e o que a IA achou de novo entra depois");
  const { system } = pedidosDeMemoria.at(-1) ?? { system: "" };
  assert.match(system, /acrescentar/, "o pedido à IA muda de formato quando ela só pode acrescentar");

  // A proteção conta da correção, não da última escrita: a IA acrescentar não devolve a ela o direito
  // de reescrever tudo na atualização seguinte.
  acrescimoDaIA = "E confirmou o endereço de entrega.";
  await conversar(numero, 4, "mais");
  const depois = await comIA(() => atualizarMemoria(numero));
  assert.match(depois?.memoria ?? "", /^Paulo prefere ser chamado de Paulinho\./, "a correção continua intocada no segundo acréscimo");
  assert.match(depois?.memoria ?? "", /endereço de entrega/);

  apagarConversa(numero);
});

test("o mesmo acréscimo duas vezes não é escrito duas vezes na anotação", async () => {
  const numero = "55110000409";
  await conversar(numero, 4);
  await comIA(() => atualizarMemoria(numero));
  await putContato(pedido({ memoria: "Cliente antigo da casa." }), params(numero));

  acrescimoDaIA = "Vai trazer o irmão na próxima.";
  await conversar(numero, 4, "depois");
  const primeira = await comIA(() => atualizarMemoria(numero));
  assert.match(primeira?.memoria ?? "", /Vai trazer o irmão na próxima\./);

  // A IA repete o mesmo fato (é o que um modelo faz quando a conversa continua no mesmo assunto):
  // a anotação não pode crescer com a mesma frase a cada atendimento.
  await conversar(numero, 4, "mais");
  assert.equal(await comIA(() => atualizarMemoria(numero)), null, "nada de novo: não vale gravar nem mexer na data");
  const texto = obterContato(numero)?.memoria ?? "";
  assert.equal(texto.split("Vai trazer o irmão na próxima.").length - 1, 1, "o acréscimo repetido é descartado");
  assert.match(texto, /^Cliente antigo da casa\./, "e o que a pessoa escreveu continua na frente");
  apagarConversa(numero);
});

test("'Apagar memória' zera; apagar a conversa apaga o contato junto", async () => {
  const numero = "55110000405";
  await conversar(numero, 4);
  await comIA(() => atualizarMemoria(numero));
  assert.notEqual(obterContato(numero), null);

  const r = await deleteContato(new Request("http://localhost/x", { method: "DELETE" }), params(numero));
  assert.equal(r.status, 200);
  assert.equal(obterContato(numero), null);
  assert.equal(((await r.json()) as { conversa: { contato: unknown } }).conversa.contato, null);

  await comIA(() => atualizarMemoria(numero));
  assert.notEqual(obterContato(numero), null, "apagar não impede o atendente de anotar de novo daqui para a frente");
  await deleteConversa(new Request("http://localhost/x", { method: "DELETE" }), params(numero));
  assert.equal(obterContato(numero), null, "apagar a conversa apaga tudo o que o app guardava deste número");
});

test("texto maior que o limite é recusado com frase de negócio", async () => {
  const numero = "55110000406";
  registrarMensagemCliente({ numero, texto: "oi", origem: "whatsapp" });
  const r = await putContato(pedido({ memoria: "a".repeat(1201) }), params(numero));
  assert.equal(r.status, 400);
  assert.match(((await r.json()) as { error: string }).error, /1200 caracteres/);
  apagarConversa(numero);
});

test("celular de teste, assistente e conversa de exemplo ficam de fora; sem IA, nada", async () => {
  await conversar("simulador", 4);
  assert.equal(await comIA(() => atualizarMemoria("simulador")), null);
  assert.equal(obterContato("simulador"), null);
  apagarConversa("simulador");

  const numero = "55110000407";
  await conversar(numero, 4);
  assert.equal(await atualizarMemoria(numero), null, "sem chave da IA ninguém anota nada");
  assert.equal(obterContato(numero), null);
  apagarConversa(numero);
});

test("a planilha traz o nome informado, o e-mail e o telefone de retorno", async () => {
  const numero = "55110000408";
  registrarMensagemCliente({ numero, texto: "quero saber o preço", origem: "whatsapp" });
  salvarContato(numero, { memoria: "Quer um orçamento.", nomeInformado: "Marina", email: "marina@exemplo.com", telefoneRetorno: "11 97777-1111" }, "pessoa");

  const linha = linhasParaExportar("hoje").find((l) => l.numero === numero);
  assert.equal(linha?.nomeInformado, "Marina");
  assert.equal(linha?.email, "marina@exemplo.com");
  assert.equal(linha?.telefoneRetorno, "11 97777-1111");
  apagarConversa(numero);
});

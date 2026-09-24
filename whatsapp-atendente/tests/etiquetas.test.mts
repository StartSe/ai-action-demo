// Etiquetas (0.3.0, US-016): a palavra que a equipe põe numa conversa para separá-la do jeito dela.
// O que está em teste é o SERVIDOR — as regras do nome, a lista da conta que nasce sozinha com a cor
// seguinte da paleta, o teto por conversa, o filtro da lista e o apagar que tira a etiqueta de todas
// as conversas. As rotas do Next são chamadas direto, como funções.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-etiquetas-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { apagarConversa, etiquetasDaEmpresa, listarConversas, obterRegistro, registrarMensagemCliente } = await import("../lib/conversas");
const { erroDeEtiqueta, normalizarEtiqueta, proximaCor } = await import("../lib/etiquetas");
const { linhasParaExportar } = await import("../lib/metricas");
const { MAX_ETIQUETAS_POR_CONVERSA } = await import("../lib/types");
const { PUT: putEtiquetas } = await import("../app/api/conversas/[numero]/etiquetas/route");
const { GET: getEtiquetas } = await import("../app/api/etiquetas/route");
const { DELETE: deleteEtiqueta } = await import("../app/api/etiquetas/[nome]/route");
const { GET: getConversas } = await import("../app/api/conversas/route");

after(() => rmSync(pasta, { recursive: true, force: true }));

const params = (numero: string) => ({ params: Promise.resolve({ numero }) });
const etiquetar = (numero: string, etiquetas: unknown) =>
  putEtiquetas(new Request("http://app/api/conversas/x/etiquetas", { method: "PUT", body: JSON.stringify({ etiquetas }) }), params(numero));
const escrever = (numero: string, texto: string) => registrarMensagemCliente({ numero, texto, origem: "whatsapp", idExterno: `${numero}-${texto}` });

test("o nome é normalizado e o que não serve é recusado com frase de negócio", () => {
  assert.equal(normalizarEtiqueta("  Orçamento  "), "orçamento", "espaço nas pontas e maiúscula não criam outra etiqueta");
  assert.equal(normalizarEtiqueta("Cliente   VIP"), "cliente vip", "espaço dobrado vira um só");
  assert.equal(erroDeEtiqueta("orçamento"), null);
  assert.match(String(erroDeEtiqueta("")), /Escreva o nome/);
  assert.match(String(erroDeEtiqueta("preço, prazo")), /vírgula/, "vírgula quebraria a coluna da planilha");
  assert.match(String(erroDeEtiqueta("x".repeat(40))), /caber em/);
  // As cores são distribuídas na ordem e voltam ao começo depois da sexta.
  assert.equal(proximaCor(0), "azul");
  assert.equal(proximaCor(6), "azul");
});

test("etiquetar cria a etiqueta na conta, grava na conversa e não joga a conversa para o topo", async () => {
  const numero = "5511900000601";
  escrever(numero, "Quanto fica o clareamento?");
  const antes = obterRegistro(numero)!;

  const r = await etiquetar(numero, ["Orçamento", "orçamento", "VIP"]);
  assert.equal(r.status, 200);
  const { conversa } = (await r.json()) as { conversa: { etiquetas: string[] } };
  assert.deepEqual(conversa.etiquetas, ["orçamento", "vip"], "o nome é normalizado e o repetido sai");

  const daConta = etiquetasDaEmpresa();
  assert.deepEqual(daConta.map((e) => e.nome), ["orçamento", "vip"], "as duas nasceram na lista da conta");
  assert.deepEqual(daConta.map((e) => e.cor), ["azul", "verde"], "cada uma recebe a cor seguinte da paleta");

  const depois = obterRegistro(numero)!;
  assert.equal(depois.atualizadoEm, antes.atualizadoEm, "etiquetar não é novidade na conversa");
  apagarConversa(numero);
});

test("a sexta etiqueta é recusada com a frase do limite, e a conversa fica como estava", async () => {
  const numero = "5511900000602";
  escrever(numero, "Bom dia!");
  const cinco = ["a1", "a2", "a3", "a4", "a5"];
  assert.equal((await etiquetar(numero, cinco)).status, 200);

  const r = await etiquetar(numero, [...cinco, "a6"]);
  assert.equal(r.status, 400);
  const { error } = (await r.json()) as { error: string };
  assert.match(error, new RegExp(`Até ${MAX_ETIQUETAS_POR_CONVERSA} etiquetas`));
  assert.deepEqual(obterRegistro(numero)!.etiquetas, cinco, "nada mudou na conversa");

  // Corpo sem a lista é erro de pedido, não uma conversa sem etiqueta nenhuma.
  const semLista = await putEtiquetas(new Request("http://app/x", { method: "PUT", body: "{}" }), params(numero));
  assert.equal(semLista.status, 400);
  assert.deepEqual(obterRegistro(numero)!.etiquetas, cinco);
  apagarConversa(numero);
});

test("a lista filtra por etiqueta, e os contadores das abas contam o que sobrou", async () => {
  const comEtiqueta = "5511900000603";
  const sem = "5511900000604";
  escrever(comEtiqueta, "Queria um orçamento de implante");
  escrever(sem, "Vocês abrem no sábado?");
  await etiquetar(comEtiqueta, ["orçamento"]);

  const r = await getConversas(new Request("http://app/api/conversas?periodo=tudo&etiqueta=Orçamento"));
  const dados = (await r.json()) as { itens: { numero: string }[]; contadores: { todas: number } };
  assert.deepEqual(dados.itens.map((c) => c.numero), [comEtiqueta], "o filtro vale mesmo com outra caixa no endereço");
  assert.equal(dados.contadores.todas, 1, "as abas contam dentro do filtro de etiqueta");

  const naPlanilha = linhasParaExportar("30d").find((l) => l.numero === comEtiqueta)!;
  assert.deepEqual(naPlanilha.etiquetas, ["orçamento"], "a planilha leva as etiquetas da conversa");
  apagarConversa(comEtiqueta);
  apagarConversa(sem);
});

test("apagar uma etiqueta a tira da conta e de todas as conversas, e diz de quantas saiu", async () => {
  const um = "5511900000605";
  const dois = "5511900000606";
  escrever(um, "Quero remarcar");
  escrever(dois, "Também quero remarcar");
  await etiquetar(um, ["retorno", "urgente"]);
  await etiquetar(dois, ["retorno"]);

  const antes = (await (await getEtiquetas()).json()) as { itens: { nome: string; usos: number }[] };
  assert.equal(antes.itens.find((e) => e.nome === "retorno")!.usos, 2, "a contagem é o que o diálogo mostra antes de apagar");

  const r = await deleteEtiqueta(new Request("http://app/x", { method: "DELETE" }), { params: Promise.resolve({ nome: encodeURIComponent("retorno") }) });
  const dados = (await r.json()) as { itens: { nome: string }[]; conversas: number };
  assert.equal(dados.conversas, 2);
  assert.equal(dados.itens.some((e) => e.nome === "retorno"), false, "saiu da lista da conta");
  assert.deepEqual(obterRegistro(um)!.etiquetas, ["urgente"], "as outras etiquetas da conversa ficam");
  assert.deepEqual(obterRegistro(dois)!.etiquetas, []);
  assert.equal(listarConversas({ etiqueta: "retorno" }).length, 0);
  apagarConversa(um);
  apagarConversa(dois);
});

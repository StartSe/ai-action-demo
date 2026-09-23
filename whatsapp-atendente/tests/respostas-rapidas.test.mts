// Respostas rápidas (0.3.0, US-015): as frases de sempre, chamadas por um atalho. O que está em teste
// é o SERVIDOR — normalizar e recusar atalho, não repetir, gravar, corrigir e apagar pelas rotas — mais
// as regras puras de lib/atalhos.ts (variáveis e filtro), que a tela usa sem passar pelo banco.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-rapidas-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { aplicarVariaveis, erroDeAtalho, filtrarRespostas, normalizarAtalho } = await import("../lib/atalhos");
const { listarRespostasRapidas, sincronizarRespostasRapidasDeExemplo } = await import("../lib/respostas-rapidas");
const { GET: listar, POST: criar } = await import("../app/api/respostas-rapidas/route");
const { PUT: corrigir, DELETE: apagar } = await import("../app/api/respostas-rapidas/[id]/route");
const { respostasRapidasExemplo } = await import("../lib/demo");
import type { RespostaRapida } from "../lib/types";

after(() => rmSync(pasta, { recursive: true, force: true }));

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const corpo = (atalho: string, texto: string) =>
  new Request("http://app/api/respostas-rapidas", { method: "POST", body: JSON.stringify({ atalho, texto }) });

async function criarRapida(atalho: string, texto: string) {
  const r = await criar(corpo(atalho, texto));
  return { status: r.status, dados: (await r.json()) as { item?: RespostaRapida; itens?: RespostaRapida[]; error?: string } };
}

test("o atalho é normalizado: a barra, o acento, o espaço e a maiúscula saem antes de gravar", async () => {
  assert.equal(normalizarAtalho("/Horário de Atendimento"), "horario-de-atendimento");
  assert.equal(normalizarAtalho("  ENDEREÇO  "), "endereco");

  const { status, dados } = await criarRapida("/Atendimento", "Atendemos das 8h às 18h.");
  assert.equal(status, 200);
  assert.equal(dados.item!.atalho, "atendimento");
  assert.equal(dados.itens!.length, 1, "a rota devolve a lista inteira já atualizada");
});

test("atalho curto, com caractere que não vale e repetido são recusados com frase de negócio", async () => {
  assert.equal(erroDeAtalho("a"), "O atalho precisa ter pelo menos 2 letras.");
  assert.match(erroDeAtalho("com espaço")!, /letras, números e hífen/);
  assert.equal(erroDeAtalho("horario-do-sabado"), null);

  const curto = await criarRapida("a", "Texto qualquer.");
  assert.equal(curto.status, 400);
  assert.match(curto.dados.error!, /pelo menos/);

  const repetido = await criarRapida("atendimento", "Outro texto para o mesmo atalho.");
  assert.equal(repetido.status, 400);
  assert.match(repetido.dados.error!, /Já existe uma resposta rápida com o atalho "atendimento"/);

  const semTexto = await criarRapida("vazio", "   ");
  assert.equal(semTexto.status, 400);

  const gigante = await criarRapida("gigante", "x".repeat(1001));
  assert.equal(gigante.status, 400);
  assert.match(gigante.dados.error!, /1\.000 caracteres/);

  assert.equal(listarRespostasRapidas().length, 1, "nenhuma das recusadas foi gravada");
});

test("corrigir troca atalho e texto; apagar tira da lista; as duas devolvem a lista atualizada", async () => {
  const { dados } = await criarRapida("obrigado", "Obrigada pelo contato!");
  const id = dados.item!.id;

  const rCorrige = await corrigir(corpo("agradecimento", "Obrigada pelo contato, {nome}!"), params(id));
  assert.equal(rCorrige.status, 200);
  const corrigida = (await rCorrige.json()) as { item: RespostaRapida; itens: RespostaRapida[] };
  assert.equal(corrigida.item.atalho, "agradecimento");
  assert.equal(corrigida.itens.length, 2);

  // O atalho que já existe em OUTRA resposta continua recusado; o da própria, não.
  const colide = await corrigir(corpo("atendimento", "Texto novo."), params(id));
  assert.equal(colide.status, 400);
  const mesmo = await corrigir(corpo("agradecimento", "Obrigada mesmo, {nome}!"), params(id));
  assert.equal(mesmo.status, 200);

  const rApaga = await apagar(new Request("http://app/x", { method: "DELETE" }), params(id));
  assert.equal(rApaga.status, 200);
  const { itens } = (await rApaga.json()) as { itens: RespostaRapida[] };
  assert.equal(itens.length, 1);

  const denovo = await apagar(new Request("http://app/x", { method: "DELETE" }), params(id));
  assert.equal(denovo.status, 404, "apagar duas vezes não estoura: a segunda diz que sumiu");
});

test("as variáveis são trocadas na inserção, e sem nome o cliente vira \"você\"", () => {
  const frase = "Oi, {nome}! Qualquer dúvida é só chamar. — {atendente}";
  assert.equal(aplicarVariaveis(frase, { nome: "Mariana", atendente: "Bia" }), "Oi, Mariana! Qualquer dúvida é só chamar. — Bia");
  assert.equal(aplicarVariaveis(frase, { nome: "  ", atendente: "" }), "Oi, você! Qualquer dúvida é só chamar. — nosso atendimento");
});

test("o filtro do painel casa por atalho e por texto, sem acento e sem maiúscula", () => {
  const itens: RespostaRapida[] = [
    { id: 1, atalho: "horario", texto: "Atendemos das 8h às 18h.", criadoEm: "", exemplo: false },
    { id: 2, atalho: "endereco", texto: "Rua das Flores, 120.", criadoEm: "", exemplo: false },
  ];
  assert.deepEqual(filtrarRespostas(itens, "").length, 2);
  assert.deepEqual(filtrarRespostas(itens, "HORÁ").map((r) => r.id), [1]);
  assert.deepEqual(filtrarRespostas(itens, "flores").map((r) => r.id), [2], "o texto também é procurado, não só o atalho");
  assert.deepEqual(filtrarRespostas(itens, "zzz").length, 0);
});

test("as respostas de demonstração nascem e somem com as conversas de exemplo, sem levar as da equipe", async () => {
  sincronizarRespostasRapidasDeExemplo(true);
  const comExemplos = listarRespostasRapidas();
  for (const r of respostasRapidasExemplo()) {
    assert.ok(comExemplos.some((x) => x.atalho === r.atalho && x.exemplo), `a resposta de exemplo /${r.atalho} nasceu`);
  }
  // Semear duas vezes não duplica nada, e uma de demonstração apagada à mão não volta.
  sincronizarRespostasRapidasDeExemplo(true);
  assert.equal(listarRespostasRapidas().length, comExemplos.length);
  const umaDeExemplo = listarRespostasRapidas().find((r) => r.exemplo)!;
  await apagar(new Request("http://app/x", { method: "DELETE" }), params(umaDeExemplo.id));
  sincronizarRespostasRapidasDeExemplo(true);
  assert.equal(listarRespostasRapidas().some((r) => r.id === umaDeExemplo.id || r.atalho === umaDeExemplo.atalho), false, "a apagada não renasce");

  // Um atalho que a equipe escreveu com o mesmo nome de um de demonstração continua sendo dela: a
  // demonstração não o cria por cima e, ao sumir, não o leva junto.
  sincronizarRespostasRapidasDeExemplo(false);
  const daEquipe = await criarRapida("endereco", "Rua das Flores, 120 — texto da equipe.");
  assert.equal(daEquipe.status, 200);
  sincronizarRespostasRapidasDeExemplo(true);
  assert.equal(listarRespostasRapidas().find((r) => r.atalho === "endereco")!.exemplo, false);

  sincronizarRespostasRapidasDeExemplo(false);
  const depois = listarRespostasRapidas();
  assert.equal(depois.filter((r) => r.exemplo).length, 0, "as de exemplo saíram");
  assert.ok(depois.some((r) => r.atalho === "atendimento"), "a que a equipe cadastrou continua aqui");
  assert.ok(depois.some((r) => r.atalho === "endereco"), "a da equipe com atalho de exemplo também");

  const r = await listar();
  const { itens } = (await r.json()) as { itens: RespostaRapida[] };
  assert.deepEqual(itens.map((x) => x.atalho), depois.map((x) => x.atalho));
});

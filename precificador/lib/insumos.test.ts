// Testes da persistência da ficha de insumos, contra um SQLite de verdade num diretório temporário.
//
// O caso que dá nome ao arquivo é o bug de "adicionar insumo troca de aba e volta": a tela cria a
// linha com um id próprio e sem nome, e nada disso pode fazer a linha sumir nem duplicar quando a
// gravação adiada chega ao banco.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "precificador-insumos-"));

const { criarItem, definirInsumos, listarInsumos } = await import("./itens");
const { salvarNegocio } = await import("./negocio");

const negocio = salvarNegocio({ nome: "Teste" });

function novoItem(nome: string) {
  return criarItem(negocio.id, { nome, tipo: "produto" });
}

/** Uma linha como a tela monta: id gerado no cliente. */
function daTela(id: string, nome: string) {
  return { id, nome, qtdUsada: 100, unidadeUso: "g", qtdCompra: 1, custoCompra: 10, unidadeCompra: "kg" };
}

test("linha com id vindo do cliente é inserida com esse id, não com outro", () => {
  const item = novoItem("Pão");
  const id = "11111111-2222-3333-4444-555555555555".replace(/-/g, "");
  definirInsumos(item.id, [daTela(id, "Farinha")]);
  const gravadas = listarInsumos(item.id);
  assert.equal(gravadas.length, 1);
  assert.equal(gravadas[0].id, id);
  assert.equal(gravadas[0].nome, "Farinha");
});

test("salvar duas vezes com o mesmo id atualiza, não duplica", () => {
  const item = novoItem("Bolo");
  const id = "aaaaaaaabbbbccccddddeeeeffff0000";
  definirInsumos(item.id, [daTela(id, "Açúcar")]);
  definirInsumos(item.id, [{ ...daTela(id, "Açúcar refinado"), custoCompra: 12 }]);
  const gravadas = listarInsumos(item.id);
  assert.equal(gravadas.length, 1);
  assert.equal(gravadas[0].nome, "Açúcar refinado");
  assert.equal(gravadas[0].custoCompra, 12);
});

// O bug relatado: a linha recém-adicionada não tem nome ainda.
test("linha sem nome não é persistida, e não apaga as que já existem", () => {
  const item = novoItem("Café");
  const jaExiste = "ccccccccddddeeeeffff000011112222";
  definirInsumos(item.id, [daTela(jaExiste, "Café em grão")]);

  // A tela acrescenta uma linha em branco e a gravação adiada dispara.
  definirInsumos(item.id, [daTela(jaExiste, "Café em grão"), daTela("99999999888877776666555544443333", "")]);

  const gravadas = listarInsumos(item.id);
  assert.equal(gravadas.length, 1, "a linha em branco não deve ser gravada");
  assert.equal(gravadas[0].nome, "Café em grão", "a linha que já existia não pode sumir");
});

test("nomear a linha depois grava ela com o mesmo id que a tela já usava", () => {
  const item = novoItem("Pizza");
  const id = "12345678abcdabcdabcdabcdabcd9999";
  definirInsumos(item.id, [daTela(id, "")]);
  assert.equal(listarInsumos(item.id).length, 0);

  definirInsumos(item.id, [daTela(id, "Muçarela")]);
  const gravadas = listarInsumos(item.id);
  assert.equal(gravadas.length, 1);
  assert.equal(gravadas[0].id, id, "o id da tela precisa sobreviver, senão a próxima edição duplica a linha");
});

test("linha removida na tela some do banco", () => {
  const item = novoItem("Torta");
  definirInsumos(item.id, [daTela("aaaa1111bbbb2222cccc3333dddd4444", "Ovo"), daTela("bbbb1111cccc2222dddd3333eeee4444", "Leite")]);
  assert.equal(listarInsumos(item.id).length, 2);

  definirInsumos(item.id, [daTela("aaaa1111bbbb2222cccc3333dddd4444", "Ovo")]);
  const gravadas = listarInsumos(item.id);
  assert.equal(gravadas.length, 1);
  assert.equal(gravadas[0].nome, "Ovo");
});

test("id fora do formato aceito não vira chave primária", () => {
  const item = novoItem("Suco");
  definirInsumos(item.id, [{ ...daTela("'; DROP TABLE linhas_insumo; --", "Laranja") }]);
  const gravadas = listarInsumos(item.id);
  assert.equal(gravadas.length, 1);
  assert.notEqual(gravadas[0].id, "'; DROP TABLE linhas_insumo; --");
  assert.match(gravadas[0].id, /^[A-Za-z0-9_-]+$/);
});

test("a ordem das linhas na tela é a ordem que volta do banco", () => {
  const item = novoItem("Sanduíche");
  const ids = ["aaaa0000aaaa0000aaaa0000aaaa0000", "bbbb0000bbbb0000bbbb0000bbbb0000", "cccc0000cccc0000cccc0000cccc0000"];
  definirInsumos(item.id, [daTela(ids[0], "Pão"), daTela(ids[1], "Queijo"), daTela(ids[2], "Presunto")]);
  assert.deepEqual(listarInsumos(item.id).map((l) => l.nome), ["Pão", "Queijo", "Presunto"]);

  definirInsumos(item.id, [daTela(ids[2], "Presunto"), daTela(ids[0], "Pão"), daTela(ids[1], "Queijo")]);
  assert.deepEqual(listarInsumos(item.id).map((l) => l.nome), ["Presunto", "Pão", "Queijo"]);
});

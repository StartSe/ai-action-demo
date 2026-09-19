import assert from "node:assert/strict";
import { test } from "node:test";
import { montarConsulta, LIMITE_CONSULTA } from "./consulta-candidato";

test("sugere nome com empresa e cargo do currículo", () => {
  assert.equal(montarConsulta({ nome: "Bruno Alves", ficha: { empresaAtual: { valor: "Órbita Software", origem: "cv" }, cargoAtual: { valor: "Engenheiro", origem: "cv" } } }), "Bruno Alves Órbita Software Engenheiro");
});
test("não usa informações da web para confirmar a própria busca", () => {
  assert.equal(montarConsulta({ nome: "Bruno Alves", ficha: { empresaAtual: { valor: "Outra pessoa", origem: "web" } } }), "Bruno Alves");
});
test("preserva consulta revisada e não duplica o nome nem a empresa", () => {
  const pessoa = { nome: "Bruno Alves", termoBusca: "Bruno Alves Órbita", ficha: { empresaAtual: { valor: "Empresa antiga", origem: "cv" as const } } };
  assert.equal(montarConsulta(pessoa), "Bruno Alves Órbita");
  assert.equal(montarConsulta({ nome: "Bruno Alves", termoBusca: "Órbita", ficha: { empresaAtual: { valor: "Órbita", origem: "cv" } } }), "Bruno Alves Órbita");
});
test("sem currículo sugere o nome e limita a consulta longa", () => {
  assert.equal(montarConsulta({ nome: "Ana Silva" }), "Ana Silva");
  assert.equal(montarConsulta({ nome: "Ana Silva", termoBusca: "a".repeat(300) }).length, LIMITE_CONSULTA);
});

test("tags sugeridas incluem LinkedIn, cidade e empresa, sem reutilizar campos da web", async () => {
  const { sugerirTermos } = await import("./consulta-candidato");
  assert.deepEqual(sugerirTermos({ nome: "Ana Silva", linkedinUrl: "https://linkedin.com/in/ana", cidade: "Recife", ficha: { empresaAtual: { valor: "Acme", origem: "cv" }, cidade: { valor: "São Paulo", origem: "web" } } }), [
    { tipo: "nome", valor: "Ana Silva" }, { tipo: "linkedin", valor: "https://linkedin.com/in/ana" }, { tipo: "cidade", valor: "Recife" }, { tipo: "empresa", valor: "Acme" },
  ]);
});
test("combina somente tags selecionadas e limita as tentativas", async () => {
  const { combinarTermos, validarTermos } = await import("./consulta-candidato");
  assert.deepEqual(combinarTermos([{ tipo: "nome", valor: "Ana Silva" }, { tipo: "empresa", valor: "Acme" }, { tipo: "cidade", valor: "Recife" }]), ["Ana Silva Acme Recife", "Ana Silva Acme", "Ana Silva Recife"]);
  assert.deepEqual(combinarTermos([{ tipo: "chave", valor: "Engenheira Recife" }]), ["Engenheira Recife"]);
  assert.equal(validarTermos([]), false);
  assert.equal(validarTermos([{ tipo: "linkedin", valor: "https://example.com/in/ana" }]), false);
  assert.equal(validarTermos([{ tipo: "chave", valor: "a".repeat(301) }]), false);
  assert.equal(validarTermos([{ tipo: "nome", valor: "Ana Silva" }]), true);
});

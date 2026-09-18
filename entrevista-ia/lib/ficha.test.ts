// As regras de mesclagem da ficha (D5), exercitadas fora do Next.
//
// Rodar:  node --import ./scripts/gancho-ts.mjs --test lib/ficha.test.ts
//
// Por que estas regras merecem teste de unidade e o resto do app não: elas decidem em silêncio o que
// o gestor vê sobre uma pessoa de verdade. Um erro aqui não quebra tela nenhuma — só troca o cargo
// atual de alguém por um cargo antigo achado na web, e ninguém descobre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mesclar, normalizarFicha, origensDaFicha, valorDaFicha } from "./ficha";
import type { Ficha } from "./types";

function doCv(): Ficha {
  return normalizarFicha(
    {
      resumo: "Quatro anos em contas B2B.",
      cargoAtual: "Analista de Customer Success",
      empresaAtual: "Órbita Software",
      anosExperiencia: 4,
      competencias: ["HubSpot", "Zendesk"],
      idiomas: ["Inglês intermediário"],
    },
    "cv",
    "fonte-cv",
  );
}

function daWeb(extra: Record<string, unknown> = {}): Ficha {
  return normalizarFicha({ cidade: "São Paulo (SP)", ...extra }, "web", "fonte-linkedin");
}

test("normalizarFicha carimba a origem e descarta o que veio em branco", () => {
  const ficha = normalizarFicha({ cargoAtual: "Analista", empresaAtual: null, cidade: "   ", competencias: ["", "HubSpot"] }, "cv", "fonte-cv");

  assert.deepEqual(ficha.cargoAtual, { valor: "Analista", origem: "cv", fonteId: "fonte-cv" });
  assert.equal(ficha.empresaAtual, undefined, "null do modelo não vira campo");
  assert.equal(ficha.cidade, undefined, "espaço em branco não vira campo");
  assert.deepEqual(ficha.competencias?.map((c) => c.valor), ["HubSpot"]);
});

test("a web só preenche o que o currículo não trouxe", () => {
  const ficha = mesclar(doCv(), daWeb(), "web");

  assert.equal(valorDaFicha(ficha, "cidade"), "São Paulo (SP)", "a cidade estava vazia: a web preenche");
  assert.equal(ficha.cidade?.origem, "web");
  assert.equal(valorDaFicha(ficha, "cargoAtual"), "Analista de Customer Success", "o currículo continua valendo");
  assert.equal(ficha.cargoAtual?.origem, "cv");
});

test("currículo e web em desacordo: fica o currículo e o conflito é registrado", () => {
  const ficha = mesclar(doCv(), daWeb({ cargoAtual: "Analista sênior de Customer Success" }), "web");

  assert.equal(valorDaFicha(ficha, "cargoAtual"), "Analista de Customer Success");
  assert.deepEqual(ficha.divergencias, [
    {
      campo: "cargoAtual",
      cv: "Analista de Customer Success",
      web: "Analista sênior de Customer Success",
      fonteId: "fonte-linkedin",
    },
  ]);
});

test("o currículo sobrescreve o que a web tinha preenchido, e a divergência vai junto", () => {
  const soWeb = mesclar(undefined, daWeb({ empresaAtual: "Nexo Serviços" }), "web");
  assert.equal(soWeb.empresaAtual?.origem, "web");

  const comCv = mesclar(soWeb, doCv(), "cv");
  assert.equal(valorDaFicha(comCv, "empresaAtual"), "Órbita Software");
  assert.equal(comCv.empresaAtual?.origem, "cv");
  assert.deepEqual(comCv.divergencias, [{ campo: "empresaAtual", cv: "Órbita Software", web: "Nexo Serviços", fonteId: "fonte-linkedin" }]);
});

test("mesma informação escrita diferente não é divergência", () => {
  const ficha = mesclar(doCv(), daWeb({ empresaAtual: "orbita software" }), "web");
  assert.equal(ficha.divergencias, undefined);
});

test("o que o gestor digitou não é sobrescrito por currículo nem por pesquisa", () => {
  const doGestor = mesclar(doCv(), normalizarFicha({ cargoAtual: "Gerente de Customer Success" }, "gestor"), "gestor");
  assert.equal(doGestor.cargoAtual?.origem, "gestor");

  const depoisDaWeb = mesclar(doGestor, daWeb({ cargoAtual: "Analista sênior" }), "web");
  assert.equal(valorDaFicha(depoisDaWeb, "cargoAtual"), "Gerente de Customer Success");

  const depoisDeOutroCv = mesclar(depoisDaWeb, doCv(), "cv");
  assert.equal(valorDaFicha(depoisDeOutroCv, "cargoAtual"), "Gerente de Customer Success");
  assert.equal(depoisDeOutroCv.cargoAtual?.origem, "gestor");
});

test("a escolha do gestor resolve a divergência daquele campo e deixa as outras de pé", () => {
  const comConflitos = mesclar(doCv(), daWeb({ cargoAtual: "Analista sênior", empresaAtual: "Nexo Serviços" }), "web");
  assert.equal(comConflitos.divergencias?.length, 2);

  const resolvido = mesclar(comConflitos, normalizarFicha({ cargoAtual: "Analista sênior" }, "gestor"), "gestor");
  assert.deepEqual(resolvido.divergencias?.map((d) => d.campo), ["empresaAtual"]);
});

test("uma ficha nova vazia não apaga nada", () => {
  const ficha = mesclar(doCv(), normalizarFicha({}, "web"), "web");

  assert.equal(valorDaFicha(ficha, "cargoAtual"), "Analista de Customer Success");
  assert.deepEqual(ficha.competencias?.map((c) => c.valor), ["HubSpot", "Zendesk"]);
});

test("ler o currículo de novo substitui o que o currículo dizia, sem empilhar", () => {
  const comWeb = mesclar(doCv(), daWeb({ competencias: ["Acompanhamento de carteira"] }), "web");
  assert.equal(comWeb.competencias?.length, 3);

  const relido = mesclar(comWeb, normalizarFicha({ competencias: ["HubSpot", "Looker"] }, "cv", "fonte-cv"), "cv");
  assert.deepEqual(relido.competencias?.map((c) => c.valor), ["HubSpot", "Looker", "Acompanhamento de carteira"]);
  assert.deepEqual(
    relido.competencias?.map((c) => c.origem),
    ["cv", "cv", "web"],
    "as competências do currículo vêm antes das da web",
  );
});

test("um item que o currículo e a web trazem igual fica com a origem do currículo", () => {
  const ficha = mesclar(doCv(), daWeb({ competencias: ["hubspot"] }), "web");

  assert.deepEqual(ficha.competencias?.map((c) => c.valor), ["HubSpot", "Zendesk"]);
  assert.deepEqual(ficha.competencias?.map((c) => c.origem), ["cv", "cv"]);
});

test("a lista editada pelo gestor é a lista inteira: o que ele tirou some", () => {
  const ficha = mesclar(doCv(), normalizarFicha({ competencias: ["HubSpot"] }, "gestor"), "gestor");
  assert.deepEqual(ficha.competencias?.map((c) => c.valor), ["HubSpot"]);
});

test("as experiências são comparadas por cargo, empresa e período", () => {
  const cv = normalizarFicha(
    { experiencias: [{ empresa: "Órbita Software", cargo: "Analista de CS", inicio: "2021", fim: "atual", descricao: "38 contas." }] },
    "cv",
    "fonte-cv",
  );
  const web = normalizarFicha(
    {
      experiencias: [
        { empresa: "Órbita Software", cargo: "Analista de CS", inicio: "2021", fim: "atual" },
        { empresa: "Grupo Vela", cargo: "Analista de suporte", inicio: "2019", fim: "2021" },
      ],
    },
    "web",
    "fonte-linkedin",
  );

  const ficha = mesclar(cv, web, "web");
  assert.equal(ficha.experiencias?.length, 2, "a repetida não entra duas vezes");
  assert.equal(ficha.experiencias?.[0].origem, "cv");
  assert.equal(ficha.experiencias?.[0].valor.descricao, "38 contas.", "a versão do currículo é a que fica");
  assert.equal(ficha.experiencias?.[1].valor.empresa, "Grupo Vela");
});

test("origensDaFicha devolve os chips na ordem da D5", () => {
  assert.deepEqual(origensDaFicha(doCv()), ["cv"]);
  assert.deepEqual(origensDaFicha(mesclar(doCv(), daWeb(), "web")), ["cv", "web"]);
  assert.deepEqual(
    origensDaFicha(mesclar(mesclar(doCv(), daWeb(), "web"), normalizarFicha({ resumo: "Escrito por mim." }, "gestor"), "gestor")),
    ["gestor", "cv", "web"],
  );
  assert.deepEqual(origensDaFicha(undefined), []);
});

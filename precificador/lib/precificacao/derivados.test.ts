import assert from "node:assert/strict";
import { test } from "node:test";
import { precificar } from "./index";
import { calcularCorredor } from "./corredor";
import { calcularDerivados } from "./derivados";
import { canal, fixo, insumo, item, negocio, reais } from "./cenarios-de-teste";

/** Padaria: custo direto 4,80, rateio 1,00, custo total 5,80, imposto 6%. */
function padaria(ajusteCanal = {}) {
  return {
    negocio: negocio({ volumeMensalUnidades: 1000, impostoProdutoPct: 0.06, margemAlvoPadraoPct: 0.2 }),
    custosFixos: [fixo("Aluguel", 1000, "produto")],
    item: item(),
    insumos: [insumo()],
    canal: canal(ajusteCanal),
  };
}

test("lucro, margem real e markup a um preço escolhido", () => {
  const { derivados } = precificar(padaria(), 10);
  // 10 − 0,60 (imposto) − 5,80 (custo) = 3,60
  assert.equal(reais(derivados.taxas), 0.6);
  assert.equal(reais(derivados.lucro), 3.6);
  assert.equal(reais(derivados.margemLiquidaPct), 0.36);
  assert.equal(reais(derivados.markup), 1.72); // 10 / 5,80
});

test("margem de contribuição deixa o custo fixo de fora", () => {
  const { derivados } = precificar(padaria(), 10);
  // 10 − 0,60 − 4,80 (só o direto) = 4,60
  assert.equal(reais(derivados.margemContribuicao), 4.6);
});

test("ponto de equilíbrio é o balde de fixos dividido pela contribuição", () => {
  const { derivados } = precificar(padaria(), 10);
  assert.equal(Math.ceil(derivados.pontoEquilibrio!), 218); // 1000 / 4,60 = 217,4
});

test("contribuição negativa não devolve um ponto de equilíbrio falso", () => {
  const { derivados } = precificar(padaria(), 2);
  assert.equal(derivados.pontoEquilibrio, null);
});

test("desconto máximo é a distância até o preço de lucro zero", () => {
  const { corredor, derivados } = precificar(padaria(), 10);
  assert.equal(reais(corredor.pisoPrejuizo), 6.17);
  assert.equal(reais(derivados.descontoMaximoPct), 0.38); // (10 − 6,17) / 10
});

test("no prejuízo, o desconto máximo é zero em vez de negativo", () => {
  const { derivados } = precificar(padaria(), 5);
  assert.equal(derivados.descontoMaximoPct, 0);
  assert.ok(derivados.lucro < 0);
});

test("exatamente no preço de lucro zero, o lucro é zero e o desconto também", () => {
  const corredor = calcularCorredor(padaria());
  const derivados = calcularDerivados(corredor, corredor.pisoPrejuizo);
  assert.equal(reais(derivados.lucro), 0);
  assert.equal(reais(derivados.descontoMaximoPct), 0);
});

test("no piso da margem-alvo, a margem líquida real é exatamente a margem-alvo", () => {
  const corredor = calcularCorredor(padaria());
  const derivados = calcularDerivados(corredor, corredor.pisoMargemAlvo!);
  assert.equal(reais(derivados.margemLiquidaPct), 0.2);
  assert.equal(derivados.estado, "saudavel");
});

// Critério de aceite E2 do PRD.
test("o mesmo item em três canais dá três margens diferentes e corretas para o mesmo preço", () => {
  const preco = 12;
  const loja = precificar(padaria({ nome: "Loja", taxaPct: 0 }), preco).derivados;
  const maquininha = precificar(padaria({ nome: "Maquininha", taxaPct: 0.035, taxaFixa: 0.39 }), preco).derivados;
  const marketplace = precificar(padaria({ nome: "Marketplace", taxaPct: 0.16 }), preco).derivados;

  // Loja: 12 − 0,72 − 5,80 = 5,48
  assert.equal(reais(loja.lucro), 5.48);
  // Maquininha: 12 − (0,06+0,035)×12 = 12 − 1,14 → −0,39 → −5,80 = 4,67
  assert.equal(reais(maquininha.lucro), 4.67);
  // Marketplace: 12 − (0,06+0,16)×12 = 12 − 2,64 − 5,80 = 3,56
  assert.equal(reais(marketplace.lucro), 3.56);

  const margens = [loja, maquininha, marketplace].map((d) => reais(d.margemLiquidaPct));
  assert.deepEqual(margens, [0.46, 0.39, 0.3]);
  assert.equal(new Set(margens).size, 3);
});

test("a taxa fixa do canal pesa mais no item barato que no caro", () => {
  const barato = precificar(padaria({ taxaFixa: 0.39 }), 5).derivados;
  const caro = precificar(padaria({ taxaFixa: 0.39 }), 50).derivados;
  const pesoBarato = barato.taxaFixa / barato.preco;
  const pesoCaro = caro.taxaFixa / caro.preco;
  assert.ok(pesoBarato > pesoCaro * 5);
});

test("preço zero não divide por zero em nenhum derivado", () => {
  const { derivados } = precificar(padaria(), 0);
  assert.equal(derivados.margemLiquidaPct, 0);
  assert.equal(derivados.descontoMaximoPct, 0);
  assert.ok(Number.isFinite(derivados.lucro));
});

test("a cascata soma o preço inteiro quando há lucro", () => {
  const { cascata } = precificar(padaria(), 10);
  const soma = cascata.fatias.reduce((s, f) => s + f.valor, 0);
  assert.equal(reais(soma), 10);
  assert.equal(cascata.prejuizo, false);
  assert.deepEqual(cascata.fatias.map((f) => f.chave), ["imposto", "canal", "direto", "rateio", "lucro"]);
});

test("a cascata marca prejuízo e as frações ainda somam 1", () => {
  const { cascata } = precificar(padaria(), 4);
  assert.equal(cascata.prejuizo, true);
  const soma = cascata.fatias.reduce((s, f) => s + f.fracao, 0);
  assert.equal(reais(soma), 1);
});

test("a taxa do canal aparece separada do imposto na cascata", () => {
  const { cascata } = precificar(padaria({ taxaPct: 0.16, taxaFixa: 0.5 }), 20);
  const imposto = cascata.fatias.find((f) => f.chave === "imposto")!;
  const canalFatia = cascata.fatias.find((f) => f.chave === "canal")!;
  assert.equal(reais(imposto.valor), 1.2); // 6% de 20
  assert.equal(reais(canalFatia.valor), 3.7); // 16% de 20 + 0,50
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularCorredor, estadoDoPreco, PrecoImpossivelError, precoDaMargem, precoLucroZero, precoSugerido } from "./corredor";
import { faixaDeMercado } from "./mercado";
import { canal, fixo, insumo, item, negocio, reais } from "./cenarios-de-teste";

const semFixos = { custosFixos: [] as ReturnType<typeof fixo>[] };

test("markup divisor: custo 50, taxa total 10%, margem 20% dá preço 71,43", () => {
  // 50 / (1 − 0,30) = 71,4285…
  assert.equal(reais(precoDaMargem(50, 0, 0.1, 0.2)), 71.43);
});

test("preço de lucro zero cobre o custo mais o que sai em imposto e taxa", () => {
  // 50 / (1 − 0,10) = 55,5555…
  assert.equal(reais(precoLucroZero(50, 0, 0.1)), 55.56);
  // com taxa fixa de R$ 0,39 por transação
  assert.equal(reais(precoLucroZero(50, 0.39, 0.1)), 55.99);
});

test("margem que não cabe na taxa total vira PrecoImpossivelError com a margem máxima", () => {
  assert.throws(() => precoDaMargem(10, 0, 0.7, 0.35), PrecoImpossivelError);
  try {
    precoDaMargem(10, 0, 0.7, 0.35);
  } catch (err) {
    const e = err as PrecoImpossivelError;
    assert.equal(reais(e.margemMaximaPct), 0.3);
    assert.match(e.message, /não cabe no preço/);
  }
});

test("o corredor não quebra quando a margem não cabe: devolve impossivel e mantém o piso", () => {
  const corredor = calcularCorredor({
    negocio: negocio({ impostoProdutoPct: 0.06, margemAlvoPadraoPct: 0.75, volumeMensalUnidades: 1000 }),
    custosFixos: [fixo("Aluguel", 1000)],
    item: item(),
    insumos: [insumo()],
    canal: canal({ taxaPct: 0.27 }),
  });
  assert.equal(corredor.pisoMargemAlvo, null);
  assert.ok(corredor.impossivel instanceof PrecoImpossivelError);
  assert.ok(corredor.pisoPrejuizo > 0);
  assert.equal(precoSugerido(corredor), corredor.pisoPrejuizo);
});

test("os quatro marcadores saem de uma chamada só", () => {
  const corredor = calcularCorredor({
    negocio: negocio({ volumeMensalUnidades: 1000, impostoProdutoPct: 0.06, margemAlvoPadraoPct: 0.2 }),
    custosFixos: [fixo("Aluguel", 1000)],
    item: item({ precosConcorrentes: [12, 18], precoValorTeto: 25 }),
    insumos: [insumo()],
    canal: canal(),
  });
  // custo total = 4,80 (insumo) + 1,00 (rateio) = 5,80
  assert.equal(reais(corredor.custo.total), 5.8);
  assert.equal(reais(corredor.pisoPrejuizo), 6.17); // 5,80 / 0,94
  assert.equal(reais(corredor.pisoMargemAlvo!), 7.84); // 5,80 / 0,74
  assert.deepEqual(corredor.mercado, { min: 12, max: 18, quantidade: 2 });
  assert.equal(corredor.tetoValor, 25);
});

test("sem concorrente cadastrado, a faixa de mercado some do corredor", () => {
  const corredor = calcularCorredor({ negocio: negocio(), ...semFixos, item: item(), insumos: [insumo()], canal: canal() });
  assert.equal(corredor.mercado, null);
  assert.equal(corredor.tetoValor, null);
});

test("um único preço de concorrente vira um ponto com tolerância de 5% para cada lado", () => {
  assert.deepEqual(faixaDeMercado({ precosConcorrentes: [20] }), { min: 19, max: 21, quantidade: 1 });
});

test("preço de concorrente inválido é descartado antes de formar a faixa", () => {
  assert.deepEqual(faixaDeMercado({ precosConcorrentes: [0, -5, 30, Number.NaN] }), { min: 28.5, max: 31.5, quantidade: 1 });
  assert.equal(faixaDeMercado({ precosConcorrentes: [] }), null);
});

// Critério de aceite E6 do PRD.
test("preço de mercado abaixo do custo total cai no degrau de prejuízo", () => {
  const corredor = calcularCorredor({
    negocio: negocio({ volumeMensalUnidades: 1000 }),
    custosFixos: [fixo("Aluguel", 5000)],
    item: item({ precosConcorrentes: [4] }),
    insumos: [insumo()],
    canal: canal(),
  });
  // custo total = 4,80 + 5,00 = 9,80; o mercado cobra 4,00
  assert.ok(corredor.mercado!.max < corredor.custo.total);
  assert.equal(estadoDoPreco(corredor, corredor.mercado!.max), "prejuizo");
});

test("a escala de estado tem os quatro degraus nas fronteiras certas", () => {
  const corredor = calcularCorredor({
    negocio: negocio({ volumeMensalUnidades: 1000, impostoProdutoPct: 0, margemAlvoPadraoPct: 0.2 }),
    custosFixos: [fixo("Aluguel", 1000)],
    item: item({ precoValorTeto: 20 }),
    insumos: [insumo()],
    canal: canal(),
  });
  // custo total 5,80; piso de prejuízo 5,80; piso da margem-alvo 7,25; teto 20
  assert.equal(estadoDoPreco(corredor, 5), "prejuizo");
  assert.equal(estadoDoPreco(corredor, 6.5), "abaixo-do-alvo");
  assert.equal(estadoDoPreco(corredor, 10), "saudavel");
  assert.equal(estadoDoPreco(corredor, 25), "acima-do-teto");
});

test("a régua abre com folga em volta dos marcadores que existem", () => {
  const corredor = calcularCorredor({
    negocio: negocio({ volumeMensalUnidades: 1000 }),
    custosFixos: [fixo("Aluguel", 1000)],
    item: item({ precoValorTeto: 20 }),
    insumos: [insumo()],
    canal: canal(),
  });
  assert.ok(corredor.escala.min < corredor.pisoPrejuizo);
  assert.ok(corredor.escala.max > 20);
});

test("MEI não paga percentual: o DAS entra como custo fixo e a alíquota fica zerada", () => {
  const comum = { item: item(), insumos: [insumo()], canal: canal() };
  const mei = calcularCorredor({
    negocio: negocio({ regime: "mei", impostoProdutoPct: 0.06, volumeMensalUnidades: 1000, margemAlvoPadraoPct: 0 }),
    custosFixos: [fixo("DAS do MEI", 76)],
    ...comum,
  });
  assert.equal(mei.taxaTotalPct, 0);
  // custo total = 4,80 + 76/1000 = 4,876; sem imposto, o piso é o próprio custo
  assert.equal(reais(mei.pisoPrejuizo), 4.88);
});

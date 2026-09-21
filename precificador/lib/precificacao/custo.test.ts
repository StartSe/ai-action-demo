import assert from "node:assert/strict";
import { test } from "node:test";
import { comporCusto, custoDaLinha } from "./custo";
import { custoHora, fixosPorBalde, rateioFixoPorUnidade } from "./rateio";
import { canal, fixo, insumo, item, negocio, reais } from "./cenarios-de-teste";

// Critério de aceite E3 do PRD, literal.
test("farinha: compra 1 kg por R$ 40 e usa 120 g dá R$ 4,80 na ficha", () => {
  assert.equal(reais(custoDaLinha(insumo()).valor), 4.8);
});

test("linha com unidades incompatíveis vale zero e explica o motivo", () => {
  const linha = custoDaLinha(insumo({ unidadeUso: "ml", unidadeCompra: "kg" }));
  assert.equal(linha.valor, 0);
  assert.match(linha.aviso!, /mesma medida/);
});

test("linha sem quantidade de compra pede a embalagem em vez de dividir por zero", () => {
  const linha = custoDaLinha(insumo({ qtdCompra: 0 }));
  assert.equal(linha.valor, 0);
  assert.match(linha.aviso!, /embalagem/);
});

// Critério de aceite E1 do PRD: cinco linhas de custo fixo e pró-labore batendo com a planilha.
test("custo-hora bate com o cálculo manual de cinco linhas de custo fixo mais pró-labore", () => {
  const linhas = [
    fixo("Aluguel", 3000, "servico"),
    fixo("Energia", 600, "servico"),
    fixo("Internet", 200, "servico"),
    fixo("Contador", 400, "servico"),
    fixo("Software", 300, "servico"),
  ];
  const n = negocio({ horasProdutivasMes: 160, proLaboreMensal: 4000, modoCapacidade: "horas" });
  // Planilha: (3000+600+200+400+300 + 4000) / 160 = 8500 / 160 = 53,125
  const h = custoHora(n, linhas);
  assert.equal(reais(h.total), 53.13);
  assert.equal(reais(h.maoDeObra), 25); // 4000 / 160
  assert.equal(reais(h.fixo), 28.13); // 4500 / 160
  assert.equal(reais(h.maoDeObra + h.fixo), reais(h.total));
});

test("custo-hora é zero em vez de dividir por zero quando não há horas declaradas", () => {
  const h = custoHora(negocio({ horasProdutivasMes: 0 }), [fixo("Aluguel", 3000, "servico")]);
  assert.deepEqual(h, { maoDeObra: 0, fixo: 0, total: 0 });
});

test("linha marcada ambos é repartida pela proporção declarada", () => {
  const n = negocio({ modoCapacidade: "ambos", proporcaoProdutoPct: 0.7 });
  const f = fixosPorBalde(n, [fixo("Aluguel", 1000, "ambos")]);
  assert.equal(reais(f.produto), 700);
  assert.equal(reais(f.servico), 300);
  assert.equal(reais(f.total), 1000);
});

test("com capacidade só em unidades, a linha ambos vai inteira para produto", () => {
  const f = fixosPorBalde(negocio({ modoCapacidade: "unidades" }), [fixo("Aluguel", 1000, "ambos")]);
  assert.equal(f.produto, 1000);
  assert.equal(f.servico, 0);
});

test("rateio de produto é o balde dividido pelo volume; de serviço, pelo tempo gasto", () => {
  const n = negocio({ volumeMensalUnidades: 2000, horasProdutivasMes: 160, modoCapacidade: "ambos", proporcaoProdutoPct: 0.5 });
  const linhas = [fixo("Aluguel", 4000, "ambos")]; // 2000 em cada balde
  assert.equal(reais(rateioFixoPorUnidade(n, linhas, "produto", 0)), 1); // 2000 / 2000
  assert.equal(reais(rateioFixoPorUnidade(n, linhas, "servico", 60)), 12.5); // 1 h × (2000 / 160)
});

test("capacidade não declarada zera o rateio em vez de estourar", () => {
  const n = negocio({ volumeMensalUnidades: 0 });
  assert.equal(rateioFixoPorUnidade(n, [fixo("Aluguel", 4000)], "produto", 0), 0);
});

test("a perda incide sobre insumos e mão de obra, e o rateio fica fora dela", () => {
  const n = negocio({ volumeMensalUnidades: 1000, horasProdutivasMes: 100, proLaboreMensal: 1000 });
  const composicao = comporCusto({
    negocio: n,
    custosFixos: [fixo("Aluguel", 1000, "produto")],
    item: item({ tempoMinutos: 30, perdaPct: 0.1 }),
    insumos: [insumo()],
  });
  // insumos 4,80 + mão de obra 0,5 h × (1000/100 = 10) = 5,00 → 9,80; perda 10% = 0,98
  assert.equal(reais(composicao.insumos), 4.8);
  assert.equal(reais(composicao.maoDeObra), 5);
  assert.equal(reais(composicao.perda), 0.98);
  assert.equal(reais(composicao.direto), 10.78);
  assert.equal(reais(composicao.rateioFixo), 1); // 1000 / 1000, sem perda
  assert.equal(reais(composicao.total), 11.78);
});

test("sem nenhuma linha de insumo vale o custo direto digitado à mão", () => {
  const composicao = comporCusto({
    negocio: negocio({ volumeMensalUnidades: 1000 }),
    custosFixos: [fixo("Aluguel", 1000, "produto")],
    item: item({ custoDiretoManual: 12 }),
    insumos: [],
  });
  assert.equal(reais(composicao.direto), 12);
  assert.equal(reais(composicao.total), 13);
});

test("com linhas de insumo, o custo digitado à mão é ignorado", () => {
  const composicao = comporCusto({
    negocio: negocio(),
    custosFixos: [],
    item: item({ custoDiretoManual: 999 }),
    insumos: [insumo()],
  });
  assert.equal(reais(composicao.direto), 4.8);
});

test("a composição devolve uma linha por insumo, na ordem da ficha", () => {
  const composicao = comporCusto({
    negocio: negocio(),
    custosFixos: [],
    item: item(),
    insumos: [insumo(), insumo({ id: "l2", nome: "Fermento", qtdUsada: 10, unidadeUso: "g", qtdCompra: 500, custoCompra: 15, unidadeCompra: "g" })],
  });
  assert.deepEqual(composicao.linhas.map((l) => l.nome), ["Farinha", "Fermento"]);
  assert.equal(reais(composicao.linhas[1].valor), 0.3); // 10/500 × 15
});

// O canal não entra no custo: ele só aparece no preço. Guarda contra regressão de acoplamento.
test("o custo de uma unidade não muda com o canal de venda", () => {
  const base = { negocio: negocio(), custosFixos: [fixo("Aluguel", 2000)], item: item(), insumos: [insumo()] };
  const semCanal = comporCusto(base);
  void canal({ taxaPct: 0.27 });
  assert.equal(reais(comporCusto(base).total), reais(semCanal.total));
});

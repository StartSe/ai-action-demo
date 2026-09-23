// O leitor da proposta precisa aguentar o que um modelo gratuito devolve de verdade: markdown,
// campo faltando, número em português, percentual escrito de três jeitos, unidade por extenso.
// Uma falha aqui custa a configuração inteira do negócio, então a regra é aproveitar o que der.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lerProposta, numeroBR, semProposta, temProposta } from "./proposta";

const COMPLETA = `Montei um rascunho com o que você contou.

PROPOSTA
negocio: Padaria da esquina | mei | unidades | 3000 | 200 | 4500 | 25
fixo: Aluguel | 2.800 | produto
fixo: DAS do MEI | 81 | ambos
canal: Balcão | 0 | 0 | principal
canal: iFood | 27 | 0
item: Pão de forma | produto | 12 | 5
insumo: Pão de forma | Farinha | 500 | g | 1 | kg | 6,50
insumo: Pão de forma | Fermento | 10 | g | 500 | g | 18
item: Café expresso | produto | 2 | 8
insumo: Café expresso | Café em grão | 9 | g | 1 | kg | 62
FIM`;

test("lê a proposta completa", () => {
  const p = lerProposta(COMPLETA)!;
  assert.equal(p.negocio.nome, "Padaria da esquina");
  assert.equal(p.negocio.regime, "mei");
  assert.equal(p.negocio.modoCapacidade, "unidades");
  assert.equal(p.negocio.volumeMensalUnidades, 3000);
  assert.equal(p.negocio.horasProdutivasMes, 200);
  assert.equal(p.negocio.proLaboreMensal, 4500);
  assert.equal(p.negocio.margemAlvoPadraoPct, 0.25);

  assert.deepEqual(p.fixos, [
    { nome: "Aluguel", valorMensal: 2800, balde: "produto" },
    { nome: "DAS do MEI", valorMensal: 81, balde: "ambos" },
  ]);

  assert.equal(p.canais.length, 2);
  assert.deepEqual(p.canais[0], { nome: "Balcão", taxaPct: 0, taxaFixa: 0, padrao: true });
  assert.equal(p.canais[1].taxaPct, 0.27);

  assert.equal(p.itens.length, 2);
  assert.equal(p.itens[0].nome, "Pão de forma");
  assert.equal(p.itens[0].perdaPct, 0.05);
  assert.equal(p.itens[0].insumos.length, 2);
  assert.deepEqual(p.itens[0].insumos[0], { nome: "Farinha", qtdUsada: 500, unidadeUso: "g", qtdCompra: 1, unidadeCompra: "kg", custoCompra: 6.5 });
  assert.equal(p.itens[1].insumos.length, 1);
});

test("a conversa fica sem o bloco, e o bloco é detectado", () => {
  assert.equal(semProposta(COMPLETA), "Montei um rascunho com o que você contou.");
  assert.ok(temProposta(COMPLETA));
  assert.ok(!temProposta("Só uma pergunta: quanto você paga de aluguel?"));
  assert.equal(semProposta("Quanto você paga de aluguel?"), "Quanto você paga de aluguel?");
});

test("números em português: milhar com ponto, centavo com vírgula, cifrão e percentual", () => {
  assert.equal(numeroBR("2.800"), 2800);
  assert.equal(numeroBR("6,50"), 6.5);
  assert.equal(numeroBR("R$ 1.200,00"), 1200);
  assert.equal(numeroBR("27%"), 27);
  assert.equal(numeroBR(""), 0);
  assert.equal(numeroBR("não sei"), 0);
});

test("percentual aceito tanto como 25 quanto como 0,25", () => {
  const comoInteiro = lerProposta("PROPOSTA\nnegocio: X | mei | unidades | 10 | 10 | 1000 | 30\nFIM")!;
  const comoFracao = lerProposta("PROPOSTA\nnegocio: X | mei | unidades | 10 | 10 | 1000 | 0,3\nFIM")!;
  assert.equal(comoInteiro.negocio.margemAlvoPadraoPct, 0.3);
  assert.equal(comoFracao.negocio.margemAlvoPadraoPct, 0.3);
});

test("markdown e lista numerada em volta das linhas não atrapalham", () => {
  const p = lerProposta(`PROPOSTA
- **negocio:** Estúdio | simples | horas | 0 | 150 | 9000 | 30
1. fixo: Sala | 1800 | servico
* item: Identidade visual | servico | 2400 | 10
FIM`)!;
  assert.equal(p.negocio.nome, "Estúdio");
  assert.equal(p.negocio.modoCapacidade, "horas");
  assert.equal(p.fixos[0].nome, "Sala");
  assert.equal(p.itens[0].tipo, "servico");
});

test("unidade por extenso vira a sigla, e desconhecida vira unidade avulsa", () => {
  const p = lerProposta(`PROPOSTA
item: Bolo | produto | 30 | 0
insumo: Bolo | Farinha | 400 | gramas | 1 | quilo | 6
insumo: Bolo | Leite | 200 | mililitros | 1 | litro | 5
insumo: Bolo | Forma | 1 | peça | 1 | peça | 9
FIM`)!;
  assert.equal(p.itens[0].insumos[0].unidadeUso, "g");
  assert.equal(p.itens[0].insumos[0].unidadeCompra, "kg");
  assert.equal(p.itens[0].insumos[1].unidadeUso, "ml");
  assert.equal(p.itens[0].insumos[1].unidadeCompra, "L");
  assert.equal(p.itens[0].insumos[2].unidadeUso, "un");
});

test("campo faltando não quebra: vira um padrão sensato", () => {
  const p = lerProposta(`PROPOSTA
negocio: Loja
item: Camiseta
insumo: Camiseta | Tecido | 1
FIM`)!;
  assert.equal(p.negocio.nome, "Loja");
  assert.equal(p.negocio.regime, "simples");
  assert.equal(p.negocio.margemAlvoPadraoPct, 0.2, "sem margem informada, cai no padrão de 20%");
  assert.equal(p.itens[0].tipo, "produto");
  assert.equal(p.itens[0].insumos[0].qtdCompra, 1, "embalagem sem quantidade vira 1, nunca 0, para não dividir por zero");
});

test("exatamente um canal principal, mesmo quando a IA marca vários ou nenhum", () => {
  const nenhum = lerProposta("PROPOSTA\nnegocio: X\ncanal: Loja | 0 | 0\ncanal: iFood | 27 | 0\nFIM")!;
  assert.deepEqual(nenhum.canais.map((c) => c.padrao), [true, false]);

  const varios = lerProposta("PROPOSTA\nnegocio: X\ncanal: Loja | 0 | 0 | principal\ncanal: iFood | 27 | 0 | principal\nFIM")!;
  assert.deepEqual(varios.canais.map((c) => c.padrao), [true, false]);
});

test("insumo antes de qualquer item é descartado em vez de derrubar a leitura", () => {
  const p = lerProposta("PROPOSTA\nnegocio: X\ninsumo: Pão | Farinha | 1 | kg | 1 | kg | 6\nitem: Pão | produto | 10 | 0\nFIM")!;
  assert.equal(p.itens.length, 1);
  assert.equal(p.itens[0].insumos.length, 0);
});

test("linha de conversa perdida dentro do bloco é ignorada", () => {
  const p = lerProposta(`PROPOSTA
negocio: X | mei | unidades | 100 | 100 | 2000 | 20
Coloquei um valor comum de aluguel porque você não disse.
fixo: Aluguel | 1500 | produto
FIM`)!;
  assert.equal(p.fixos.length, 1);
});

test("sem bloco, ou com bloco vazio, não há o que aplicar", () => {
  assert.equal(lerProposta("Quanto você paga de aluguel?"), null);
  assert.equal(lerProposta("PROPOSTA\nFIM"), null);
  assert.equal(lerProposta(""), null);
});

test("o bloco sem FIM ainda é lido até o fim do texto", () => {
  const p = lerProposta("PROPOSTA\nnegocio: X | mei | unidades | 10 | 10 | 100 | 20\nitem: Y | produto | 5 | 0")!;
  assert.equal(p.itens.length, 1);
});

// O que o modelo de verdade fez: listou os dois itens e só depois todos os insumos. Sem a
// referência ao item, tudo grudava no último e o primeiro ficava com a ficha vazia.
test("insumos listados depois de todos os itens vão para o item certo", () => {
  const p = lerProposta(`PROPOSTA
item: X-Salada | produto | 8 | 5
item: X-Bacon | produto | 10 | 5
insumo: X-Salada | Alface | 20 | g | 1 | kg | 12
insumo: X-Bacon | Bacon | 30 | g | 1 | kg | 60
insumo: X-Salada | Tomate | 30 | g | 1 | kg | 10
FIM`)!;
  assert.deepEqual(p.itens[0].insumos.map((l) => l.nome), ["Alface", "Tomate"]);
  assert.deepEqual(p.itens[1].insumos.map((l) => l.nome), ["Bacon"]);
});

test("sem referência ao item, o insumo ainda cai no item logo acima", () => {
  const p = lerProposta(`PROPOSTA
item: Pão | produto | 10 | 0
insumo: Farinha | 500 | g | 1 | kg | 6
FIM`)!;
  assert.equal(p.itens[0].insumos.length, 1);
  assert.equal(p.itens[0].insumos[0].nome, "Farinha");
  assert.equal(p.itens[0].insumos[0].qtdUsada, 500);
});

test("insumo cujo nome coincide com o do item não perde o primeiro campo", () => {
  // "Queijo" é o item e também o insumo: a referência casa e o campo seguinte é o insumo.
  const p = lerProposta(`PROPOSTA
item: Queijo | produto | 5 | 0
insumo: Queijo | Queijo | 200 | g | 1 | kg | 45
FIM`)!;
  assert.equal(p.itens[0].insumos[0].nome, "Queijo");
  assert.equal(p.itens[0].insumos[0].qtdUsada, 200);
});

// Modelos gratuitos de raciocínio despejam o rascunho mental antes da resposta, em inglês. O
// marcador MENSAGEM é o que impede isso de chegar à bolha da conversa.
test("o raciocínio do modelo antes da mensagem não vai para a tela", () => {
  const texto = `We need to respond to the last message from the owner. We have gathered the costs and should now propose.
MENSAGEM
Montei um rascunho. Chutei o DAS em 75 reais.
PROPOSTA
negocio: Hamburgueria | mei | unidades | 1200 | 220 | 5000 | 30
FIM`;
  assert.equal(semProposta(texto), "Montei um rascunho. Chutei o DAS em 75 reais.");
  assert.equal(lerProposta(texto)!.negocio.nome, "Hamburgueria");
});

test("o marcador também é aceito com dois-pontos, e sem ele nada muda", () => {
  assert.equal(semProposta("MENSAGEM:\nOlá.\nPROPOSTA\nnegocio: X\nFIM"), "Olá.");
  assert.equal(semProposta("Olá.\nPROPOSTA\nnegocio: X\nFIM"), "Olá.");
});

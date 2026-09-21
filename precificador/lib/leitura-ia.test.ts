// Os leitores das respostas da IA precisam aguentar o que um modelo gratuito de fato devolve:
// markdown que ninguém pediu, rótulo traduzido, separador trocado, lista numerada, texto solto.
// A regra é simples — ou sai algo aproveitável, ou sai `null` e o exemplo entra no lugar; nunca
// um erro na tela.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lerCustosEsquecidos, lerDiagnosticoMix, lerLeituraCorredor, semMarcacao } from "./leitura-ia";

test("leitura do corredor no formato pedido", () => {
  const r = lerLeituraCorredor(`Leitura: O pão está abaixo do alvo. Dá lucro, mas pouco.
- Suba o preço até o segundo marcador
- Reveja a manteiga, que é a linha mais cara
Risco: um aumento de insumo joga para o vermelho.`)!;
  assert.equal(r.resumo, "O pão está abaixo do alvo. Dá lucro, mas pouco.");
  assert.deepEqual(r.acoes, ["Suba o preço até o segundo marcador", "Reveja a manteiga, que é a linha mais cara"]);
  assert.equal(r.risco, "um aumento de insumo joga para o vermelho.");
});

test("leitura com markdown, lista numerada e sem rótulo", () => {
  const r = lerLeituraCorredor(`**O café tem a melhor margem da casa.**
1. Mantenha o preço
2) Repita a ficha nos outros itens`)!;
  assert.equal(r.resumo, "O café tem a melhor margem da casa.");
  assert.deepEqual(r.acoes, ["Mantenha o preço", "Repita a ficha nos outros itens"]);
  assert.equal(r.risco, undefined);
});

test("leitura corta em três ações e aceita rótulo alternativo", () => {
  const r = lerLeituraCorredor(`Resumo: está no vermelho.
- um
- dois
- três
- quatro
Atenção: cada venda aumenta o buraco.`)!;
  assert.equal(r.acoes.length, 3);
  assert.equal(r.risco, "cada venda aumenta o buraco.");
});

test("leitura só com ações usa a primeira como resumo", () => {
  const r = lerLeituraCorredor(`- Suba o preço
- Reveja a ficha`)!;
  assert.equal(r.resumo, "Suba o preço");
  assert.deepEqual(r.acoes, ["Reveja a ficha"]);
});

test("texto vazio ou só espaço devolve null, e quem chama cai no exemplo", () => {
  assert.equal(lerLeituraCorredor(""), null);
  assert.equal(lerLeituraCorredor("   \n  \n"), null);
  assert.equal(lerCustosEsquecidos("uma frase sem nenhuma pergunta"), null);
  assert.equal(lerDiagnosticoMix("", ["Pão"]), null);
});

test("custos esquecidos com travessão, hífen e dois-pontos como separador", () => {
  const r = lerCustosEsquecidos(`Faltam custos que passam batido.
- A embalagem está na ficha? — saco e etiqueta somam por unidade.
- O frete do insumo entrou? - o preço da nota não é o custo real.
- Você paga taxa de cartão? : a taxa sai antes do lucro.`)!;
  assert.equal(r.abertura, "Faltam custos que passam batido.");
  assert.equal(r.perguntas.length, 3);
  assert.deepEqual(r.perguntas[0], { pergunta: "A embalagem está na ficha?", porque: "saco e etiqueta somam por unidade." });
  assert.equal(r.perguntas[1].pergunta, "O frete do insumo entrou?");
  assert.equal(r.perguntas[2].porque, "a taxa sai antes do lucro.");
});

test("custos sem abertura ganham uma frase padrão, e pergunta sem porquê não quebra", () => {
  const r = lerCustosEsquecidos(`- A embalagem está na ficha?`)!;
  assert.match(r.abertura, /passar batido/);
  assert.deepEqual(r.perguntas, [{ pergunta: "A embalagem está na ficha?", porque: "" }]);
});

test("diagnóstico do mix casa o nome exato do item", () => {
  const r = lerDiagnosticoMix(
    `Leitura: um item puxa a margem para baixo.
- Pão de forma artesanal — está longe do alvo — suba o preço
Ponto forte: o resto está no azul.`,
    ["Pão de forma artesanal", "Café expresso"]
  )!;
  assert.equal(r.resumo, "um item puxa a margem para baixo.");
  assert.deepEqual(r.prioridades, [{ item: "Pão de forma artesanal", observacao: "está longe do alvo", acao: "suba o preço" }]);
  assert.equal(r.ponto_forte, "o resto está no azul.");
});

// A regra do produto: a IA interpreta, não inventa. Item que não existe na carteira é descartado.
test("diagnóstico descarta item que não está na carteira", () => {
  const r = lerDiagnosticoMix(
    `Leitura: dois problemas.
- Pizza calabresa — inventada pelo modelo — ignore
- Café expresso — está abaixo do alvo — ajuste o preço`,
    ["Pão de forma artesanal", "Café expresso"]
  )!;
  assert.deepEqual(r.prioridades.map((p) => p.item), ["Café expresso"]);
});

test("diagnóstico casa nome parcial, que é como o modelo costuma abreviar", () => {
  const r = lerDiagnosticoMix(`- Pão de forma — está no vermelho — suba o preço`, ["Pão de forma artesanal"])!;
  assert.equal(r.prioridades[0].item, "Pão de forma artesanal");
});

test("diagnóstico sem leitura monta um resumo a partir do que sobrou", () => {
  const r = lerDiagnosticoMix(`- Café expresso — abaixo do alvo — ajuste`, ["Café expresso"])!;
  assert.match(r.resumo, /1 item/);
});

// A bolha da conversa é texto puro: markdown que o modelo insista em usar não pode aparecer cru.
test("tira negrito, título e crase, mas mantém a estrutura da resposta", () => {
  assert.equal(semMarcacao("**Pão de forma** está com a pior margem"), "Pão de forma está com a pior margem");
  assert.equal(semMarcacao("## Alta de insumos"), "Alta de insumos");
  assert.equal(semMarcacao("use a tecla `Enter`"), "use a tecla Enter");
  assert.equal(semMarcacao("1. **Bolo** — cai para 18,5%\n2. **Pão** — cai para 6,9%"), "1. Bolo — cai para 18,5%\n2. Pão — cai para 6,9%");
  assert.equal(semMarcacao("- um\n- dois"), "- um\n- dois");
});

test("texto sem marcação passa intacto, e valor vazio não quebra", () => {
  assert.equal(semMarcacao("Dá para descontar até 16,5%."), "Dá para descontar até 16,5%.");
  assert.equal(semMarcacao(""), "");
});

test("asterisco solto de multiplicação não é confundido com negrito", () => {
  assert.equal(semMarcacao("markup de 2 * 3"), "markup de 2 * 3");
});

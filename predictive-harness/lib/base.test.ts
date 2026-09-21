import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "harness-base-"));
process.env.DATA_DIR = dir;
const pl = await import("./planilhas");
const papeis = await import("./papeis");
const base = await import("./base");
const demo = await import("./demo");
const cen = await import("./cenarios");
const exemplo = await import("./exemplo");
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("heurística de papéis: matrículas, custos e marketing da demonstração", () => {
  const csvs = demo.gerarCSVsExemplo();
  const m = pl.perfilar(...destruir(pl.parseCSV(csvs.matriculas)));
  assert.deepEqual(m.colunas.map((c) => c.papel), ["data", "produto", "turma", "canal", "desconto", "receita"]);
  assert.equal(papeis.papelDaPlanilha(m.colunas), "matriculas");
  const c = pl.perfilar(...destruir(pl.parseCSV(csvs.custos)));
  assert.deepEqual(c.colunas.map((x) => x.papel), ["produto", "turma", "custo_fixo", "custo_variavel"]);
  assert.equal(papeis.papelDaPlanilha(c.colunas), "custos");
  const k = pl.perfilar(...destruir(pl.parseCSV(csvs.marketing)));
  assert.deepEqual(k.colunas.map((x) => x.papel), ["data", "produto", "canal", "marketing"]);
  assert.equal(papeis.papelDaPlanilha(k.colunas), "marketing");
  // Um papel único não se repete: a segunda coluna de receita vira "nenhum".
  const dupla = pl.perfilar(...destruir(pl.parseCSV("data;produto;receita;valor\n2025-01-01;A;10;10")));
  assert.deepEqual(dupla.colunas.map((x) => x.papel), ["data", "produto", "receita", "nenhum"]);
  // "gasto" sozinho é marketing só quando não há receita ao lado.
  assert.equal(papeis.papelHeuristico({ nome: "gasto", tipo: "numero", semantico: "moeda", distintos: 10 }, [{ nome: "mes" }]), "marketing");
  assert.equal(papeis.papelHeuristico({ nome: "gasto", tipo: "numero", semantico: "moeda", distintos: 10 }, [{ nome: "receita" }]), "nenhum");
  const q = papeis.perguntasPapeis(m.colunas);
  assert.equal(Object.keys(q).length, 6);
  assert.equal(q.papel_0.type, "choice");
});
function destruir(r: { cabecalho: string[]; linhas: Record<string, string>[]; linhasVazias: number }): [string[], Record<string, string>[], number] {
  return [r.cabecalho, r.linhas, r.linhasVazias];
}

test("a base de exemplo vira três produtos com premissas da base e trimestre de referência", async () => {
  const lista = await exemplo.garantirExemplo();
  assert.equal(lista.filter((p) => p.demo).length, 3);
  const b = base.carregarBase();
  assert.ok(b.demo);
  assert.equal(b.matriculas?.nome, demo.NOMES_EXEMPLO.matriculas);
  assert.equal(b.custos?.nome, demo.NOMES_EXEMPLO.custos);
  assert.equal(b.marketing?.nome, demo.NOMES_EXEMPLO.marketing);
  assert.deepEqual(b.produtos.map((p) => p.nome).sort(), [...demo.PRODUTOS_EXEMPLO].sort());
  const imersao = b.produtos.find((p) => p.nome === demo.PRODUTOS_EXEMPLO[0])!;
  assert.equal(imersao.turmas, 12, "uma turma a cada dois meses em 24 meses");
  assert.ok(imersao.alunosPorTurma! > 24 && imersao.alunosPorTurma! < 34, `alunos por turma ${imersao.alunosPorTurma}`);
  assert.ok(Math.abs(imersao.ticketMedio! - 4900) < 60, `ticket cheio recuperado do valor pago e do desconto: ${imersao.ticketMedio}`);
  assert.ok(imersao.descontoMedioPct! > 5 && imersao.descontoMedioPct! < 12);
  assert.ok(Math.abs(imersao.custoFixoTurma! - 38000) < 3000);
  assert.ok(Math.abs(imersao.custoVariavelAluno! - 750) < 80);
  assert.ok(imersao.cacAluno! > 300 && imersao.cacAluno! < 1000, `marketing por aluno ${imersao.cacAluno}`);
  assert.ok(imersao.margemHistoricaPct! > 20 && imersao.margemHistoricaPct! < 60, `margem histórica ${imersao.margemHistoricaPct}`);
  assert.equal(imersao.primeiraTurma, "2024-01");
  assert.equal(b.periodo?.fim, "2025-12");
  assert.ok(b.baseline, "com custos e marketing, o trimestre de referência existe");
  assert.equal(b.baseline!.rotulo, "out/2025 a dez/2025");
  assert.ok(b.baseline!.contribuicao > 0 && b.baseline!.contribuicao < b.baseline!.receita);
  const ef = base.premissasEfetivas(b, imersao.nome);
  assert.equal(ef.faltantes.length, 0);
  assert.ok(ef.premissas.every((p) => p.origem === "base"));
  assert.match(ef.premissas[0].detalhe!, /média de 12 turmas em Matrículas 2024-25/);
});

test("livro de premissas: informada sobrepõe a base, remover restaura, faixa inválida é recusada", () => {
  const b = base.carregarBase();
  const nome = demo.PRODUTOS_EXEMPLO[0];
  base.salvarPremissa(nome, "custoFixoTurma", 42000);
  let ef = base.premissasEfetivas(b, nome);
  const cf = ef.premissas.find((p) => p.chave === "custoFixoTurma")!;
  assert.equal(cf.valor, 42000);
  assert.equal(cf.origem, "informada");
  assert.ok(ef.premissas.filter((p) => p.origem === "base").length === 5);
  // Na pergunta vale mais que o livro.
  ef = base.premissasEfetivas(b, nome, { custoFixoTurma: 50000 });
  assert.equal(ef.valores.custoFixoTurma, 50000);
  assert.equal(ef.premissas.find((p) => p.chave === "custoFixoTurma")!.detalhe, "informada na pergunta");
  base.removerPremissa(nome, "custoFixoTurma");
  ef = base.premissasEfetivas(b, nome);
  assert.equal(ef.premissas.find((p) => p.chave === "custoFixoTurma")!.origem, "base");
  assert.throws(() => base.salvarPremissa(nome, "descontoPct", 150), /fora da faixa/);
  assert.throws(() => base.salvarPremissa(nome, "ticket", "abc"), /Informe um número/);
  assert.throws(() => base.salvarPremissa(nome, "inexistente", 1), /não existe/);
  // Sugerida nunca entra na conta sem confirmação.
  base.salvarPremissa(nome, "cacAluno", 900, "sugerida");
  ef = base.premissasEfetivas(b, nome);
  assert.equal(ef.premissas.find((p) => p.chave === "cacAluno")!.origem, "base");
  base.removerPremissa(nome);
});

test("encontrar produto pela pergunta tolera acentos, parte do nome e ambiguidade", () => {
  const b = base.carregarBase();
  assert.equal(base.encontrarProduto("imersao em ia", b.produtos)?.nome, demo.PRODUTOS_EXEMPLO[0]);
  assert.equal(base.encontrarProduto("Gestão Estratégica", b.produtos)?.nome, demo.PRODUTOS_EXEMPLO[1]);
  assert.equal(base.encontrarProduto("curso de dados", b.produtos)?.nome, demo.PRODUTOS_EXEMPLO[2]);
  assert.equal(base.encontrarProduto("produto", b.produtos), null, "palavra que casa com todos não decide");
  assert.equal(base.encontrarProduto(null, b.produtos), null);
  assert.equal(base.encontrarProduto(null, b.produtos.slice(0, 1))?.nome, b.produtos[0].nome, "com um só produto não precisa nomear");
});

test("especificação → motor → cartões, e o recálculo local troca só a premissa", () => {
  const b = base.carregarBase();
  const nome = demo.PRODUTOS_EXEMPLO[0];
  const ex = cen.executarEspecificacao(b, { tipo: "cenario", produto: nome, turmas: 1, horizonte: "trimestre", premissas: {}, sugestoes: {}, meta: null }, nome);
  assert.ok(ex.ok);
  if (!ex.ok) return;
  assert.equal(ex.cartoes[0].tipo, "cenario");
  assert.equal(ex.cartoes[1].tipo, "sensibilidade");
  assert.ok(ex.fpa.cenario!.deltaPp !== null, "com trimestre de referência, o cenário mede a variação em p.p.");
  assert.ok(ex.fpa.formula.length >= 7);
  assert.match(ex.fpa.base, /^Base: Matrículas 2024-25 \(exemplo\) e Custos por turma \(exemplo\) e Marketing por mês \(exemplo\) \(/);
  const texto = cen.narrativaDeterministica(ex.fpa);
  assert.match(texto, /de contribuição\*\*/);
  assert.match(texto, /Base: /);
  // Recalcular com custo fixo maior derruba a contribuição na mesma proporção.
  const re = cen.recalcular(ex.fpa, b, { custoFixoTurma: ex.fpa.valores.custoFixoTurma + 10_000 });
  assert.ok(re.ok);
  if (!re.ok) return;
  assert.ok(Math.abs(re.fpa.turmas.contribuicao - (ex.fpa.turmas.contribuicao - 10_000)) < 1e-6);
  assert.equal(re.fpa.premissas.find((p) => p.chave === "custoFixoTurma")!.detalhe, "ajustada por você");
  assert.ok(re.fpa.recalculadoEm);
  // Sem custo fixo nem variável a especificação falha com a lista do que falta.
  const semCustos = { ...b, custos: null, produtos: b.produtos.map((p) => ({ ...p, custoFixoTurma: null, custoVariavelAluno: null })) };
  const falta = cen.executarEspecificacao(semCustos, { tipo: "cenario", produto: nome, turmas: 1, horizonte: "trimestre", premissas: {}, sugestoes: {}, meta: null }, nome);
  assert.ok(!falta.ok);
  if (falta.ok) return;
  assert.deepEqual(falta.faltantes, ["custoFixoTurma", "custoVariavelAluno"]);
  // Dita na pergunta, a premissa que faltava entra como informada.
  const comQ = cen.executarEspecificacao(semCustos, { tipo: "cenario", produto: nome, turmas: 2, horizonte: "ano", premissas: { custoFixoTurma: 40000, custoVariavelAluno: 800 }, sugestoes: {}, meta: null }, nome);
  assert.ok(comQ.ok);
  if (!comQ.ok) return;
  assert.equal(comQ.fpa.turmas.turmas, 2);
  assert.equal(comQ.fpa.premissas.filter((p) => p.origem === "informada").length, 2);
  assert.match(comQ.fpa.base, /informados por você na pergunta/);
});

test("as quatro respostas de exemplo saem do motor com números da base", () => {
  const b = base.carregarBase();
  for (const c of demo.CONVERSAS_EXEMPLO) {
    const r = demo.respostaExemplo(c.pergunta, b);
    assert.ok(r, c.pergunta);
    assert.ok(r!.exemplo && r!.decisoes!.every((d) => d.exemplo));
    assert.ok(r!.cartoes!.length >= 1);
    assert.equal(r!.categoria, c.categoria);
    assert.ok(r!.sugestoes!.length === 3);
  }
  const cenario = demo.respostaExemplo(demo.CONVERSAS_EXEMPLO[1].pergunta, b)!;
  assert.ok(cenario.fpa && cenario.fpa.turmas.contribuicao > 0);
  assert.match(cenario.texto, /R\$ /);
  assert.equal(demo.respostaExemplo("outra coisa", b), null);
  assert.match(base.resumoBaseParaIA(b), /Produtos: produto \| matrículas/);
});

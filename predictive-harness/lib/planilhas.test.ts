import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "harness-planilhas-"));
process.env.DATA_DIR = dir;
const pl = await import("./planilhas");
const demo = await import("./demo");
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("lê CSV com ponto e vírgula, aspas, BOM e linhas em branco", () => {
  const { cabecalho, linhas, linhasVazias } = pl.parseCSV('﻿data;regiao;"receita (R$)"\n2025-01-01;Sul;"1.234,56"\n\n2025-02-01;"Centro-Oeste; interior";2000\n');
  assert.deepEqual(cabecalho, ["data", "regiao", "receita (R$)"]);
  assert.equal(linhas.length, 2);
  assert.equal(linhas[1].regiao, "Centro-Oeste; interior");
  assert.equal(linhasVazias, 1);
});
test("números em formato brasileiro e americano, moeda e percentual", () => {
  assert.equal(pl.paraNumero("1.234,56"), 1234.56);
  assert.equal(pl.paraNumero("1,234.56"), 1234.56);
  assert.equal(pl.paraNumero("R$ 2.500"), 2500);
  assert.equal(pl.paraNumero("12,5%"), 12.5);
  assert.equal(pl.paraNumero("1,234,567"), 1234567);
  assert.equal(pl.paraNumero("abc"), null);
  assert.equal(pl.paraData("15/03/2025"), "2025-03-15");
  assert.equal(pl.paraData("2025-03"), "2025-03-01");
  assert.equal(pl.paraData("2025-03-15T10:00:00Z"), "2025-03-15");
});
test("perfil: tipos, semântica heurística, período e qualidade", () => {
  const csv = demo.gerarCSVExemplo();
  const { cabecalho, linhas, linhasVazias } = pl.parseCSV(csv);
  assert.equal(linhas.length, 24 * 5 * 3);
  const { colunas, periodo, qualidade } = pl.perfilar(cabecalho, linhas, linhasVazias);
  const por = Object.fromEntries(colunas.map((c) => [c.nome, c]));
  assert.equal(por.data.semantico, "data");
  assert.equal(por.regiao.semantico, "geografia");
  assert.equal(por.canal.semantico, "categoria");
  assert.equal(por.receita.semantico, "moeda");
  assert.equal(por.unidades.semantico, "quantidade");
  assert.equal(por.desconto_pct.semantico, "percentual");
  assert.equal(por.vendedor_id.tipo, "texto");
  assert.equal(periodo?.inicio, "2024-01-01");
  assert.equal(periodo?.fim, "2025-12-01");
  assert.equal(qualidade.duplicadas, 0);
  assert.ok(typeof por.receita.soma === "number" && por.receita.soma > 0);
});
test("resumo para a IA traz totais por mês, por categoria e variação, sem linhas", async () => {
  const p = await pl.criarPlanilha({ nome: "Exemplo", texto: demo.gerarCSVExemplo(), formato: "csv", demo: true, classificar: false });
  assert.equal(p.classificacao, "exemplo");
  const resumo = pl.resumoParaIA(p, pl.lerLinhas(p));
  assert.match(resumo, /Totais por mês \(data\)/);
  assert.match(resumo, /2025-12 \|/);
  assert.match(resumo, /Totais por regiao/);
  assert.match(resumo, /Variação de receita por regiao/);
  assert.ok(!resumo.includes("V001"), "identificadores de linha não vão para a IA");
  assert.ok(resumo.length < 9100);
  assert.equal(pl.listarPlanilhas()[0].id, p.id);
  assert.equal(pl.obterPlanilha(p.id).linhas, 360);
  pl.removerPlanilha(p.id);
  assert.throws(() => pl.obterPlanilha(p.id), /não encontrada/);
});
test("JSON com lista de objetos vira planilha; limites e erros claros", async () => {
  const p = await pl.criarPlanilha({ nome: "j", texto: JSON.stringify({ itens: [{ a: 1, b: "x" }, { a: 2, b: "y", c: true }] }), formato: "json", classificar: false });
  assert.deepEqual(p.colunas.map((c) => c.nome), ["a", "b", "c"]);
  assert.equal(p.linhas, 2);
  await assert.rejects(() => pl.criarPlanilha({ nome: "v", texto: "", formato: "csv", classificar: false }), /vazio/);
  await assert.rejects(() => pl.criarPlanilha({ nome: "v", texto: "[1,2]", formato: "json", classificar: false }), /objeto/);
});
test("respostas de exemplo são calculadas a partir dos dados gerados", () => {
  const { linhas } = pl.parseCSV(demo.gerarCSVExemplo());
  const r = demo.respostaExemplo(demo.CONVERSAS_EXEMPLO[0].pergunta, linhas);
  assert.ok(r && r.exemplo && r.texto.includes("Sudeste"));
  assert.ok(r!.decisoes!.every((d) => d.exemplo));
  assert.equal(demo.respostaExemplo("outra coisa", linhas), null);
});
test("perguntas de classificação: três por coluna, tipos válidos", () => {
  const { cabecalho, linhas } = pl.parseCSV("a;b\n1;x\n2;y");
  const { colunas } = pl.perfilar(cabecalho, linhas, 0);
  const q = pl.perguntasClassificacao(colunas);
  assert.deepEqual(Object.keys(q), ["tipo_0", "alvo_0", "pessoal_0", "tipo_1", "alvo_1", "pessoal_1"]);
  assert.equal(q.tipo_0.type, "choice");
  assert.equal(q.alvo_0.type, "noul");
});

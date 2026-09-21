import test from "node:test";
import assert from "node:assert/strict";
import * as fpa from "./fpa";

// Caso do PLANO.md §11.4: turma de 28 alunos, ticket 4.900, desconto 8%, custo fixo 38 mil,
// custo variável 750 e marketing 620 por aluno.
const p: fpa.Premissas = { alunosPorTurma: 28, ticket: 4900, descontoPct: 8, custoFixoTurma: 38000, custoVariavelAluno: 750, cacAluno: 620 };
const perto = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} deveria ser ${b}`);

test("contribuição de uma turma: receita líquida menos variável, marketing e fixo", () => {
  const r = fpa.calcularTurmas(p);
  assert.equal(r.alunos, 28);
  assert.equal(r.receitaBruta, 137_200);
  assert.equal(r.desconto, 10_976);
  assert.equal(r.receita, 126_224);
  assert.equal(r.custoVariavel, 21_000);
  assert.equal(r.marketing, 17_360);
  assert.equal(r.custoFixo, 38_000);
  assert.equal(r.contribuicao, 49_864);
  perto(r.margemPct, 39.505, 0.001);
  perto(r.contribuicaoPorAluno, 3138);
  const duas = fpa.calcularTurmas(p, 2);
  assert.equal(duas.contribuicao, 2 * 49_864, "duas turmas dobram tudo, inclusive o fixo");
  perto(duas.margemPct, r.margemPct, 1e-9);
});

test("ponto de equilíbrio arredonda para cima e informa a folga", () => {
  const pe = fpa.pontoEquilibrio(p);
  assert.equal(pe.alunosMinimos, 13, "38.000 ÷ 3.138 = 12,1 → 13 alunos");
  assert.equal(pe.folga, 15);
  perto(pe.ocupacaoMinimaPct!, (13 / 28) * 100, 1e-9);
  assert.ok(pe.curva.length >= 5 && pe.curva[0].alunos === 0 && pe.curva[0].contribuicao === -38_000);
  const ruim = fpa.pontoEquilibrio({ ...p, custoVariavelAluno: 5000 });
  assert.equal(ruim.alunosMinimos, null, "quando cada aluno dá prejuízo não há equilíbrio");
  assert.equal(ruim.folga, null);
});

test("cenário de nova turma muda a margem do período em pontos percentuais", () => {
  const base: fpa.Baseline = { rotulo: "último trimestre", receita: 1_000_000, contribuicao: 312_000, inicio: "2026-01", fim: "2026-03" };
  const c = fpa.cenarioNovasTurmas(p, 1, base);
  perto(c.margemAntesPct!, 31.2, 1e-9);
  perto(c.margemDepoisPct!, ((312_000 + 49_864) / (1_000_000 + 126_224)) * 100, 1e-9);
  assert.ok(c.deltaPp! > 0.9 && c.deltaPp! < 1.0, `delta ${c.deltaPp}`);
  const semBase = fpa.cenarioNovasTurmas(p, 1, null);
  assert.equal(semBase.margemAntesPct, null);
  assert.equal(semBase.resultado.contribuicao, 49_864);
});

test("sensibilidade piora cada premissa 10% e ordena pelo impacto", () => {
  const s = fpa.sensibilidade(p);
  assert.equal(s.base, 49_864);
  assert.equal(s.itens.length, 6);
  assert.equal(s.itens[0].chave, "ticket", "ticket é o driver mais sensível: 10% a menos tira R$ 12.622");
  perto(s.itens.find((i) => i.chave === "ticket")!.delta, -12_622.4);
  perto(s.itens.find((i) => i.chave === "alunosPorTurma")!.delta, -2.8 * 3138); // alunos a menos também poupam variável e marketing
  perto(s.itens.find((i) => i.chave === "custoFixoTurma")!.delta, -3800);
  for (let i = 1; i < s.itens.length; i++) assert.ok(s.itens[i - 1].delta <= s.itens[i].delta);
  assert.ok(s.itens.every((i) => i.delta < 0), "toda variação adversa reduz a contribuição");
  const semDesconto = fpa.sensibilidade({ ...p, descontoPct: 0 });
  assert.equal(semDesconto.itens.find((i) => i.chave === "descontoPct")!.variacao, "+10 p.p.");
});

test("meta reversa: marketing máximo, ticket mínimo, alunos mínimos e inalcançável", () => {
  const cac = fpa.metaReversa(p, "cacAluno", 30);
  perto(cac.valor!, 1048.457, 0.001);
  assert.equal(cac.direcao, "máximo");
  assert.ok(cac.atingeHoje, "39,5% já passa de 30%");
  perto(fpa.calcularTurmas({ ...p, cacAluno: cac.valor! }).margemPct, 30, 1e-6);

  const ticket = fpa.metaReversa(p, "ticket", 30);
  assert.equal(ticket.direcao, "mínimo");
  perto(fpa.calcularTurmas({ ...p, ticket: ticket.valor! }).margemPct, 30, 1e-6);

  const alunos = fpa.metaReversa(p, "alunosPorTurma", 30);
  assert.equal(alunos.valor, 22);
  assert.ok(fpa.calcularTurmas({ ...p, alunosPorTurma: 22 }).margemPct >= 30);
  assert.ok(fpa.calcularTurmas({ ...p, alunosPorTurma: 21 }).margemPct < 30);

  const desconto = fpa.metaReversa(p, "descontoPct", 30);
  perto(fpa.calcularTurmas({ ...p, descontoPct: desconto.valor! }).margemPct, 30, 1e-6);

  const fixo = fpa.metaReversa(p, "custoFixoTurma", 30);
  perto(fpa.calcularTurmas({ ...p, custoFixoTurma: fixo.valor! }).margemPct, 30, 1e-6);

  const impossivel = fpa.metaReversa(p, "cacAluno", 90);
  assert.equal(impossivel.valor, null, "90% de margem não cabe: o marketing teria de ser negativo");
  assert.equal(impossivel.contribuicaoNaMeta, null);
});

test("validação: faltantes e faixas são recusadas, nunca assumidas", () => {
  const v = fpa.validarPremissas({ alunosPorTurma: 28, ticket: 4900 });
  assert.equal(v.premissas, null);
  assert.deepEqual(v.faltantes, ["descontoPct", "custoFixoTurma", "custoVariavelAluno", "cacAluno"]);
  const fora = fpa.validarPremissas({ ...p, descontoPct: 120 });
  assert.equal(fora.premissas, null);
  assert.match(fora.erros[0], /Desconto médio fora da faixa/);
  const ok = fpa.validarPremissas(p);
  assert.deepEqual(ok.premissas, p);
  assert.equal(ok.faltantes.length, 0);
});

test("fórmulas em português trazem os números substituídos", () => {
  const r = fpa.calcularTurmas(p);
  const f = fpa.formulaTurmas(p, r);
  assert.equal(f.length, 6);
  assert.match(f[1], /Receita = 28 × R\$ 4\.900 × \(1 − 8%\) = R\$ 126\.224/);
  assert.match(f[5], /= R\$ 49\.864 \(39,5% da receita\)/);
  const pe = fpa.formulaPontoEquilibrio(p, fpa.pontoEquilibrio(p));
  assert.match(pe[1], /Alunos mínimos = R\$ 38\.000 ÷ R\$ 3\.138 = 13/);
  const m = fpa.formulaMetaReversa(p, fpa.metaReversa(p, "cacAluno", 30));
  assert.match(m[0], /Marketing máximo por aluno = .* = R\$ 1\.048/);
  assert.equal(fpa.formatarPremissa("descontoPct", 8), "8%");
  assert.equal(fpa.formatarPremissa("ticket", 4900), "R$ 4.900");
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "harness-conversa-"));
process.env.DATA_DIR = dir;
// Sem chave do OpenRouter e com o provedor apontando para ele, nada aqui toca a rede:
// o harness cai no caminho de demonstração e o motor responde localmente.
process.env.AI_PROVIDER = "openrouter";
delete process.env.OPENROUTER_API_KEY;
const conversa = await import("./conversa");
const base = await import("./base");
const demo = await import("./demo");
const exemplo = await import("./exemplo");
test.after(() => rmSync(dir, { recursive: true, force: true }));

const triagem = { tipo: "cenario", horizonte: "trimestre" as const, drivers: [] };

test("especificação do LLM é validada campo a campo, nunca assumida em silêncio", async () => {
  await exemplo.garantirExemplo();
  const b = base.carregarBase();
  const produto = demo.PRODUTOS_EXEMPLO[0];

  // Caso bom: tudo dentro das faixas, com uma premissa dita na pergunta.
  let avisos: string[] = [];
  const ok = conversa.normalizarEspecificacao({ tipo: "cenario", produto, turmas: 2, horizonte: "ano", premissas: { custoFixoTurma: 38000 }, sugestoes: {}, meta: null }, triagem, b, avisos);
  assert.equal(ok.tipo, "cenario");
  assert.equal(ok.produto, produto);
  assert.equal(ok.turmas, 2);
  assert.equal(ok.horizonte, "ano");
  assert.deepEqual(ok.premissas, { custoFixoTurma: 38000 });
  assert.equal(avisos.length, 0);

  // Números fora da faixa são descartados com aviso; texto brasileiro vira número.
  avisos = [];
  const fora = conversa.normalizarEspecificacao({ tipo: "cenario", produto, turmas: 9999, premissas: { descontoPct: 300, ticket: "5.400,50" }, sugestoes: { cacAluno: -50 } }, triagem, b, avisos);
  assert.equal(fora.turmas, 1, "9999 turmas não é razoável");
  assert.deepEqual(fora.premissas, { ticket: 5400.5 });
  assert.deepEqual(fora.sugestoes, {});
  assert.equal(avisos.length, 3);
  assert.ok(avisos.some((a) => /Desconto médio dita na pergunta/.test(a)));
  assert.ok(avisos.some((a) => /Marketing por aluno sugerida/.test(a)));

  // Lixo do modelo cai na triagem do Jev, sem inventar premissa.
  avisos = [];
  const lixo = conversa.normalizarEspecificacao("não é json", { tipo: "risco", horizonte: "mes", drivers: [] }, b, avisos);
  assert.equal(lixo.tipo, "ponto_equilibrio", "risco vira ponto de equilíbrio");
  assert.equal(lixo.produto, null);
  assert.equal(lixo.turmas, 1);
  assert.equal(lixo.horizonte, "mes");
  assert.deepEqual(lixo.premissas, {});

  // Meta reversa sem margem-alvo usa o padrão e avisa; a variável vem dos drivers da triagem.
  avisos = [];
  const meta = conversa.normalizarEspecificacao({ tipo: "meta_reversa", produto, meta: {} }, { tipo: "meta_reversa", horizonte: "trimestre", drivers: ["ticket"] }, b, avisos);
  assert.deepEqual(meta.meta, { variavel: "ticket", margemAlvoPct: 30 });
  assert.ok(avisos.some((a) => /não disse a margem-alvo/.test(a)));
  // Chave de premissa inexistente é simplesmente ignorada.
  const invent = conversa.normalizarEspecificacao({ premissas: { inventada: 10, alunosPorTurma: 30 } }, triagem, b, []);
  assert.deepEqual(invent.premissas, { alunosPorTurma: 30 });
});

test("em demonstração o turno responde pelo motor e o recálculo local troca a premissa sem IA", async () => {
  await exemplo.garantirExemplo();
  conversa.limparConversa();
  const b = base.carregarBase();
  assert.deepEqual(conversa.sugestoesIniciais(b).map((s) => s.categoria), ["diagnostico", "cenario", "meta_reversa", "risco"]);

  const cenario = demo.CONVERSAS_EXEMPLO[1].pergunta;
  const { pergunta, resposta } = await conversa.executarTurno(cenario);
  assert.equal(pergunta.papel, "usuario");
  assert.ok(resposta.exemplo);
  assert.equal(resposta.categoria, "cenario");
  assert.ok(resposta.fpa, "a resposta de cenário guarda o cálculo do motor");
  assert.equal(conversa.listarMensagens().length, 2);

  const antes = resposta.fpa!.turmas.contribuicao;
  const custoAntes = resposta.fpa!.valores.custoFixoTurma;
  const re = conversa.recalcularMensagem(resposta.id, { custoFixoTurma: custoAntes + 5000 }, false);
  assert.ok(Math.abs(re.fpa!.turmas.contribuicao - (antes - 5000)) < 1e-6);
  assert.equal(re.fpa!.premissas.find((p) => p.chave === "custoFixoTurma")!.detalhe, "ajustada por você");
  assert.ok(re.harness!.avisos.some((a) => /recalculados com premissas ajustadas/.test(a)));
  assert.ok(re.decisoes!.some((d) => d.chave === "recalculo"));
  assert.equal(re.cartoes![0].tipo, "cenario");
  assert.equal(conversa.obterMensagem(resposta.id).fpa!.turmas.contribuicao, re.fpa!.turmas.contribuicao, "o recálculo é gravado");
  // Não salvar no livro: a premissa da base continua valendo para os próximos cenários.
  assert.equal(base.premissasEfetivas(base.carregarBase(), re.fpa!.produto).valores.custoFixoTurma, custoAntes);

  // Entradas inválidas são recusadas com mensagem clara.
  assert.throws(() => conversa.recalcularMensagem(resposta.id, { custoFixoTurma: "abc" }, false), /Informe um número/);
  assert.throws(() => conversa.recalcularMensagem(resposta.id, { descontoPct: 900 }, false), /fora da faixa/);
  assert.throws(() => conversa.recalcularMensagem(resposta.id, { inexistente: 1 }, false), /não existe/);
  assert.throws(() => conversa.recalcularMensagem(resposta.id, {}, false), /Ajuste pelo menos uma premissa/);
  assert.throws(() => conversa.recalcularMensagem("nao-existe", { ticket: 100 }, false), /não encontrada/);

  // Salvando, a premissa entra no livro do produto como informada.
  const salvo = conversa.recalcularMensagem(resposta.id, { custoFixoTurma: 44000 }, true);
  const ef = base.premissasEfetivas(base.carregarBase(), salvo.fpa!.produto);
  assert.equal(ef.valores.custoFixoTurma, 44000);
  assert.equal(ef.premissas.find((p) => p.chave === "custoFixoTurma")!.origem, "informada");
  base.removerPremissa(salvo.fpa!.produto);

  // Pergunta livre fora do roteiro, sem IA conectada: erro claro em vez de resposta inventada.
  await assert.rejects(() => conversa.executarTurno("e se dobrarmos o marketing?"), /Conecte o OpenRouter/);
  await assert.rejects(() => conversa.executarTurno("   "), /Escreva uma pergunta/);
  conversa.limparConversa();
  assert.equal(conversa.listarMensagens().length, 0);
});

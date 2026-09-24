import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
const dir = mkdtempSync(join(tmpdir(), "jev-experiencia-"));
process.env.DATA_DIR = dir;
process.env.AI_PROVIDER = "openrouter";
delete process.env.OPENROUTER_API_KEY;
const { garantirExemplo } = await import("./exemplo");
const sessoes = await import("./sessoes");
const conversa = await import("./conversa");
const { carregarBase } = await import("./base");
const planilhas = await import("./planilhas");
const { CONVERSAS_EXEMPLO } = await import("./demo");
const { lerXlsx } = await import("./xlsx");
const upload = await import("../app/api/planilhas/route");
const { formDataLimitado } = await import("./api");
test.after(() => rmSync(dir, { recursive: true, force: true }));

function arquivoExcel() {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["produto", "receita", "data", "desconto"], ["Estratégia", 1234.56789, new Date("2026-04-03T00:00:00Z"), 0.085]]);
  sheet.B2.z = "0.00";
  XLSX.utils.book_append_sheet(wb, sheet, "Vendas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["produto", "custo_fixo"], ["Estratégia", 300]]), "Custos");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("XLSX lista abas, importa só a escolhida e preserva precisão e data", async () => {
  const bytes = arquivoExcel();
  assert.deepEqual((await lerXlsx(bytes)).abas, ["Vendas", "Custos"]);
  const vendas = planilhas.parseCSV((await lerXlsx(bytes, "Vendas")).texto!);
  assert.equal(planilhas.paraNumero(vendas.linhas[0].receita), 1234.56789);
  assert.equal(planilhas.paraNumero(vendas.linhas[0].desconto), 0.085, "decimal com três casas não vira separador de milhar");
  assert.equal(vendas.linhas[0].data, "2026-04-03");
  const custos = planilhas.parseCSV((await lerXlsx(bytes, "Custos")).texto!);
  assert.deepEqual(custos.cabecalho, ["produto", "custo_fixo"]);
  await assert.rejects(lerXlsx(bytes, "Não existe"), /Escolha uma das abas/);
  await assert.rejects(lerXlsx(Buffer.from("arquivo corrompido")), /Não foi possível abrir/);
  await assert.rejects(lerXlsx(Buffer.alloc(planilhas.LIMITE_BYTES + 1)), /20 MB/);
});

test("upload XLSX consulta abas sem criar fonte; importação e CSV são locais", async () => {
  const antes = planilhas.listarPlanilhas().length;
  const form = new FormData();
  form.set("arquivo", new File([new Uint8Array(arquivoExcel())], "financeiro.xlsx"));
  let res = await upload.POST(new Request("http://localhost/api/planilhas", { method: "POST", body: form }));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).abas, ["Vendas", "Custos"]);
  assert.equal(planilhas.listarPlanilhas().length, antes);
  form.set("aba", "Vendas");
  res = await upload.POST(new Request("http://localhost/api/planilhas", { method: "POST", body: form }));
  const p = (await res.json()).planilha;
  assert.equal(p.arquivoOrigem, "financeiro.xlsx");
  assert.equal(p.abaOrigem, "Vendas");
  assert.equal(p.linhas, 1);
  assert.equal(p.harness, null);
  assert.equal(planilhas.paraNumero(planilhas.lerLinhas(p)[0].receita), 1234.56789);
  form.set("arquivo", new File(["produto;receita\nOutro;500"], "outro.csv"));
  res = await upload.POST(new Request("http://localhost/api/planilhas", { method: "POST", body: form }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).planilha.papelPlanilha, "matriculas");
});

test("limite multipart vale também para envio sem Content-Length", async () => {
  const form = new FormData(); form.set("arquivo", new File([new Uint8Array(2048)], "a.csv"));
  await assert.rejects(formDataLimitado(new Request("http://localhost", { method: "POST", body: new Uint8Array(await new Response(form).arrayBuffer()) }), 1024, "Limite excedido"), /Limite excedido/);
  const res = await upload.POST(new Request("http://localhost/api/planilhas", { method: "POST", headers: { "Content-Length": String(planilhas.LIMITE_BYTES + 100000) }, body: "x" }));
  assert.equal(res.status, 413);
});

test("fontes de cada conversa são explícitas, persistentes e não mudam com novos uploads", async () => {
  const ps = await garantirExemplo();
  sessoes.listarConversas();
  const demos = ps.filter(p => p.demo).map(p => p.id);
  const a = sessoes.criarConversa(demos);
  const propria = ps.find(p => !p.demo && p.papelPlanilha === "matriculas")!;
  const b = sessoes.criarConversa([propria.id]);
  const bases = await Promise.all([
    sessoes.comConversa(a.id, async () => { await new Promise(resolve => setTimeout(resolve, 5)); return carregarBase(); }),
    sessoes.comConversa(b.id, async () => { await Promise.resolve(); return carregarBase(); }),
  ]);
  assert.equal(bases[0].demo, true);
  assert.equal(bases[1].matriculas?.id, propria.id);
  const nova = await planilhas.criarPlanilha({ nome: "Mais recente", texto: "produto;receita\nOutro;999", formato: "csv", classificar: false });
  assert.notEqual(nova.id, propria.id);
  assert.equal(sessoes.comConversa(b.id, carregarBase).matriculas?.id, propria.id);
  assert.throws(() => sessoes.criarConversa([propria.id, nova.id]), /uma planilha de cada tipo/);
  assert.throws(() => sessoes.criarConversa([propria.id, demos[0]]), /misturá-las|cada tipo/);
  assert.throws(() => sessoes.criarConversa(["inexistente"]), /não está mais disponível/);
  const vazia = sessoes.criarConversa([]);
  assert.equal(sessoes.comConversa(vazia.id, carregarBase).matriculas, null);
});

test("nova conversa preserva histórico; limpar e excluir só afetam a conversa escolhida", async () => {
  const demos = planilhas.listarPlanilhas().filter(p => p.demo).map(p => p.id);
  const a = sessoes.criarConversa(demos);
  const b = sessoes.criarConversa(demos);
  const turno = await sessoes.comConversa(a.id, () => conversa.executarTurno(CONVERSAS_EXEMPLO[1].pergunta));
  assert.equal(sessoes.comConversa(a.id, conversa.listarMensagens).length, 2);
  assert.equal(sessoes.comConversa(b.id, conversa.listarMensagens).length, 0);
  assert.ok(turno.resposta.sugestoes?.length, "perguntas de acompanhamento continuam disponíveis");
  assert.throws(() => sessoes.comConversa(b.id, () => conversa.obterMensagem(turno.resposta.id)), /não encontrada/);
  await sessoes.comConversa(b.id, () => conversa.executarTurno(CONVERSAS_EXEMPLO[0].pergunta));
  sessoes.comConversa(b.id, conversa.limparConversa);
  assert.equal(sessoes.comConversa(a.id, conversa.listarMensagens).length, 2);
  assert.equal(sessoes.comConversa(b.id, conversa.listarMensagens).length, 0);
  sessoes.excluirConversa(b.id);
  assert.throws(() => sessoes.obterConversa(b.id), /não encontrada/);
  assert.equal(sessoes.comConversa(a.id, conversa.listarMensagens).length, 2);
});

test("excluir fonte não substitui silenciosamente a base de uma conversa", async () => {
  const propria = planilhas.listarPlanilhas().find(p => !p.demo)!;
  const c = sessoes.criarConversa([propria.id]);
  planilhas.removerPlanilha(propria.id);
  const base = sessoes.comConversa(c.id, carregarBase);
  assert.equal(base.matriculas, null);
  assert.match(base.avisos[0], /fonte desta conversa foi excluída/);
  await assert.rejects(sessoes.comConversa(c.id, () => conversa.executarTurno("Qual a receita?")), /fonte desta conversa foi excluída/);
});


test("perfil numérico suporta as 200 mil linhas anunciadas sem exceder a pilha", () => {
  const linhas = Array.from({ length: planilhas.LIMITE_LINHAS }, (_, i) => ({ receita: String(i + 1) }));
  const perfil = planilhas.perfilar(["receita"], linhas, 0);
  assert.equal(perfil.colunas[0].min, 1);
  assert.equal(perfil.colunas[0].max, planilhas.LIMITE_LINHAS);
  assert.equal(perfil.colunas[0].soma, 20000100000);
});

test("fixar persiste e ordena conversas sem alterar fontes nem mensagens", async () => {
  const a = sessoes.criarConversa([]);
  const b = sessoes.criarConversa([]);
  assert.equal(a.fixada, false);
  assert.equal(sessoes.listarConversas()[0].id, b.id);
  assert.equal(sessoes.fixarConversa(a.id, true).fixada, true);
  assert.equal(sessoes.listarConversas()[0].id, a.id);
  assert.deepEqual(sessoes.obterConversa(a.id).fontes, []);
  assert.throws(() => sessoes.fixarConversa(a.id, "true"), /Informe/);
  assert.throws(() => sessoes.fixarConversa("ausente", true), /não encontrada/);
  sessoes.fixarConversa(a.id, false);
  assert.equal(sessoes.listarConversas()[0].id, b.id);
  sessoes.titularConversa(a.id, "Conversa retomada");
  assert.equal(sessoes.obterConversa(a.id).titulo, "Conversa retomada");
  assert.ok(sessoes.obterConversa(a.id).atualizadoEm >= a.atualizadoEm);
});


test("renomear mantém fontes, mensagens e fixação; título manual resiste à primeira pergunta", async () => {
  const demos = planilhas.listarPlanilhas().filter(p => p.demo).map(p => p.id);
  const c = sessoes.criarConversa(demos);
  sessoes.fixarConversa(c.id, true);
  sessoes.renomearConversa(c.id, "  Nova   conversa  ");
  await sessoes.comConversa(c.id, () => conversa.executarTurno(CONVERSAS_EXEMPLO[1].pergunta));
  assert.equal(sessoes.obterConversa(c.id).titulo, "Nova conversa");
  const route = await import("../app/api/conversas/route");
  const patch = (dados: unknown) => route.PATCH(new Request("http://localhost/api/conversas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) }));
  assert.equal((await patch({ id: c.id, titulo: "Revisão do trimestre" })).status, 200);
  assert.equal(sessoes.obterConversa(c.id).titulo, "Revisão do trimestre");
  assert.equal(sessoes.obterConversa(c.id).fixada, true);
  assert.deepEqual(sessoes.obterConversa(c.id).fontes, demos);
  assert.equal(sessoes.comConversa(c.id, conversa.listarMensagens).length, 2);
  for (const titulo of [null, " ", "x".repeat(101)]) assert.equal((await patch({ id: c.id, titulo })).status, 400);
  assert.equal((await patch({ id: "ausente", titulo: "Válido" })).status, 404);
  assert.equal((await patch({ id: c.id, titulo: "Válido", fixada: true })).status, 400);
});

test("contexto de voz só contém fontes e cálculos da conversa selecionada", async () => {
  const { contextoVoz } = await import("./voz-contexto");
  const demos = planilhas.listarPlanilhas().filter(p => p.demo).map(p => p.id);
  const a = sessoes.criarConversa(demos);
  const b = sessoes.criarConversa([]);
  const turno = await sessoes.comConversa(a.id, () => conversa.executarTurno(CONVERSAS_EXEMPLO[1].pergunta));
  const ca = JSON.parse(sessoes.comConversa(a.id, contextoVoz));
  const cb = JSON.parse(sessoes.comConversa(b.id, contextoVoz));
  assert.equal(ca.fontes.length, 3);
  assert.deepEqual(ca.perguntasDeExemplo, CONVERSAS_EXEMPLO.map(c => c.pergunta));
  assert.equal(ca.historico.length, 2);
  assert.deepEqual(ca.historico[1].cartoes, turno.resposta.cartoes);
  assert.deepEqual(cb.fontes, []);
  assert.deepEqual(cb.produtos, []);
  assert.deepEqual(cb.historico, []);
  assert.ok(!JSON.stringify(cb).includes(turno.resposta.id));
});

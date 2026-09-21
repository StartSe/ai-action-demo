import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NovoLeadProspeccao } from "../lib/types";
import { filtrarLeads, type LeadDaLista } from "../lib/leads-lista";

test("reencontro incorpora dados atuais sem perder identidade e decisões comerciais", async t => {
  const antes = process.env.DATA_DIR, pasta = mkdtempSync(path.join(tmpdir(), "lead-atualizacao-"));
  process.env.DATA_DIR = pasta;
  t.after(() => { if (antes === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = antes; rmSync(pasta, { force: true, recursive: true }); });
  const ws = await import("../lib/workspace");
  const { salvarPessoaEncontrada, enriquecerLead } = await import("../lib/leads-enriquecimento");
  const produto = ws.criarProduto({ nome: "Produto", descricao: "", propostaValor: "", site: null });
  const icp = ws.criarICP({ produtoId: produto.id, nome: "Executivos", jornada: "b2b", criterios: {}, personas: [], dores: [], sinais: [] });
  const pesquisa = () => ws.criarProspeccao({ produtoId: produto.id, icpId: icp.id, modo: "pessoas", criterios: {}, estado: "executando", etapa: null, erro: null });
  const p1 = pesquisa(), p2 = pesquisa();
  const dados: NovoLeadProspeccao = { prospeccaoId: p1.id, contaId: null, nome: "Ana Silva", cargo: "Gerente", empresa: "Anterior", cidade: null, linkedin: "https://www.linkedin.com/in/ana-silva", avatarUrl: null, fonte: "Fonte anterior", papel: "champion", papelManual: true, fit: "alta", evidencias: [], sinais: [], hipotese: "Hipótese salva", status: "abordado", noCRM: true, pesquisadoEm: "2026-09-20T12:00:00Z", qualidadeDados: 2 };
  const original = salvarPessoaEncontrada(dados)!;
  const abordagem = ws.criarAbordagem({ leadId: original.id, estrategia: { objetivo: "Conversa", gancho: "Programa", dorProvavel: "Hipótese", tom: "Direto", cta: "Pergunta" }, email: { assunto: "Assunto salvo", corpo: "Corpo salvo" }, linkedin: "Mensagem revisada pelo vendedor", whatsapp: "Mensagem salva", variacao: null });
  const novaConta = ws.criarConta({ prospeccaoId: p2.id, nome: "Atual", site: "https://atual.test", setor: null, porte: null, cidade: null, fit: null, evidencias: [], sinais: [], resumo: "", demo: false });
  const novos = { ...dados, prospeccaoId: p2.id, contaId: novaConta.id, cargo: "Diretora", empresa: "Atual", cidade: "São Paulo", linkedin: "https://br.linkedin.com/in/ana-silva/pt?trk=search", avatarUrl: "https://media.licdn.com/ana.jpg", resumoProfissional: "Lidera educação executiva e expansão comercial.", pesquisadoEm: "2026-09-21T12:00:00Z", status: "novo" as const, papel: "decisor" as const, papelManual: false, noCRM: false, fonte: "Bright Data", hipotese: null };
  await t.test("atualiza a mesma ficha e mantém os campos comerciais", () => {
    const r = salvarPessoaEncontrada(novos)!;
    assert.equal(r.id, original.id); assert.equal(r.prospeccaoId, p1.id);
    assert.equal(r.cargo, "Diretora"); assert.equal(r.empresa, "Atual"); assert.equal(r.cidade, "São Paulo");
    assert.equal(r.avatarUrl, novos.avatarUrl); assert.equal(r.resumoProfissional, novos.resumoProfissional);
    assert.equal(r.status, "abordado"); assert.equal(r.papel, "champion"); assert.equal(r.papelManual, true); assert.equal(r.noCRM, true); assert.equal(r.hipotese, "Hipótese salva");
    assert.equal(ws.listarAbordagens(original.id)[0].id, abordagem.id);
    assert.equal(ws.listarAbordagens(original.id)[0].linkedin, "Mensagem revisada pelo vendedor");
    assert.equal(ws.listarLeadsComContexto().leads.find(l => l.id === original.id)!.temAbordagem, true);
    assert.equal(r.criadoEm, original.criadoEm); assert.equal(r.fit, null);
    assert.equal(ws.obterConta(r.contaId!)?.prospeccaoId, p1.id);
    assert.equal(ws.listarLeads().length, 1); assert.equal(ws.obterAndamento(p2.id)!.reencontrados[0].id, original.id);
  });
  await t.test("resposta antiga, fraca ou vazia não desfaz informação confirmada", () => {
    enriquecerLead(original.id, { ...novos, cargo: "Estagiária", empresa: "Anterior", pesquisadoEm: "2026-09-19T12:00:00Z" });
    enriquecerLead(original.id, { ...novos, cargo: "Estagiária", qualidadeDados: 1, pesquisadoEm: "2026-09-22T12:00:00Z" });
    assert.equal(ws.obterLead(original.id)!.pesquisadoEm, "2026-09-21T12:00:00Z", "busca fraca não avança a data de confirmação do perfil");
    enriquecerLead(original.id, { ...novos, cargo: "", empresa: null, cidade: "Não identificado", avatarUrl: "https://wrong.test/avatar" });
    const r = ws.obterLead(original.id)!;
    assert.equal(r.cargo, "Diretora"); assert.equal(r.empresa, "Atual"); assert.equal(r.cidade, "São Paulo"); assert.equal(r.avatarUrl, novos.avatarUrl);
  });
  await t.test("homônimo e prospecção encerrada não alteram a ficha", () => {
    enriquecerLead(original.id, { ...novos, linkedin: "https://www.linkedin.com/in/outra-ana", cargo: "Outro" });
    assert.equal(ws.obterLead(original.id)!.cargo, "Diretora");
    ws.atualizarProspeccao(p2.id, { estado: "cancelada" });
    assert.equal(salvarPessoaEncontrada({ ...novos, cargo: "Cargo tardio" }), null);
    assert.equal(ws.obterLead(original.id)!.cargo, "Diretora");
  });
  await t.test("excluir a pesquisa de reencontro não apaga ficha nem a conta atualizada", () => {
    ws.apagarProspeccao(p2.id);
    const r = ws.obterLead(original.id)!;
    assert.equal(r.empresa, "Atual"); assert.equal(ws.obterConta(r.contaId!)?.nome, "Atual");
  });
  await t.test("lista busca sem acentos, combina filtros e ordena pelo dado pesquisado", () => {
    const r = ws.obterLead(original.id)!;
    const lista: LeadDaLista[] = [{ ...r, prospeccaoNome: "Executivos", site: null }, { ...r, id: "outra", nome: "Bia Costa", empresa: "Outra", status: "novo", pesquisadoEm: "2026-09-23T12:00:00Z", prospeccaoNome: "Outra busca", site: null }];
    const base = { aba: "todos" as const, prospeccaoId: "", fit: "" as const, busca: "sao diretora atual", ordem: "prioridade" as const };
    assert.deepEqual(filtrarLeads(lista, base).map(l => l.id), [r.id]);
    assert.equal(filtrarLeads(lista, { ...base, aba: "novos" }).length, 0);
    assert.equal(filtrarLeads(lista, { ...base, busca: "", ordem: "atualizados" })[0].id, "outra");
  });
  await t.test("mudança confirmada de cargo invalida aderência e evidência antigas sem mudar status", () => {
    ws.atualizarLead(original.id, { fit: "alta", evidencias: [{ criterio: "Cargo", valor: "Diretora", resultado: "atende", trecho: "Diretora" }] });
    const r = enriquecerLead(original.id, { linkedin: dados.linkedin, cargo: "Vice-presidente", pesquisadoEm: "2026-09-24T12:00:00Z", qualidadeDados: 2 })!;
    assert.equal(r.cargo, "Vice-presidente"); assert.equal(r.fit, null); assert.deepEqual(r.evidencias, []);
    assert.equal(r.status, "abordado"); assert.equal(r.papel, "champion");
  });

});

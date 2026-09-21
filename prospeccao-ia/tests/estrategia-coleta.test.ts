import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("estratégia de coleta: dataset, fontes complementares e leitura resiliente", async t => {
  const ambiente = { ...process.env }, pasta = mkdtempSync(path.join(tmpdir(), "coleta-"));
  process.env.DATA_DIR = pasta;
  for (const key of ["PROSPECTHALO_API_KEY", "APOLLO_API_KEY", "BRIGHTDATA_API_KEY", "EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[key];
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const { setConfig } = await import("../lib/store");
  const { combinarResultados } = await import("../lib/descoberta");
  const { filtroPessoas } = await import("../lib/busca-avancada-pessoas");
  const { executarPipeline } = await import("../lib/execucao-prospeccao");
  const { iniciarQualificacaoProfunda, aguardarQualificacao, qualificacaoAtual } = await import("../lib/qualificacao-profunda");
  const ws = await import("../lib/workspace");
  const acoes: string[] = [];
  let falharPerfil = false;
  const conteudo = "Diretora de tecnologia no Brasil. Empresa Exemplo com 100 funcionários. Projeto de expansão em 20/09/2026.";
  t.mock.method(console, "error", () => {});
  t.mock.method(global, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)), body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.hostname === "api.exa.ai") {
      acoes.push(url.pathname === "/contents" ? "exa_read" : "exa_search");
      return Response.json({ results: [{ title: "Exemplo - Tecnologia", url: body.urls?.[0] ?? "https://exemplo.test", text: conteudo }] });
    }
    let result;
    if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "teste", version: "1" } };
    else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    else if (body.method === "tools/list") result = { tools: ["list_dataset_fields", "search_dataset", "search_engine", "scrape_as_markdown", "web_data_linkedin_person_profile"].map(name => ({ name, inputSchema: { type: "object" } })) };
    else {
      const nome = body.params.name; acoes.push(nome);
      if (falharPerfil && nome === "web_data_linkedin_person_profile") return new Response("", { status: 503 });
      const dados = nome === "list_dataset_fields" ? [{ name: "position", type: "text" }, { name: "country_code", type: "text" }]
        : nome === "search_dataset" ? { hits: [{ _source: { name: "Ana Dataset", position: "Diretora", current_company_name: "Exemplo", url: "https://www.linkedin.com/in/ana-dataset", about: conteudo } }] }
        : nome === "search_engine" ? { organic: [{ title: "Bia Web - Diretora - Exemplo", link: "https://www.linkedin.com/in/bia-web", description: conteudo }] }
        : nome === "scrape_as_markdown" ? conteudo : [{ about: conteudo }];
      result = { content: [{ type: "text", text: typeof dados === "string" ? dados : JSON.stringify(dados) }] };
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
  function criar(modo: "pessoas" | "empresas", sinais: string[] = []) {
    const produto = ws.criarProduto({ nome: "Gestão", descricao: "", propostaValor: "Melhorar processos", site: null });
    const icp = ws.criarICP({ produtoId: produto.id, nome: "Diretoras", jornada: "b2b", criterios: {}, personas: [], dores: [], sinais });
    return ws.criarProspeccao({ produtoId: produto.id, icpId: icp.id, modo, criterios: { cargo: "Diretora", localizacao: "Brasil", quantidade: "10" }, estado: "executando", etapa: null, erro: null });
  }
  await t.test("dataset realmente participa do pipeline junto da web", async () => {
    setConfig("BRIGHTDATA_API_KEY", "teste");
    const p = criar("pessoas"); await executarPipeline(p.id);
    const r = ws.obterAndamento(p.id)!;
    assert.deepEqual(r.leads.map(l => l.nome).sort(), ["Ana Dataset", "Bia Web"]);
    assert.ok(acoes.includes("list_dataset_fields")); assert.ok(acoes.includes("search_dataset")); assert.ok(acoes.includes("search_engine"));
    assert.ok(acoes.includes("web_data_linkedin_person_profile")); assert.ok(r.leads.every(l => !l.demo));
  });
  await t.test("campo de filtro indisponível não amplia silenciosamente o dataset", () => {
    assert.equal(filtroPessoas([{ name: "position", type: "text" }], { cargo: "Diretora", localizacao: "Brasil" }), null);
  });
  await t.test("união intercala fontes, preserva evidências e deduplica URLs de rastreamento", () => {
    const item = (url: string, resumo: string, fonte: string) => ({ titulo: resumo, url, resumo, fontes: [fonte] });
    const r = combinarResultados([
      [item("https://www.exemplo.test/a?utm_source=exa", "Primeira evidência", "exa"), item("https://exemplo.test/b", "Segunda", "exa")],
      [item("https://outra.test/c", "Terceira", "tavily"), item("https://exemplo.test/a/", "Evidência complementar", "tavily")],
    ]);
    assert.equal(r.length, 3); assert.equal(r[1].url, "https://outra.test/c");
    assert.deepEqual(r[0].fontes, ["exa", "tavily"]); assert.match(r[0].resumo, /complementar/);
  });
  await t.test("etapa de sinais executa pesquisa complementar com origem verificável", async () => {
    setConfig("BRIGHTDATA_API_KEY", null); setConfig("EXA_API_KEY", "teste"); acoes.length = 0;
    const p = criar("empresas", ["expansão"]); await executarPipeline(p.id);
    const r = ws.obterAndamento(p.id)!;
    assert.ok(acoes.filter(a => a === "exa_search").length >= 2);
    assert.ok(r.contas.some(c => c.sinais.some(s => s.tipo === "sinal" && s.origem === "https://exemplo.test/" || s.origem === "https://exemplo.test")));
  });
  await t.test("falha do perfil Bright Data continua pela Exa na qualificação profunda", async () => {
    setConfig("BRIGHTDATA_API_KEY", "teste"); setConfig("EXA_API_KEY", "teste"); falharPerfil = true; acoes.length = 0;
    const p = criar("pessoas");
    const lead = ws.criarLead({ prospeccaoId: p.id, contaId: null, nome: "Ana", cargo: "Diretora", empresa: "Exemplo", cidade: null, linkedin: "https://www.linkedin.com/in/ana-nova/", fonte: "Pesquisa", papel: "decisor", fit: null, evidencias: [], sinais: [], hipotese: null, status: "pesquisado", noCRM: false, demo: false });
    iniciarQualificacaoProfunda(lead.id); await aguardarQualificacao(lead.id);
    const r = qualificacaoAtual(lead.id)!;
    assert.ok(acoes.includes("web_data_linkedin_person_profile")); assert.ok(acoes.includes("exa_read"));
    assert.ok(r.fontes.some(f => f.url === lead.linkedin && f.texto === conteudo));
    assert.match(r.erro || "", /Conecte a IA/);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ResultadoBuscaWeb } from "../lib/descoberta";
import { avaliarVinculoEmpresa, mesmaEmpresa } from "../lib/vinculo-empresa";
import { consultaPessoas } from "../lib/consulta-pessoas";
import { perfilLinkedin } from "../lib/perfil-linkedin";

test("empresa alvo: vínculo atual exige evidência própria do perfil", () => {
  const item = (titulo: string, resumo = ""): ResultadoBuscaWeb => ({ titulo, resumo, url: "https://www.linkedin.com/in/ana-silva" });
  for (const titulo of ["Ana Silva - Diretora - StartSe | LinkedIn", "Ana Silva - StartSe", "Ana Silva - Diretora de marketing na StartSe"])
    assert.equal(avaliarVinculoEmpresa(item(titulo), "StartSe").estado, "confirmado");
  for (const r of [
    item("Ana Silva - Diretora - Outra", "Formação na StartSe"),
    item("Ana Silva - Ex-diretora da StartSe", "Hoje lidera outra empresa."),
    item("Ana Silva - Aluna da StartSe"),
    item("Ana Silva - Diretora - StartSe Ventures"),
    item("Ana Silva", "Experiência: StartSe, 2018–2020. Educação: StartSe."),
    { ...item("Ana Silva - Diretora - StartSe"), pessoa: { nome: "Ana Silva", cargo: "Diretora", empresa: "Outra", cidade: "", site: "" } },
    { ...item("Ana Silva - Diretora - StartSe"), conteudoPerfilAtual: 'Empresa atual: Outra\nDiretora de marketing' },
    { ...item("Ana Silva - Diretora - StartSe"), conteudoPerfilAtual: '[{"current_company_name":"Outra","about":"Curso na StartSe"}]' },
  ]) assert.notEqual(avaliarVinculoEmpresa(r, "StartSe").estado, "confirmado", JSON.stringify(r));
  assert.equal(mesmaEmpresa("STARTSE LTDA.", "StartSe"), true);
  assert.equal(mesmaEmpresa("StartSe Ventures", "StartSe"), false);
});

test("consultas preservam a empresa e adaptam a linguagem ao fornecedor", () => {
  const c = { empresa: "StartSe", cargo: "diretor ou gerente" };
  assert.equal(consultaPessoas(c, "web"), 'site:linkedin.com/in "StartSe" ("diretor" OR "gerente")');
  assert.match(consultaPessoas(c, "semantica"), /trabalham atualmente na empresa "StartSe"/);
  assert.equal(consultaPessoas(c, "web", undefined, true), 'site:linkedin.com/in "StartSe"');
});

test("endereços regionais e versões de idioma representam a mesma pessoa", () => {
  const alvo = "https://www.linkedin.com/in/ana-silva";
  assert.equal(perfilLinkedin("https://br.linkedin.com/in/ana-silva/pt?trk=public"), alvo);
  assert.equal(perfilLinkedin(`${alvo}/en`), alvo);
  assert.equal(perfilLinkedin(`${alvo}/details/experience`), null);
  assert.equal(perfilLinkedin("https://linkedin.com.evil.test/in/ana-silva"), null);
});

test("regressão: explorar StartSe nunca preenche vagas com pessoas de outras empresas", { timeout: 20000 }, async t => {
  const ambiente = { ...process.env }, pasta = mkdtempSync(path.join(tmpdir(), "empresa-alvo-"));
  process.env.DATA_DIR = pasta;
  for (const k of ["EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "BRIGHTDATA_API_KEY", "PROSPECTHALO_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[k];
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const ws = await import("../lib/workspace");
  const { setConfig, abrirBanco } = await import("../lib/store");
  const { executarPipeline } = await import("../lib/execucao-prospeccao");
  const { lerFonte } = await import("../lib/pesquisa-fontes");
  setConfig("EXA_API_KEY", "teste-empresa-alvo");
  let cenario = "mistura";
  const leituras: string[] = [], consultas: { query: string; category?: string }[] = [];
  const url = (tipo: string, i: number) => `https://www.linkedin.com/in/${cenario}-${tipo}-${i}`;
  const corretos = () => Array.from({ length: 5 }, (_, i) => ({ title: `Pessoa de Teste ${i} - Diretora - StartSe`, url: url("correto", i), text: "Diretora na StartSe, Brasil. Responsável pelas operações de educação executiva e pelos projetos de expansão." }));
  const errados = () => Array.from({ length: 5 }, (_, i) => ({ title: `Pessoa de Outra Empresa ${i} - Executive Leader - Outra Empresa`, url: url("errado", i), text: "Executiva de outra organização. Cursos de educação executiva na StartSe." }));
  const texto = (nome: string, empresa = "StartSe") => `Nome: ${nome}\nEmpresa atual: ${empresa}\nDiretora de operações no Brasil. ${"Lidera programas de capacitação profissional, coordena equipes e projetos comerciais com os clientes da empresa. ".repeat(3)}`;
  t.mock.method(global, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const endpoint = new URL(String(input)), body = JSON.parse(String(init?.body || "{}"));
    assert.equal(endpoint.hostname, "api.exa.ai");
    if (endpoint.pathname === "/contents") {
      const alvo = body.urls[0]; leituras.push(alvo);
      if (alvo.includes("startse.test")) return Response.json({ results: [{ url: alvo, text: "StartSe, escola de negócios e educação executiva no Brasil." }] });
      if (cenario === "identidade") return Response.json({ results: [{ url: url("outra-pessoa", 0), text: texto("Outra pessoa") }] });
      return Response.json({ results: [{ url: alvo, text: texto("Pessoa de Teste", cenario === "mudou" && alvo.includes("antigo") ? "Outra Empresa" : "StartSe") }] });
    }
    consultas.push(body);
    if (body.query.includes("site institucional")) return Response.json({ results: [{ title: "StartSe", url: "https://startse.test", text: "StartSe, escola de negócios." }] });
    let results: ReturnType<typeof corretos>;
    if (cenario === "vazio") results = errados();
    else if (cenario === "fallback") results = body.query.trim() === '"StartSe"' ? corretos() : errados();
    else if (cenario === "mudou") results = body.query.trim() === '"StartSe"' ? corretos() : corretos().map(r => ({ ...r, url: r.url.replace("correto", "antigo") }));
    else results = [...errados(), ...corretos()];
    return Response.json({ results });
  });
  function base() {
    const produto = ws.criarProduto({ nome: "Impulso", descricao: "", propostaValor: "Capacitação", site: null });
    const icp = ws.criarICP({ produtoId: produto.id, nome: "Educação executiva", jornada: "b2b", criterios: {}, personas: [], dores: [], sinais: [] });
    return { produtoId: produto.id, icpId: icp.id };
  }
  async function executar(ids = base()) {
    const p = ws.criarProspeccao({ ...ids, modo: "empresa_unica", criterios: { empresaNome: "StartSe" }, estado: "executando", etapa: null, erro: null });
    await executarPipeline(p.id); return ws.obterAndamento(p.id)!;
  }
  await t.test("recupera cinco corretos depois de cinco irrelevantes sem enriquecer os errados", async () => {
    const r = await executar();
    assert.equal(r.leads.length, 5);
    assert.ok(r.leads.every(l => l.empresa === "StartSe" && l.linkedin?.includes("correto")));
    assert.ok(leituras.every(l => !l.includes("errado")));
    assert.equal(r.candidatos.length, 0);
    assert.ok(consultas.some(c => c.category === "people"));
    assert.ok(consultas.some(c => !c.category && c.query.includes('"StartSe"')));
  });
  await t.test("retorno irrelevante da primeira estratégia recupera pessoas na busca focada", async () => {
    cenario = "fallback"; leituras.length = 0;
    const r = await executar();
    assert.equal(r.leads.length, 5);
    assert.ok(leituras.every(l => !l.includes("errado")));
  });
  await t.test("mudança de empresa descoberta no perfil descarta o título antigo e continua buscando", async () => {
    cenario = "mudou";
    setConfig("EXA_TETO_CONSULTAS", "20");
    const r = await executar();
    assert.equal(r.leads.length, 5);
    assert.ok(r.leads.every(l => l.linkedin?.includes("correto")));
    assert.ok(r.candidatos.every(c => !c.url.includes("antigo")));
    setConfig("EXA_TETO_CONSULTAS", null);
  });
  await t.test("não havendo vínculo, mantém zero pessoas em vez de completar a quantidade", async () => {
    cenario = "vazio"; leituras.length = 0;
    const r = await executar();
    assert.equal(r.leads.length, 0); assert.equal(r.candidatos.length, 0);
    assert.ok(leituras.every(l => !l.includes("linkedin")));
  });
  await t.test("repetir reconhece os mesmos contatos sem duplicação nem mudança comercial", async () => {
    cenario = "repetida"; const ids = base();
    const primeira = await executar(ids);
    ws.atualizarLead(primeira.leads[0].id, { status: "selecionado", cargo: null });
    const segunda = await executar(ids);
    assert.equal(segunda.leads.length, 0); assert.equal(segunda.reencontrados.length, 5);
    assert.equal(ws.leadsDoProduto(ids.produtoId).length, 5);
    assert.equal(ws.obterLead(primeira.leads[0].id)!.status, "selecionado");
    assert.equal(ws.obterLead(primeira.leads[0].id)!.cargo, "Diretora");
    assert.ok(ws.obterLead(primeira.leads[0].id)!.resumoProfissional);
    assert.equal(segunda.candidatos.length, 0);
    ws.apagarProspeccao(primeira.prospeccao.id);
    assert.equal(ws.obterAndamento(segunda.prospeccao.id)!.reencontrados.length, 0);
  });
  await t.test("leitura de outro LinkedIn não é anexada ao perfil solicitado", async () => {
    cenario = "identidade";
    await assert.rejects(lerFonte("exa", url("correto", 0)), /não conseguiu ler/);
  });
  await t.test("dataset filtra empresa e Person Profile revê o vínculo mesmo com perfil detalhado", async () => {
    cenario = "dataset";
    setConfig("EXA_API_KEY", null); setConfig("BRIGHTDATA_API_KEY", "teste-empresa-dataset");
    const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
    let contradizer = true, externas = 0;
    const registro = (i: number, empresa = "StartSe") => ({ name: `Pessoa Dataset ${i}`, url: url("correto", i), position: "Diretora", current_company_name: empresa, about: texto(`Pessoa Dataset ${i}`, empresa) });
    abrirBanco().prepare("INSERT INTO cache_paginas (url, conteudo, lido_em) VALUES (?, ?, ?)").run(url("correto", 0), JSON.stringify([{ ...registro(0), about: texto("Pessoa Dataset 0").repeat(50) }]).slice(0, 8000), new Date().toISOString());
    const mock = t.mock.method(global, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(_input)).hostname !== "mcp.brightdata.com") { externas++; throw new Error("Fonte alternativa desnecessária"); }
      const body = JSON.parse(String(init?.body || "{}"));
      let result: unknown;
      if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "teste", version: "1" } };
      else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      else if (body.method === "tools/list") result = { tools: ["search_engine", "scrape_as_markdown", "list_dataset_fields", "search_dataset", "web_data_linkedin_person_profile"].map(name => ({ name, inputSchema: { type: "object" } })) };
      else {
        const nome = body.params.name, args = body.params.arguments; chamadas.push({ nome, args });
        let dados: unknown;
        if (nome === "list_dataset_fields") dados = [{ name: "current_company_name", type: "text" }];
        else if (nome === "search_dataset") dados = { hits: [registro(9, "Outra Empresa"), ...Array.from({ length: 5 }, (_, i) => registro(i))] };
        else if (nome === "web_data_linkedin_person_profile") {
          const i = Number(String(args.url).split("-").at(-1));
          dados = [{ ...registro(i, i === 0 && contradizer ? "Outra Empresa" : "StartSe"), about: texto(`Pessoa Dataset ${i}`).repeat(50) }];
        } else if (nome === "scrape_as_markdown") dados = "StartSe, escola de negócios e educação executiva.";
        else dados = { organic: String(args.query).includes("site institucional") ? [{ title: "StartSe", link: "https://dataset.startse.test", description: "StartSe, escola de negócios." }] : [] };
        result = { content: [{ type: "text", text: typeof dados === "string" ? dados : JSON.stringify(dados) }] };
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    });
    try {
      const r = await executar();
      assert.equal(r.leads.length, 4);
      assert.ok(r.leads.every(l => l.empresa === "StartSe" && !l.linkedin?.endsWith("-0")));
      assert.deepEqual(chamadas.find(c => c.nome === "search_dataset")?.args.filter, { name: "current_company_name", operator: "includes", value: "StartSe" });
      assert.equal(chamadas.filter(c => c.nome === "web_data_linkedin_person_profile").length, 5);
      assert.ok(!chamadas.some(c => c.nome === "web_data_linkedin_person_profile" && String(c.args.url).endsWith("-9")));
      assert.ok(r.candidatos.every(c => !c.url.endsWith("-0") && !c.url.endsWith("-9")));
      cenario = "dataset-suficiente"; contradizer = false; chamadas.length = 0;
      for (const chave of ["EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "PROSPECTHALO_API_KEY"]) setConfig(chave, "alternativa-conectada");
      const suficiente = await executar();
      assert.equal(suficiente.leads.length, 5);
      assert.equal(externas, 0, "Bright Data suficiente não consulta fornecedores alternativos");
      assert.ok(chamadas.some(c => c.nome === "search_dataset"));
      assert.ok(chamadas.some(c => c.nome === "search_engine"));
      assert.equal(chamadas.filter(c => c.nome === "web_data_linkedin_person_profile").length, 5);
    } finally { mock.mock.restore(); for (const chave of ["BRIGHTDATA_API_KEY", "EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "PROSPECTHALO_API_KEY"]) setConfig(chave, null); }
  });
});

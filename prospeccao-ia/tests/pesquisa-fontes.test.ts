import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("fontes opcionais e integração com a prospecção", async t => {
  const pasta = mkdtempSync(path.join(tmpdir(), "pesquisa-fontes-"));
  const ambiente = { ...process.env };
  process.env.DATA_DIR = pasta;
  for (const chave of ["EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "APOLLO_API_KEY", "PROSPECTHALO_API_KEY", "BRIGHTDATA_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[chave];
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const { setConfig } = await import("../lib/store");
  const { buscarFonte, lerFonte, ErroFonte } = await import("../lib/pesquisa-fontes");
  const { buscarNaWeb, lerPagina, descobertaAtiva, listarAcoesPesquisa, executarAcaoPesquisa } = await import("../lib/descoberta");
  const { consultasDaProspeccao } = await import("../lib/pesquisa-registro");
  const { INTEGRACOES } = await import("../lib/integracoes");
  const { statusIntegracoes, lerConfig } = await import("../lib/setup-comum");
  const ws = await import("../lib/workspace");
  const { executarPipeline } = await import("../lib/execucao-prospeccao");
  const chamadas: { url: URL; body: Record<string, unknown>; headers: Headers }[] = [];
  const falhas: Record<string, number> = {};
  const vazios = new Set<string>();
  let invalido = false;
  let rede = false;
  let indicePessoa = 0;
  const urlPerfil = () => `https://www.linkedin.com/in/pessoa-teste-${indicePessoa}`;
  const texto = "Diretor em São Paulo, Brasil. Lidera projetos de tecnologia e inteligência artificial em empresas brasileiras.";
  t.mock.method(console, "error", () => {});
  t.mock.method(global, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const fonte = url.hostname.includes("exa") ? "exa" : url.hostname.includes("tavily") ? "tavily" : url.hostname.includes("searchapi") ? "searchapi" : url.hostname.includes("apollo") ? "apollo" : "brightdata";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const headers = new Headers(init?.headers);
    chamadas.push({ url, body, headers });
    if (rede) throw new DOMException("Timeout com segredo-teste", "TimeoutError");
    if (falhas[fonte]) return new Response("segredo-teste não deve aparecer na mensagem", { status: falhas[fonte] });
    if (invalido) return Response.json({ inesperado: "segredo-teste" });
    if (fonte === "apollo") return Response.json({ people: [] });
    if (fonte === "brightdata") {
      let result;
      if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "teste", version: "1" } };
      else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      else if (body.method === "tools/list") result = { tools: [{ name: "search_engine", inputSchema: { type: "object" } }, { name: "scrape_as_markdown", inputSchema: { type: "object" } }] };
      else result = { content: [{ type: "text", text: JSON.stringify({ organic: vazios.has(fonte) ? [] : [{ title: "Pessoa Teste - Diretor - Empresa | LinkedIn", link: urlPerfil(), description: texto }] }) }] };
      return Response.json({ jsonrpc: "2.0", id: body.id, result }, { headers: { "Mcp-Session-Id": "teste" } });
    }
    assert.ok(init?.signal);
    assert.equal(url.searchParams.has("api_key"), false);
    assert.equal(headers.get(fonte === "exa" ? "x-api-key" : "authorization"), fonte === "exa" ? "segredo-teste" : "Bearer segredo-teste");
    const resultados = vazios.has(fonte) ? [] : [{ title: "Pessoa Teste - Diretor - Empresa | LinkedIn", url: urlPerfil(), text: texto, raw_content: texto, content: texto, link: urlPerfil(), snippet: texto }];
    return Response.json(fonte === "searchapi" ? { organic_results: resultados } : { results: resultados });
  });
  function conectar(...fontes: string[]) {
    for (const f of ["exa", "tavily", "searchapi", "apollo", "brightdata"]) setConfig(`${f.toUpperCase()}_API_KEY`, fontes.includes(f) ? "segredo-teste" : null);
    chamadas.length = 0;
    for (const f of Object.keys(falhas)) delete falhas[f];
    vazios.clear(); invalido = false; rede = false;
  }
  await t.test("configuração opcional, segredo mascarado e teste de cada fonte", async () => {
    conectar("exa", "tavily", "searchapi");
    const status = await statusIntegracoes(INTEGRACOES);
    assert.equal(JSON.stringify(status).includes("segredo-teste"), false);
    for (const id of ["exa", "tavily", "searchapi"]) {
      const integracao = INTEGRACOES.find(i => i.id === id)!;
      assert.equal(integracao.obrigatoria, false);
      assert.equal(status.integracoes.find(i => i.id === id)?.configurada, true);
      assert.equal((await integracao.testar!(lerConfig(integracao))).ok, true);
    }
    assert.equal(chamadas[0].body.type, "deep");
    assert.equal(chamadas[1].body.search_depth, "advanced");
    assert.equal(chamadas[2].url.searchParams.get("engine"), "google");
  });
  await t.test("cada provedor funciona sozinho e nunca usa demo", async () => {
    for (const fonte of ["exa", "tavily", "searchapi"]) {
      conectar(fonte);
      assert.equal(descobertaAtiva(), true);
      const resultado = await buscarNaWeb("site:linkedin.com/in Diretor Brasil", 0, `so-${fonte}`);
      assert.equal(resultado.demo, false); assert.equal(resultado.itens.length, 1);
      assert.equal(consultasDaProspeccao(`so-${fonte}`)[0].fonte, fonte);
    }
  });
  await t.test("Exa vazio → Bright Data falha → Tavily vazio → SearchAPI encontra", async () => {
    conectar("exa", "brightdata", "tavily", "searchapi");
    vazios.add("exa"); vazios.add("tavily"); falhas.brightdata = 401;
    const r = await buscarNaWeb("site:linkedin.com/in Diretor Brasil", 0, "fallback");
    assert.equal(r.itens.length, 1);
    const registros = consultasDaProspeccao("fallback");
    assert.deepEqual(registros.map(r => r.fonte), ["exa", "brightdata", "tavily", "searchapi"]);
    assert.deepEqual(registros.map(r => r.estado), ["vazia", "falhou", "vazia", "concluida"]);
    assert.equal(JSON.stringify(registros).includes("segredo-teste"), false);
  });
  await t.test("todas vazias diferem de autenticação, limite, rede e resposta inválida", async () => {
    conectar("exa", "tavily", "searchapi");
    for (const f of ["exa", "tavily", "searchapi"]) vazios.add(f);
    await assert.rejects(buscarNaWeb("consulta"), { codigo: "sem_resultado" });
    for (const status of [401, 429, 503]) {
      conectar("exa"); falhas.exa = status;
      await assert.rejects(buscarNaWeb("consulta"), e => e instanceof Error && !e.message.includes("segredo-teste"));
    }
    conectar("exa"); invalido = true;
    await assert.rejects(buscarFonte("exa", "consulta"), ErroFonte);
    invalido = false; rede = true;
    await assert.rejects(buscarFonte("exa", "consulta"), /não respondeu a tempo/);
  });
  await t.test("limite por fonte impede cobrança adicional e tenta outra", async () => {
    conectar("exa", "tavily"); setConfig("EXA_TETO_CONSULTAS", "1");
    await buscarNaWeb("consulta", 0, "limite");
    await buscarNaWeb("outra consulta", 0, "limite");
    assert.equal(chamadas.filter(c => c.url.hostname === "api.exa.ai").length, 1);
    assert.equal(chamadas.filter(c => c.url.hostname === "api.tavily.com").length, 2);
    assert.equal(consultasDaProspeccao("limite").some(c => c.estado === "limite"), true);
    setConfig("EXA_TETO_CONSULTAS", null);
  });
  await t.test("modos configurados e paginação respeitam capacidades", async () => {
    conectar("exa", "tavily", "searchapi");
    await buscarFonte("exa", "site:linkedin.com/in Diretor", 0, { EXA_TIPO_BUSCA: "deep-reasoning" });
    assert.equal(chamadas[0].body.type, "deep-reasoning");
    assert.deepEqual(chamadas[0].body.includeDomains, ["linkedin.com/in"]);
    await buscarFonte("tavily", "Diretor", 2);
    assert.equal(chamadas.length, 1);
    await buscarFonte("searchapi", "Diretor", 2);
    assert.equal(chamadas[1].url.searchParams.get("page"), "3");
  });
  await t.test("leitura sem Bright Data via Exa/Tavily, sem leitura não inventa conteúdo", async () => {
    for (const fonte of ["exa", "tavily"] as const) {
      conectar(fonte);
      assert.equal(await lerFonte(fonte, urlPerfil()), texto);
      const r = await lerPagina(`https://example.com/${fonte}`, "leitura");
      assert.equal(r.demo, false); assert.equal(r.conteudo, texto);
    }
    conectar("searchapi");
    await assert.rejects(lerPagina("https://example.com/sem-leitura"), /Conecte uma fonte de leitura/);
    const r = await lerPagina("https://example.com/trecho", undefined, "Trecho público da busca");
    assert.equal(r.demo, false); assert.equal(r.conteudo, "Trecho público da busca");
  });
  await t.test("ações opcionais ficam disponíveis para o assistente sem Bright Data", async () => {
    conectar("exa", "tavily", "searchapi");
    const nomes = (await listarAcoesPesquisa()).map(a => a.nome);
    assert.deepEqual(nomes, ["exa_search", "exa_read", "tavily_search", "tavily_read", "searchapi_search"]);
    const r = await executarAcaoPesquisa("exa_search", { consulta: "Diretor" }, "acao") as unknown[];
    assert.equal(r.length, 1);
    await assert.rejects(executarAcaoPesquisa("exa_search", { consulta: "Diretor", pagina: -1 }));
    assert.equal(chamadas.length, 1);
  });
  async function executar(jornada: "b2b" | "b2c" = "b2b", modo: "pessoas" | "empresas" = "pessoas") {
    indicePessoa++;
    const p = ws.criarProduto({ nome: "Produto teste", descricao: "", site: null, propostaValor: "Gestão" });
    const icp = ws.criarICP({ produtoId: p.id, nome: "Diretores", jornada, criterios: {}, personas: [], dores: [], sinais: [] });
    const prospeccao = ws.criarProspeccao({ produtoId: p.id, icpId: icp.id, modo, criterios: { cargo: "Diretor", ocupacao: "Diretor", localizacao: "Brasil" }, estado: "executando", etapa: null, erro: null });
    await executarPipeline(prospeccao.id);
    return ws.obterAndamento(prospeccao.id)!;
  }
  await t.test("pipeline cria leads reais com cada alternativa; B2C usa leitura", async () => {
    for (const fonte of ["exa", "tavily", "searchapi"]) {
      conectar(fonte);
      const r = await executar();
      assert.equal(r.prospeccao.estado, "pronta"); assert.equal(r.leads.length, 1);
      assert.equal(r.leads[0].demo, false);
    }
    conectar("tavily");
    const r = await executar("b2c");
    assert.equal(r.leads.length, 1); assert.equal(r.leads[0].demo, false);
  });
  await t.test("Apollo salva é ignorada; falha real e busca vazia continuam distintas", async () => {
    conectar("apollo", "exa");
    let r = await executar();
    assert.equal(r.leads.length, 1);
    assert.equal(r.consultas.some(c => c.fonte === "apollo"), false);
    assert.equal(chamadas.some(c => c.url.hostname.includes("apollo")), false);
    falhas.exa = 429;
    r = await executar();
    assert.equal(r.prospeccao.estado, "falhou"); assert.equal(r.leads.length, 0);
    conectar("exa"); vazios.add("exa");
    r = await executar();
    assert.equal(r.prospeccao.estado, "pronta"); assert.equal(r.prospeccao.erro, null);
    assert.equal(r.leads.length, 0);
    r = await executar("b2b", "empresas");
    assert.equal(r.prospeccao.estado, "pronta");
  });
  await t.test("todas as fontes conectadas participam mesmo quando a primeira encontra", async () => {
    conectar("exa", "tavily", "searchapi");
    const r = await buscarNaWeb("site:linkedin.com/in Diretor", 0, "complementares");
    assert.equal(r.itens.length, 1);
    assert.deepEqual(r.itens[0].fontes, ["exa", "tavily", "searchapi"]);
    assert.deepEqual(consultasDaProspeccao("complementares").map(c => c.fonte), ["exa", "tavily", "searchapi"]);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ResultadoBuscaWeb } from "../lib/descoberta";

test("enriquecimento por perfil e busca nominal", async t => {
  const ambiente = { ...process.env };
  const pasta = mkdtempSync(path.join(tmpdir(), "pesquisa-nominal-"));
  process.env.DATA_DIR = pasta;
  for (const key of ["BRIGHTDATA_API_KEY", "EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "PROSPECTHALO_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[key];
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const { setConfig } = await import("../lib/store");
  const { completarPerfis, incorporarBuscaNominal } = await import("../lib/pesquisa-perfis");
  const { decisoesDaPesquisa } = await import("../lib/pesquisa-registro");
  const acoes = ["web_data_linkedin_person_profile", "scrape_as_markdown", "search_engine"].map(nome => ({ nome, schema: { type: "object", properties: { url: { type: "string" }, query: { type: "string" } } } }));
  const bio = "Ana Silva é diretora de marketing na Exemplo. Lidera programas de educação executiva, coordena campanhas para novos cursos e organiza projetos de expansão com as equipes de vendas. Publicou sua experiência em operações comerciais e lançamentos de programas de capacitação profissional.";
  const item = (id: string): ResultadoBuscaWeb => ({ titulo: "Ana Silva - Diretora de marketing - Exemplo", url: `https://www.linkedin.com/in/${id}`, resumo: "Diretora de marketing na Exemplo", fontes: ["prospecthalo"], pessoa: { nome: "Ana Silva", cargo: "Diretora de marketing", empresa: "Exemplo", cidade: "São Paulo", site: "https://exemplo.test" } });
  let modo: "rico" | "raso" | "homonimo" = "rico", buscaVazia = false, falhaBusca = false, cancelar = false, cancelarAoLer = false;
  let alvo = item("ana-rica");
  const chamadas: { acao: string; consulta?: string }[] = [];
  function configurar(...fontes: string[]) {
    for (const fonte of ["brightdata", "exa", "tavily", "searchapi"]) setConfig(`${fonte.toUpperCase()}_API_KEY`, fontes.includes(fonte) ? "teste-nominal" : null);
    chamadas.length = 0; buscaVazia = false; falhaBusca = false; cancelar = false; cancelarAoLer = false;
  }
  t.mock.method(global, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)), body = JSON.parse(String(init?.body || "{}"));
    if (url.hostname !== "mcp.brightdata.com") {
      const fonte = url.hostname === "api.exa.ai" ? "exa" : url.hostname === "api.tavily.com" ? "tavily" : "searchapi";
      const leitura = url.pathname === "/contents" || url.pathname === "/extract";
      chamadas.push({ acao: `${fonte}_${leitura ? "read" : "search"}`, consulta: body.query || url.searchParams.get("q") || undefined });
      const resultados = buscaVazia && !leitura ? [] : [{ title: alvo.titulo, url: alvo.url, link: alvo.url, text: leitura ? "Sem contexto adicional" : bio, raw_content: leitura ? "Sem contexto adicional" : bio, snippet: bio }];
      return Response.json(fonte === "searchapi" ? { organic_results: resultados } : { results: resultados });
    }
    let result: unknown;
    if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "teste", version: "1" } };
    else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    else if (body.method === "tools/list") result = { tools: acoes.map(a => ({ name: a.nome, inputSchema: a.schema })) };
    else {
      const acao = body.params.name;
      chamadas.push({ acao, consulta: body.params.arguments.query });
      if (acao === "search_engine" && falhaBusca) return new Response(null, { status: 503 });
      if (acao === "web_data_linkedin_person_profile" && cancelarAoLer) cancelar = true;
      const dados = acao === "search_engine" ? { organic: buscaVazia ? [] : [
        { title: alvo.titulo, link: "https://www.linkedin.com/in/homonima", description: "Informação de outra Ana Silva." },
        { title: alvo.titulo, link: alvo.url + "/?trk=busca", description: bio },
      ] } : [{ name: "Ana Silva", position: "Diretora de marketing", current_company_name: "Exemplo", url: modo === "homonimo" ? "https://www.linkedin.com/in/outra-ana" : body.params.arguments.url, ...(modo === "rico" ? { about: bio } : {}) }];
      result = { content: [{ type: "text", text: JSON.stringify(dados) }] };
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });

  await t.test("nome, cargo e empresa preenchidos ainda recebem contexto do Person Profile", async () => {
    configurar("brightdata", "searchapi"); modo = "rico"; alvo = item("ana-rica");
    await completarPerfis([alvo], "rica", acoes, () => false);
    assert.deepEqual(chamadas.map(c => c.acao), ["web_data_linkedin_person_profile"]);
    assert.ok(alvo.conteudoPerfil?.includes(bio)); assert.equal(alvo.pessoa?.cidade, "São Paulo"); assert.equal(alvo.pessoa?.site, "https://exemplo.test");
    await completarPerfis([alvo], "rica", acoes, () => false);
    assert.equal(chamadas.length, 1, "não repete enriquecimento do mesmo candidato");
  });
  await t.test("perfil raso aciona nome completo + LinkedIn e para após complemento útil", async () => {
    configurar("brightdata", "exa", "searchapi"); modo = "raso"; alvo = item("ana-rasa");
    await completarPerfis([alvo], "rasa", acoes, () => false);
    assert.deepEqual(chamadas.map(c => c.acao), ["web_data_linkedin_person_profile", "search_engine"]);
    assert.equal(chamadas[1].consulta, '"Ana Silva" "linkedin.com/in/ana-rasa"');
    assert.ok(alvo.conteudoPerfil?.includes(bio)); assert.ok(!alvo.conteudoPerfil?.includes("outra Ana"));
    assert.deepEqual(alvo.fontes, ["prospecthalo", "brightdata"]);
    assert.ok(decisoesDaPesquisa("rasa").some(d => /nome completo e o link do LinkedIn/.test(d.mensagem)));
  });
  await t.test("falha da busca Bright Data usa SearchAPI com a mesma identidade", async () => {
    configurar("brightdata", "searchapi"); modo = "raso"; falhaBusca = true; alvo = item("ana-alternativa");
    await completarPerfis([alvo], "alternativa", acoes, () => false);
    assert.deepEqual(chamadas.map(c => c.acao), ["web_data_linkedin_person_profile", "search_engine", "searchapi_search"]);
    assert.equal(chamadas[1].consulta, chamadas[2].consulta); assert.ok(alvo.fontes?.includes("searchapi"));
    assert.ok(alvo.conteudoPerfil?.includes(bio));
  });
  await t.test("SearchAPI sozinho complementa sem exigir uma fonte de leitura", async () => {
    configurar("searchapi"); alvo = item("ana-searchapi");
    await completarPerfis([alvo], "searchapi", [], () => false);
    assert.deepEqual(chamadas.map(c => c.acao), ["searchapi_search"]);
    assert.ok(alvo.conteudoPerfil?.includes(bio));
  });
  await t.test("buscas nominais respeitam o teto de duas tentativas", async () => {
    configurar("brightdata", "exa", "tavily", "searchapi"); modo = "raso"; buscaVazia = true; alvo = item("ana-vazia");
    await completarPerfis([alvo], "vazia", acoes, () => false);
    assert.deepEqual(chamadas.filter(c => c.acao === "search_engine" || c.acao.endsWith("_search")).map(c => c.acao), ["search_engine", "exa_search"]);
    assert.equal(alvo.pessoa?.cargo, "Diretora de marketing");
  });
  await t.test("perfil detalhado vindo do dataset também recebe leitura pelo Person Profile", async () => {
    configurar("brightdata"); modo = "rico"; alvo = item("ana-dataset-rico");
    const contextoAnterior = "Histórico profissional encontrado no dataset. ".repeat(4);
    alvo.conteudoPerfil = JSON.stringify({ name: "Ana Silva", url: alvo.url, about: contextoAnterior });
    await completarPerfis([alvo], "dataset-rico", acoes, () => false);
    assert.deepEqual(chamadas.map(c => c.acao), ["web_data_linkedin_person_profile"]);
    assert.ok(alvo.conteudoPerfil?.includes(contextoAnterior));
    assert.ok(alvo.conteudoPerfil?.includes(bio));
    assert.equal(alvo.perfilPesquisado, true);
  });
  await t.test("leitura de perfil já feita é reaproveitada do cache em outra prospecção", async () => {
    configurar("brightdata"); modo = "rico"; alvo = item("ana-cache");
    await completarPerfis([alvo], "cache", acoes, () => false);
    assert.deepEqual(chamadas.map(c => c.acao), ["web_data_linkedin_person_profile"]);
    chamadas.length = 0;
    alvo = item("ana-cache");
    await completarPerfis([alvo], "outro-cache", acoes, () => false);
    assert.equal(chamadas.length, 0);
    assert.ok(alvo.conteudoPerfil?.includes(bio));
  });
  await t.test("contexto completo é preservado quando a action não está disponível", async () => {
    configurar("searchapi"); alvo = item("ana-sem-action");
    alvo.conteudoPerfil = JSON.stringify({ name: "Ana Silva", url: alvo.url, about: bio });
    await completarPerfis([alvo], "sem-action", [], () => false);
    assert.equal(chamadas.length, 0);
    assert.ok(alvo.conteudoPerfil.includes(bio));
  });
  await t.test("perfil de empresa não aciona Person Profile só por ter contexto completo", async () => {
    configurar("brightdata"); alvo = { ...item("ana-empresa"), url: "https://www.linkedin.com/company/exemplo" };
    alvo.conteudoPerfil = JSON.stringify({ about: bio });
    await completarPerfis([alvo], "empresa", acoes, () => false);
    assert.equal(chamadas.length, 0);
  });
  await t.test("homônimos, prefixos de URL e páginas sem vínculo não contaminam o perfil", () => {
    const pessoa = item("ana-identidade");
    assert.equal(incorporarBuscaNominal(pessoa, [
      { ...pessoa, url: pessoa.url + "-outra", resumo: bio },
      { ...pessoa, url: "https://exemplo.test/ana", resumo: bio },
      { ...pessoa, titulo: "Bia Silva", resumo: "Bia Silva dirige outra empresa." },
    ], "exa"), false);
    assert.equal(pessoa.conteudoPerfil, undefined);
    assert.equal(incorporarBuscaNominal(pessoa, [{ ...pessoa, url: pessoa.url.replace("www.", "br.") + "/?trk=busca", resumo: bio }], "exa"), true);
  });
  await t.test("resposta estruturada de outro perfil é descartada", async () => {
    configurar("brightdata"); modo = "homonimo"; buscaVazia = true; alvo = item("ana-correta");
    await completarPerfis([alvo], "identidade", acoes, () => false);
    assert.equal(alvo.conteudoPerfil, undefined);
  });
  await t.test("cancelar durante a leitura impede buscas novas e alterações tardias", async () => {
    configurar("brightdata", "searchapi"); modo = "rico"; cancelarAoLer = true; alvo = item("ana-cancelada");
    await completarPerfis([alvo], "cancelada", acoes, () => cancelar);
    assert.deepEqual(chamadas.map(c => c.acao), ["web_data_linkedin_person_profile"]);
    assert.equal(alvo.conteudoPerfil, undefined); assert.equal(alvo.perfilPesquisado, undefined);
  });
});

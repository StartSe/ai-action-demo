import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("pesquisa via Bright Data MCP", async t => {
  const pasta = mkdtempSync(path.join(tmpdir(), "prospeccao-mcp-"));
  const ambiente = { ...process.env };
  process.env.DATA_DIR = pasta;
  delete process.env.BRIGHTDATA_API_KEY;
  t.after(() => {
    process.env = ambiente;
    rmSync(pasta, { recursive: true, force: true });
  });
  const { setConfig, abrirBanco } = await import("../lib/store");
  const descoberta = await import("../lib/descoberta");
  const { BRIGHTDATA } = await import("../lib/integracoes");
  const { lerConfig } = await import("../lib/setup-comum");
  const { acaoParaUrl } = await import("../lib/brightdata");
  const { FERRAMENTAS } = await import("../lib/ferramentas");
  const { tratarRequisicaoRpc } = await import("../lib/mcp");
  const nomes = ["search_engine", "scrape_as_markdown", "search_dataset", "list_dataset_fields",
    "web_data_linkedin_person_profile", "web_data_linkedin_company_profile", "web_data_linkedin_job_listings",
    "web_data_linkedin_posts", "web_data_linkedin_people_search", "web_data_instagram_profiles",
    "web_data_instagram_posts", "web_data_instagram_reels", "web_data_instagram_comments", "web_data_facebook_posts"];
  let segredo = "token-salvo-teste";
  let formato: "json" | "sse" = "sse";
  let falhaHttp = 0;
  let erroFerramenta = "";
  let acaoComFalha = "";
  let buscaInvalida = false;
  let buscaVazia = false;
  let semLeitura = false;
  let registroComErro = false;
  let markdownInvalido = false;
  let expirar = false;
  let sessao = 0;
  let inicializada = false;
  const chamadas: { method: string; params: Record<string, unknown> }[] = [];
  const acoes: { name: string; arguments: Record<string, unknown> }[] = [];
  const logs = t.mock.method(console, "error", () => {});
  t.mock.method(global, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://mcp.brightdata.com/mcp");
    assert.equal(url.searchParams.get("pro"), "1");
    assert.equal(url.searchParams.get("token"), segredo);
    assert.equal(url.searchParams.has("zone"), false);
    assert.equal(init?.method, "POST");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    const headers = new Headers(init?.headers);
    assert.match(headers.get("Accept") || "", /application\/json, text\/event-stream/);
    const corpo = JSON.parse(String(init?.body));
    chamadas.push(corpo);
    if (falhaHttp) return new Response(`Erro externo com token=${segredo}`, { status: falhaHttp });
    let result: unknown;
    if (corpo.method === "initialize") {
      sessao++;
      inicializada = false;
      assert.equal(corpo.params.clientInfo.name, "prospeccao-ia");
      result = { protocolVersion: "2025-03-26", capabilities: { tools: {} } };
    } else {
      assert.equal(headers.get("Mcp-Session-Id"), `sessao-${sessao}`);
      assert.equal(headers.get("MCP-Protocol-Version"), "2025-03-26");
      if (corpo.method === "notifications/initialized") {
        assert.equal(corpo.id, undefined);
        inicializada = true;
        return new Response(null, { status: 202 });
      }
      assert.ok(inicializada);
      if (expirar) { expirar = false; return new Response(null, { status: 404 }); }
      if (corpo.method === "tools/list") {
        const lista = nomes.filter(n => !semLeitura || n !== "scrape_as_markdown");
        result = corpo.params.cursor === "pagina-2"
          ? { tools: [...lista.slice(3), "browser_click"].map(name => ({ name, inputSchema: { type: "object", properties: { url: { type: "string" } } } })) }
          : { tools: lista.slice(0, 3).map(name => ({ name, inputSchema: { type: "object" } })), nextCursor: "pagina-2" };
      } else {
        assert.equal(corpo.method, "tools/call");
        acoes.push(corpo.params);
        const nome = corpo.params.name;
        if (erroFerramenta && (!acaoComFalha || nome === acaoComFalha)) result = { isError: true, content: [{ type: "text", text: `${erroFerramenta} token=${segredo}` }] };
        else if (nome === "search_engine") result = { content: [{ type: "text", text: buscaInvalida ? "<html>falha</html>" : JSON.stringify({ organic: buscaVazia ? [] : [{ title: "Empresa real", link: "https://empresa.test", description: "Serviços industriais" }] }) }] };
        else if (nome === "scrape_as_markdown") result = markdownInvalido ? { content: [] } : { content: [{ type: "text", text: "# Empresa real\nServiços industriais em São Paulo." }] };
        else if (nome === "search_dataset") result = { structuredContent: { hits: [{ name: "Empresa real" }], total_hits: 1, search_after: ["cursor-2"] }, content: [] };
        else if (nome === "list_dataset_fields") result = { content: [{ type: "text", text: JSON.stringify([{ name: "company_name", type: "text" }]) }] };
        else result = { content: [{ type: "text", text: JSON.stringify(registroComErro ? [{ error: "Profile unavailable", error_code: "not_found", url: corpo.params.arguments.url }] : [{ name: "Pessoa real", headline: "Diretora", url: corpo.params.arguments.url }]) }] };
      }
    }
    const resposta = { jsonrpc: "2.0", id: corpo.id, result };
    if (formato === "json") return Response.json(resposta, { headers: { "Mcp-Session-Id": `sessao-${sessao}` } });
    // SSE com notificação antes da resposta, CRLF e chunks cortados no meio do JSON.
    const dados = `event: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\nevent: message\r\ndata: ${JSON.stringify(resposta)}\r\n\r\n`;
    return new Response(new ReadableStream({ start(controller) {
      const bytes = new TextEncoder().encode(dados);
      controller.enqueue(bytes.slice(0, 37)); controller.enqueue(bytes.slice(37)); controller.close();
    } }), { headers: { "Content-Type": "text/event-stream", "Mcp-Session-Id": `sessao-${sessao}` } });
  });

  await t.test("demonstração só sem chave; chave salva basta, mesmo com zonas antigas inválidas", async () => {
    assert.equal(descoberta.descobertaAtiva(), false);
    assert.equal((await descoberta.buscarNaWeb("IA")).demo, true);
    assert.equal(chamadas.length, 0);
    setConfig("BRIGHTDATA_API_KEY", segredo);
    setConfig("BRIGHTDATA_ZONE_BUSCA", "serp_api1-invalida");
    assert.equal(descoberta.descobertaAtiva(), true);
    assert.ok(BRIGHTDATA.campos.every(c => !c.chave.startsWith("BRIGHTDATA_ZONE")));
    const busca = await descoberta.buscarNaWeb("indústria", 2);
    assert.equal(busca.demo, false);
    assert.equal(busca.itens[0].url, "https://empresa.test");
    assert.deepEqual(acoes.at(-1), { name: "search_engine", arguments: { query: "indústria", engine: "google", cursor: "2" } });
  });
  await t.test("teste do setup executa busca e leitura e informa capacidades reais", async () => {
    const { POST } = await import("../app/api/setup/testar/route");
    const resposta = await POST(new Request("http://local/api/setup/testar", { method: "POST", body: JSON.stringify({ id: "brightdata" }) }));
    const teste = await resposta.json();
    assert.equal(teste.ok, true);
    assert.match(teste.mensagem, /MCP HTTP com pro=1/);
    assert.match(teste.mensagem, /LinkedIn: 5 ações; Instagram: 4 ações/);
    assert.deepEqual(acoes.slice(-2).map(a => a.name).sort(), ["scrape_as_markdown", "search_engine"]);
    assert.equal(chamadas.filter(c => c.method === "initialize").length, 1);
  });
  await t.test("Markdown, cache e teto de consultas por prospecção", async () => {
    setConfig("BRIGHTDATA_TETO_CONSULTAS", "1");
    const antes = acoes.length;
    assert.equal((await descoberta.lerPagina("https://empresa.test", "orcamento")).demo, false);
    await descoberta.lerPagina("https://empresa.test", "orcamento");
    assert.equal(acoes.length, antes + 1);
    await assert.rejects(descoberta.buscarNaWeb("nova busca", 0, "orcamento"), descoberta.TetoConsultasAtingido);
    assert.equal(acoes.length, antes + 1);
    setConfig("BRIGHTDATA_TETO_CONSULTAS", "60");
  });
  await t.test("perfis, empresas, vagas, posts e Instagram usam a ação específica", async () => {
    const casos = [
      ["https://www.linkedin.com/in/pessoa", "web_data_linkedin_person_profile"],
      ["https://br.linkedin.com/company/empresa", "web_data_linkedin_company_profile"],
      ["https://www.linkedin.com/jobs/view/123", "web_data_linkedin_job_listings"],
      ["https://www.linkedin.com/posts/pessoa-123", "web_data_linkedin_posts"],
      ["https://www.instagram.com/empresa/", "web_data_instagram_profiles"],
      ["https://www.instagram.com/p/123/", "web_data_instagram_posts"],
      ["https://www.instagram.com/reel/123/", "web_data_instagram_reels"],
    ];
    for (const [url, acao] of casos) {
      const leitura = await descoberta.perfilDePessoa(url);
      assert.equal(leitura.demo, false);
      assert.match(leitura.conteudo, /Pessoa real/);
      assert.deepEqual(acoes.at(-1), { name: acao, arguments: { url } });
    }
    assert.equal(acaoParaUrl("https://linkedin.com.example.com/in/pessoa"), "scrape_as_markdown");
    assert.equal(acaoParaUrl("https://instagram.com/accounts/"), "scrape_as_markdown");
  });
  await t.test("falha de perfil tenta Markdown, mas não ignora limite nem chave recusada", async () => {
    erroFerramenta = "Scraper failed"; acaoComFalha = "web_data_linkedin_person_profile";
    const leitura = await descoberta.perfilDePessoa("https://linkedin.com/in/fallback", "fallback");
    assert.match(leitura.conteudo, /Serviços industriais/);
    assert.deepEqual(acoes.slice(-2).map(a => a.name), [acaoComFalha, "scrape_as_markdown"]);
    assert.equal((abrirBanco().prepare("SELECT quantidade FROM consultas_prospeccao WHERE prospeccao_id = ?").get("fallback") as { quantidade: number }).quantidade, 2);
    erroFerramenta = "Quota exceeded";
    const antes = acoes.length;
    await assert.rejects(descoberta.perfilDePessoa("https://linkedin.com/in/limite"), { codigo: "limite_do_plano" });
    assert.equal(acoes.length, antes + 1);
    erroFerramenta = ""; acaoComFalha = "";
  });
  await t.test("catálogo paginado e execução MCP incluem datasets e todas as ações sociais", async () => {
    const catalogo = await descoberta.listarAcoesPesquisa();
    assert.deepEqual(catalogo.map(f => f.nome), nomes);
    assert.ok(catalogo.every(f => f.schema));
    const ferramenta = FERRAMENTAS.find(f => f.nome === "executar_acao_pesquisa")!;
    const campos = await ferramenta.executar({ acao: "list_dataset_fields", argumentos: { dataset_id: "gd_l1vikfnt1wgvvqz95w" } });
    assert.deepEqual(campos, [{ name: "company_name", type: "text" }]);
    const args = { dataset_id: "gd_l1vikfnt1wgvvqz95w", filter: { name: "company_name", operator: "=", value: "Empresa" }, size: 5, search_after: ["cursor-1"] };
    const rpc = await tratarRequisicaoRpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "executar_acao_pesquisa", arguments: { acao: "search_dataset", argumentos: args } } }, FERRAMENTAS, "prospeccao-ia");
    assert.equal(rpc.error, undefined);
    assert.match(JSON.stringify(rpc.result), /cursor-2/);
    assert.deepEqual(acoes.at(-1)?.arguments, args);
    for (const nome of nomes.filter(n => n.startsWith("web_data_"))) {
      await ferramenta.executar({ acao: nome, argumentos: { url: "https://example.com", first_name: "Ana", last_name: "Silva" } });
      assert.equal(acoes.at(-1)?.name, nome);
    }
    const antes = acoes.length;
    await assert.rejects(ferramenta.executar({ acao: "browser_click", argumentos: {} }));
    await assert.rejects(ferramenta.executar({ acao: "search_engine", argumentos: [] }));
    assert.equal(acoes.length, antes);
  });
  await t.test("registro de erro em snapshot usa Markdown; envelope vazio nunca entra no cache", async () => {
    registroComErro = true;
    const leitura = await descoberta.perfilDePessoa("https://linkedin.com/in/snapshot-erro");
    assert.match(leitura.conteudo, /Serviços industriais/);
    assert.doesNotMatch(leitura.conteudo, /Profile unavailable/);
    assert.deepEqual(acoes.slice(-2).map(a => a.name), ["web_data_linkedin_person_profile", "scrape_as_markdown"]);
    markdownInvalido = true;
    const url = "https://linkedin.com/in/snapshot-sem-conteudo";
    await assert.rejects(descoberta.perfilDePessoa(url), { codigo: "sem_resultado" });
    assert.equal(abrirBanco().prepare("SELECT url FROM cache_paginas WHERE url = ?").get(url), undefined);
    registroComErro = false; markdownInvalido = false;
    assert.match((await descoberta.perfilDePessoa(url)).conteudo, /Pessoa real/);
  });
  await t.test("pipeline persiste empresa encontrada pelo MCP e conclui sem demonstração", async () => {
    const w = await import("../lib/workspace");
    const { executarPipeline } = await import("../lib/execucao-prospeccao");
    const produto = w.criarProduto({ nome: "Manutenção", descricao: "Serviços industriais", site: null, propostaValor: "Reduzir paradas" });
    const icp = w.criarICP({ produtoId: produto.id, nome: "Indústria", jornada: "b2b", criterios: {}, personas: [], dores: [], sinais: [] });
    const prospeccao = w.criarProspeccao({ produtoId: produto.id, icpId: icp.id, modo: "empresas", criterios: { segmento: "industriais", localizacao: "São Paulo" }, estado: "executando", etapa: null, erro: null });
    await executarPipeline(prospeccao.id);
    assert.equal(w.obterProspeccao(prospeccao.id)?.estado, "pronta");
    assert.equal(w.obterProspeccao(prospeccao.id)?.erro, null);
    const contas = w.listarContas(prospeccao.id);
    assert.equal(contas.length, 1);
    assert.equal(contas[0].demo, false);
    assert.equal(contas[0].nome, "Empresa real");
    assert.equal(contas[0].site, "https://empresa.test");
    assert.match(contas[0].resumo || "", /Serviços industriais/);
  });
  await t.test("erros HTTP e isError não viram sucesso nem demonstração, nem expõem token", async () => {
    for (const [status, codigo] of [[401, "chave_recusada"], [403, "chave_recusada"], [429, "limite_do_plano"], [500, "servico_fora"]] as const) {
      falhaHttp = status;
      await assert.rejects(descoberta.buscarNaWeb("erro"), { codigo });
      const teste = await BRIGHTDATA.testar!(lerConfig(BRIGHTDATA));
      assert.equal(teste.ok, false);
      assert.ok(!JSON.stringify(teste).includes(segredo));
    }
    falhaHttp = 0;
    erroFerramenta = "Quota exceeded";
    await assert.rejects(descoberta.buscarNaWeb("erro"), { codigo: "limite_do_plano" });
    assert.equal((await BRIGHTDATA.testar!(lerConfig(BRIGHTDATA))).ok, false);
    erroFerramenta = "";
    buscaInvalida = true;
    await assert.rejects(descoberta.buscarNaWeb("erro"), { codigo: "servico_fora" });
    buscaInvalida = false; buscaVazia = true;
    await assert.rejects(descoberta.buscarNaWeb("vazia"), { codigo: "sem_resultado" });
    buscaVazia = false;
    assert.equal(logs.mock.callCount(), 0);
  });
  await t.test("renova sessão expirada e aceita JSON; chave nova recebe conexão nova", async () => {
    formato = "json";
    expirar = true;
    const antes = sessao;
    await descoberta.buscarNaWeb("renovação");
    assert.equal(sessao, antes + 1);
    segredo = "outra-chave";
    setConfig("BRIGHTDATA_API_KEY", segredo);
    await descoberta.buscarNaWeb("nova chave");
    assert.equal(sessao, antes + 2);
  });
  await t.test("catálogo incompleto não passa no teste do setup", async () => {
    segredo = "chave-sem-leitura"; setConfig("BRIGHTDATA_API_KEY", segredo);
    semLeitura = true;
    const teste = await BRIGHTDATA.testar!(lerConfig(BRIGHTDATA));
    assert.equal(teste.ok, false);
    assert.match(teste.mensagem, /scrape_as_markdown/);
  });
});

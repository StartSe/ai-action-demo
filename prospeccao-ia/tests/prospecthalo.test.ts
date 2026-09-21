import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import contrato from "./fixtures/prospecthalo-tools.json";

test("ProspectHalo MCP: contrato, coleta, proteção da chave e andamento", async t => {
  const ambiente = { ...process.env }, pasta = mkdtempSync(path.join(tmpdir(), "prospecthalo-"));
  process.env.DATA_DIR = pasta;
  for (const key of ["PROSPECTHALO_API_KEY", "APOLLO_API_KEY", "BRIGHTDATA_API_KEY", "EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[key];
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const { setConfig } = await import("../lib/store");
  const ph = await import("../lib/prospecthalo");
  const { listarAcoesPesquisa, executarAcaoPesquisa, lerPagina, buscarNaWeb } = await import("../lib/descoberta");
  const { consultasDaProspeccao } = await import("../lib/pesquisa-registro");
  const { INTEGRACOES } = await import("../lib/integracoes");
  const { statusIntegracoes } = await import("../lib/setup-comum");
  const ws = await import("../lib/workspace");
  const { executarPipeline } = await import("../lib/execucao-prospeccao");
  const chamadas: { nome: string; argumentos: Record<string, unknown> }[] = [];
  let resposta: Record<string, unknown> = {}, http = 200, erroTool = false, falhaRede = false, sse = false;
  let respostaAndamento: Record<string, unknown> | undefined;
  let leituraExa = "Diretora de tecnologia no Brasil.";
  const perfil = { name: "Ana Silva", title: "Diretora", companyName: "Exemplo", location: "Brasil", linkedinUrl: "https://linkedin.com/in/ana-silva/?trk=teste", summary: "Diretora de tecnologia no Brasil." };
  t.mock.method(console, "error", () => {});
  t.mock.method(global, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)), body = JSON.parse(String(init?.body));
    if (url.hostname === "api.exa.ai") {
      return Response.json({ results: [{ title: "Beatriz Lima - Diretora - Outra Empresa", url: "https://www.linkedin.com/in/beatriz-lima", text: leituraExa }] });
    }
    assert.equal(url.href, ph.PROSPECTHALO_MCP);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer segredo-teste");
    assert.equal(url.searchParams.has("key"), false);
    assert.ok(init?.signal);
    assert.equal(init?.redirect, "error");
    if (falhaRede) throw new DOMException("segredo-teste", "TimeoutError");
    if (http !== 200) return new Response("segredo-teste", { status: http });
    let result;
    if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "ProspectHalo", version: "1" } };
    else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    else if (body.method === "tools/list") result = { tools: contrato.tools };
    else {
      const nome = body.params.name, argumentos = body.params.arguments;
      chamadas.push({ nome, argumentos });
      const schema = contrato.tools.find(t => t.name === nome)?.inputSchema;
      assert.ok(schema, `Ferramenta desconhecida: ${nome}`);
      for (const key of Object.keys(argumentos)) assert.ok(key in schema.properties, `Campo fora do contrato: ${key}`);
      for (const key of ('required' in schema ? schema.required ?? [] : [])) assert.ok(key in argumentos, `Campo obrigatório ausente: ${key}`);
      result = erroTool ? { isError: true, content: [{ type: "text", text: "quota exceeded segredo-teste" }] }
        : { content: [{ type: "text", text: JSON.stringify(nome === "prospecthalo_get_context" ? { workspace: { ready: true } } : nome === "prospecthalo_get_search_results" && respostaAndamento ? respostaAndamento : resposta) }] };
    }
    const rpc = { jsonrpc: "2.0", id: body.id, result };
    return sse ? new Response(`data: ${JSON.stringify(rpc)}\n\n`, { headers: { "content-type": "text/event-stream" } }) : Response.json(rpc);
  });
  const reset = () => { respostaAndamento = undefined; http = 200; erroTool = false; falhaRede = false; sse = false; chamadas.length = 0; resposta = { results: [perfil] }; setConfig("PROSPECTHALO_API_KEY", "segredo-teste"); setConfig("EXA_API_KEY", null); };
  await t.test("setup conecta via MCP, mascara chave e ignora Apollo", async () => {
    reset(); setConfig("APOLLO_API_KEY", "legada");
    const integracao = INTEGRACOES.find(i => i.id === "prospecthalo")!;
    assert.ok(integracao); assert.equal(INTEGRACOES.some(i => i.id === "apollo"), false);
    assert.equal((await integracao.testar!({ PROSPECTHALO_API_KEY: `${ph.PROSPECTHALO_MCP}?key=segredo-teste` })).ok, true);
    assert.deepEqual(chamadas.map(c => c.nome), ["prospecthalo_get_context"]);
    assert.equal(JSON.stringify(await statusIntegracoes(INTEGRACOES)).includes("segredo-teste"), false);
  });
  await t.test("catálogo vivo só expõe coleta e recusa envio até por nome explícito", async () => {
    reset();
    const acoes = await listarAcoesPesquisa();
    assert.ok(acoes.some(a => a.nome === "prospecthalo_find_leads" && a.schema));
    assert.equal(acoes.some(a => a.nome === "prospecthalo_reply_to_lead"), false);
    await assert.rejects(executarAcaoPesquisa("prospecthalo_reply_to_lead", {}), { codigo: "acao_nao_permitida" });
    assert.equal(chamadas.length, 0);
  });
  await t.test("preserva critérios explícitos, normaliza dados reais e aceita SSE", async () => {
    reset(); sse = true;
    const leads = await ph.buscarProspectHalo({ cargo: "Diretora", segmento: "Tecnologia", localizacao: "Brasil", porte: "51-200", outros: "opera no Brasil", quantidade: 5 }, "contrato");
    assert.equal(leads.length, 1); assert.equal(leads[0].linkedin, "https://www.linkedin.com/in/ana-silva");
    assert.equal(leads[0].porte, ""); assert.equal(leads[0].setor, "");
    assert.equal(chamadas[0].argumentos.maxResults, 5);
    assert.match(String(chamadas[0].argumentos.idealCustomer), /51-200/);
    assert.match(String(chamadas[0].argumentos.requiredCriteria), /opera no Brasil/);
    const args = ph.argumentosProspectHalo({ cargo: "Gerente" });
    assert.equal("companyHeadcounts" in args, false); assert.equal("requiredCriteria" in args, false);
  });
  await t.test("qualificação pendente é retomada com o mesmo searchId pela ferramenta agêntica", async () => {
    reset(); resposta = { searchId: "search-pendente", status: "qualifying", results: [] };
    const args = { keywords: "Diretora pendente", idealCustomer: "Diretora pendente", maxResults: 5 };
    await executarAcaoPesquisa("prospecthalo_find_leads", args, "pendente-1");
    resposta = { searchId: "search-pendente", status: "completed", results: [perfil] };
    const r = await executarAcaoPesquisa("prospecthalo_find_leads", args, "pendente-2") as { results: unknown[] };
    assert.equal(r.results.length, 1);
    assert.deepEqual(chamadas.map(c => c.nome), ["prospecthalo_find_leads", "prospecthalo_get_search_results"]);
    assert.equal(chamadas[1].argumentos.searchId, "search-pendente");
    assert.equal(consultasDaProspeccao("pendente-1")[0].estado, "pendente");
  });
  await t.test("respeita nextRetryAt sem refazer nem consultar cedo", async () => {
    reset(); resposta = { searchId: "aguardando", status: "qualifying", nextRetryAt: new Date(Date.now() + 60_000).toISOString(), results: [] };
    const criterios = { cargo: "Aguardando" };
    await ph.buscarProspectHalo(criterios, "aguardando"); await ph.buscarProspectHalo(criterios, "aguardando");
    assert.equal(chamadas.length, 1); assert.ok(consultasDaProspeccao("aguardando").every(c => c.estado === "pendente"));
  });
  await t.test("resumo inicial consulta resultados pelo identificador e resolve a pendência local", async () => {
    reset(); resposta = { searchId: "resumo", status: "qualifying" };
    respostaAndamento = { searchId: "resumo", status: "completed", results: [perfil] };
    const leads = await ph.buscarProspectHalo({ cargo: "Resumo" }, "resumo");
    assert.equal(leads.length, 1);
    assert.deepEqual(chamadas.map(c => c.nome), ["prospecthalo_find_leads", "prospecthalo_get_search_results"]);
    assert.equal(consultasDaProspeccao("resumo").some(c => c.estado === "pendente"), false);
  });
  await t.test("duplicatas e rejeitados não viram leads", async () => {
    reset(); resposta = { results: [perfil, { ...perfil, linkedinUrl: "https://www.linkedin.com/in/ana-silva" }, { ...perfil, name: "Outra", linkedinUrl: "https://linkedin.com/in/outra", qualificationStatus: "deferred" }] };
    assert.equal((await ph.buscarProspectHalo({ cargo: "Dedup" })).length, 1);
    resposta = { results: [{ name: "Inválida", linkedinUrl: "https://linkedin.com.evil.test/in/pessoa" }] };
    await assert.rejects(ph.buscarProspectHalo({ cargo: "Inválida" }), { codigo: "resposta_invalida" });
  });
  await t.test("401, saldo, erro MCP, rede e limite local ficam distintos e sem segredo", async () => {
    reset();
    for (const status of [401, 403, 402, 429, 503]) {
      http = status;
      await assert.rejects(ph.buscarProspectHalo({ cargo: `Falha ${status}` }), e => e instanceof ph.ErroProspectHalo && !JSON.stringify(e).includes("segredo-teste"));
    }
    http = 200; erroTool = true;
    await assert.rejects(ph.buscarProspectHalo({ cargo: "Quota" }), { codigo: "limite_do_plano" });
    erroTool = false; falhaRede = true;
    await assert.rejects(ph.buscarProspectHalo({ cargo: "Rede" }), { codigo: "servico_fora" });
    falhaRede = false; setConfig("PROSPECTHALO_TETO_CONSULTAS", "1"); chamadas.length = 0;
    await ph.buscarProspectHalo({ cargo: "Primeira" }, "limite-ph");
    await assert.rejects(ph.buscarProspectHalo({ cargo: "Segunda" }, "limite-ph"), { codigo: "limite_do_plano" });
    assert.equal(chamadas.length, 1); setConfig("PROSPECTHALO_TETO_CONSULTAS", null);
  });
  await t.test("somente ProspectHalo nunca injeta conteúdo de demonstração", async () => {
    reset();
    await assert.rejects(lerPagina("https://empresa.example"));
    await assert.rejects(buscarNaWeb("empresa"), { codigo: "sem_resultado" });
  });
  async function executar(modo: "pessoas" | "empresa_unica" = "pessoas", criterios: Record<string, unknown> = { cargo: "Diretora", localizacao: "Brasil" }) {
    const produto = ws.criarProduto({ nome: "Teste", descricao: "", propostaValor: "Gestão", site: null });
    const icp = ws.criarICP({ produtoId: produto.id, nome: "Diretoras", jornada: "b2b", criterios: {}, personas: [], dores: [], sinais: [] });
    const p = ws.criarProspeccao({ produtoId: produto.id, icpId: icp.id, modo, criterios, estado: "executando", etapa: null, erro: null });
    await executarPipeline(p.id); return ws.obterAndamento(p.id)!;
  }
  await t.test("pipeline combina ProspectHalo e web mesmo com sucesso; sem evidência não qualifica", async () => {
    reset(); setConfig("EXA_API_KEY", "exa-teste");
    let r = await executar(); assert.equal(r.prospeccao.estado, "pronta"); assert.equal(r.leads.length, 2);
    assert.ok(r.leads.every(l => !l.demo)); assert.ok(r.consultas.some(c => c.fonte === "exa")); assert.ok(r.consultas.some(c => c.fonte === "prospecthalo"));
    reset(); resposta = { results: [{ name: "Nome Apenas", linkedinUrl: "https://linkedin.com/in/apenas" }] };
    r = await executar(); assert.equal(r.leads.length, 1); assert.equal(r.leads[0].status, "pesquisado");
    assert.ok(r.leads[0].evidencias.every(e => e.resultado === "nao_verificavel"));
    leituraExa = "Sem cargo ou localização verificáveis.";
  });
  await t.test("empresa única usa ProspectHalo sem web e exige seleção explícita", async () => {
    reset(); const r = await executar("empresa_unica", { empresaNome: "Exemplo" });
    assert.equal(r.leads.length, 1); assert.equal(r.leads[0].status, "novo"); assert.equal(r.leads[0].demo, false);
    assert.match(String(chamadas[0].argumentos.requiredCriteria), /Empresa atual: Exemplo/);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const pasta = mkdtempSync(path.join(tmpdir(), "radar-test-"));
process.env.DATA_DIR = pasta;
process.env.OPENROUTER_API_KEY = "teste";
process.env.BRIGHTDATA_API_TOKEN = "segredo-teste";
process.env.NOTIFICACOES_CANAL = "slack";
process.env.NOTIFICACOES_SLACK_WEBHOOK = "https://slack.test/notify";

const chamadas: { method: string; params: Record<string, unknown> }[] = [];
let avisos = 0;
let falharScraper = false;
const fetchOriginal = global.fetch;
global.fetch = async (input, init) => {
  const url = String(input);
  const corpo = init?.body ? JSON.parse(String(init.body)) : {};
  if (url.startsWith("https://mcp.brightdata.com")) {
    assert.equal(new URL(url).searchParams.get("pro"), "1");
    assert.equal(new URL(url).searchParams.get("token"), "segredo-teste");
    chamadas.push(corpo);
    if (corpo.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (corpo.method !== "initialize") assert.equal(new Headers(init?.headers).get("Mcp-Session-Id"), "sessao-teste");
    let result: unknown;
    if (corpo.method === "initialize") result = { protocolVersion: "2025-03-26" };
    else if (corpo.method === "tools/list") result = { tools: [{ name: "search_engine" }, { name: "scrape_as_markdown" }] };
    else if (corpo.params.name === "search_engine") result = { content: [{ type: "text", text: JSON.stringify({ organic: [{ title: "Novo mercado", link: "https://example.com/mercado", description: "Empresas investem em IA." }] }) }] };
    else result = { isError: falharScraper, content: [{ type: "text", text: falharScraper ? "Quota exceeded" : "# Novo mercado\nEmpresas investem em IA no varejo." }] };
    // Exercita Streamable HTTP/SSE, inclusive inicialização e sessão.
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: corpo.id, result })}\n\n`, { headers: { "content-type": "text/event-stream", "Mcp-Session-Id": "sessao-teste" } });
  }
  if (url.includes("openrouter.ai")) {
    if (corpo.messages[0].content.includes("Você planeja buscas")) return Response.json({ choices: [{ message: { content: JSON.stringify({ buscas: JSON.parse(corpo.messages[1].content).palavrasChave.map((tema: string) => ({ tema, consultas: [tema + " adoção", tema + " riscos"] })) }) } }] });
    assert.match(JSON.stringify(corpo), /Empresas investem em IA no varejo/);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ sinais: [{ id: "s1", titulo: "IA no varejo", resumo: "Nova demanda", tendencia: "estavel", temas: ["IA"], oQueFazer: "Validar um piloto com clientes", fontes: [{ url: "https://example.com/mercado" }, { url: "https://inventada.test" }] }], nos: [{ id: "t1", rotulo: "IA", tipo: "tema", peso: 5 }, { id: "s1", rotulo: "IA no varejo", tipo: "sinal", peso: 4 }], arestas: [{ origem: "t1", destino: "s1", relacao: "oportunidade", peso: 3 }], conexoes: [] }) } }] });
  }
  if (url.includes("slack.test")) { avisos++; assert.match(corpo.text, /Ação sugerida: Validar um piloto/); assert.match(corpo.text, /https:\/\/example.com\/mercado/); return new Response("ok"); }
  if (url.includes("news.google")) return new Response("<rss></rss>");
  if (url.includes("algolia")) return Response.json({ hits: [] });
  if (url.includes("reddit")) return Response.json({ data: { children: [] } });
  if (url.includes("api.github")) return Response.json({ items: [] });
  throw new Error(`Fetch inesperado: ${new URL(url).hostname}`);
};

test("cadastro → pesquisa MCP → Markdown → síntese → histórico/grafo sem notificações; edição e falhas", async () => {
  const api = await import("../app/api/radar/monitoramentos/route");
  const rotinas = await import("../lib/rotinas");
  await import("../lib/rotinas-do-app");
  const bright = await import("../lib/brightdata");
  const historico = await import("../lib/historico");
  const req = (v: unknown) => new Request("http://localhost/api/radar/monitoramentos", { method: "POST", body: JSON.stringify(v) });
  const teste = await bright.testarBrightData({ BRIGHTDATA_API_TOKEN: "segredo-teste" });
  assert.equal(teste.ok, true);
  const { salvarPesquisa } = await import("../lib/pesquisa-store");
  const { PESQUISA_PADRAO } = await import("../lib/pesquisa");
  salvarPesquisa({ ...PESQUISA_PADRAO, provedores: ["brightdata"], fontes: [], termos: [{ termo: "IA", categoria: "Tecnologia", ativo: true }] });
  const criado = await api.POST(req({ temas: ["IA"] }));
  assert.equal(criado.status, 201);
  const { id } = await criado.json();
  assert.deepEqual((rotinas.obter(id)?.parametros as { horarios: string[] }).horarios, ["08:00"]);
  assert.equal((await api.POST(req({ temas: ["IA"] }))).status, 409);
  assert.equal((await api.POST(req({ id, temas: ["IA"], horarios: ["09:30"], fuso: "UTC" }))).status, 200);
  const { abrirBanco } = await import("../lib/store");
  abrirBanco().prepare("UPDATE rotinas SET criadoEm = ? WHERE id = ?").run("2020-01-01T00:00:00Z", id);
  assert.equal((await rotinas.executarVencidas())[0]?.ok, true);
  assert.deepEqual(await rotinas.executarVencidas(), [], "rodada agendada não se repete");
  assert.equal(avisos, 0, "nenhuma notificação externa, mesmo com credenciais antigas");
  const [salvo] = historico.listarPorTipo("radar", 10);
  const radar = salvo.saida as { sinais: { fontes: unknown[] }[]; nos: unknown[]; arestas: unknown[] };
  assert.equal(radar.sinais[0].fontes.length, 1, "descarta fonte inventada");
  assert.equal(radar.nos.length, 2);
  assert.equal(radar.arestas.length, 1);
  assert.equal(chamadas.filter(c => c.method === "tools/call" && c.params.name === "search_engine").length, 3, "busca tema e duas consultas desdobradas sem duplicar");
  const { coletarPaginas } = await import("../lib/paginas");
  const paginas = await coletarPaginas([{ url: "https://example.com/pagina?id=2", nome: "Página específica", ativa: true, provedor: "brightdata" }]);
  assert.equal(paginas.achados[0].url, "https://example.com/pagina?id=2");
  assert.match(paginas.achados[0].trecho, /IA no varejo/);
  assert.ok(chamadas.some(c => c.method === "tools/call" && c.params.name === "scrape_as_markdown" && (c.params.arguments as { url: string }).url === "https://example.com/pagina?id=2"));
  falharScraper = true;
  const achados = await bright.buscarBrightData("IA", 7);
  assert.equal((await bright.enriquecerMarkdown(achados)).falhou, true);
  delete process.env.OPENROUTER_API_KEY;
  assert.equal((await rotinas.executarAgora(id))?.ok, false, "não envia demonstração");
  assert.equal(avisos, 0, "nenhuma notificação externa, mesmo com credenciais antigas");
  rotinas.pausar(id, false);
  assert.deepEqual(await rotinas.executarVencidas(new Date("2030-01-01")), []);
  rotinas.apagar(id);
  assert.equal(rotinas.obter(id), null);
});

test("lease impede execuções simultâneas", async () => {
  const r = await import("../lib/rotinas");
  let liberar!: () => void;
  const espera = new Promise<void>(resolve => { liberar = resolve; });
  let execucoes = 0;
  r.registrarExecutor("teste-lock", async () => { execucoes++; await espera; return { titulo: "Teste", texto: "", enviar: false }; });
  const id = r.criar({ tipo: "teste-lock", frequencia: "diaria", hora: "08:00", canal: "slack" });
  const primeira = r.executarAgora(id);
  assert.match((await r.executarAgora(id))!.mensagem, /já está em execução/);
  liberar(); await primeira;
  assert.equal(execucoes, 1);
  r.apagar(id);
});

test.after(() => { global.fetch = fetchOriginal; rmSync(pasta, { recursive: true, force: true }); });

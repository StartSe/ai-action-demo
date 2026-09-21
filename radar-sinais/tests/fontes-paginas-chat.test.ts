import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { normalizarPagina, validarPesquisa, PESQUISA_PADRAO } from "../lib/pesquisa";
const dir = mkdtempSync(`${tmpdir()}/radar-novas-fontes-`);
process.env.DATA_DIR = dir;
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; rmSync(dir, { recursive: true, force: true }); });

test("páginas preservam parâmetros e rejeitam destinos privados e limites inválidos", () => {
  assert.equal(normalizarPagina("https://empresa.com/p?id=2#x"), "https://empresa.com/p?id=2");
  for (const url of ["http://127.0.0.1", "http://2130706433", "http://0x7f000001", "http://[::1]", "http://10.1.2.3", "https://host.internal", "https://usuario:senha@site.com", "https://site.com:8080/"]) assert.throws(() => normalizarPagina(url), url);
  assert.throws(() => validarPesquisa({ ...PESQUISA_PADRAO, paginas: Array(9).fill({ url: "https://a.com", nome: "A", ativa: true, provedor: "firecrawl" }) }));
});

test("SearchAPI autentica no cabeçalho, filtra por site e não inventa datas", async () => {
  process.env.SEARCHAPI_API_KEY = "segredo-api";
  global.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://www.searchapi.io"); assert.equal(url.searchParams.get("engine"), "google");
    assert.match(url.searchParams.get("q")!, /site:startse.com\/artigos.*after:/);
    assert.ok(!url.toString().includes("segredo-api")); assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer segredo-api");
    return Response.json({ organic_results: [{ title: "IA no mercado", link: "https://startse.com/artigos/ia", snippet: "Evidência real", date: "3 days ago" }, { title: "Fora", link: "https://outro.com/artigo" }, { title: "Privada", link: "http://127.0.0.1/" }] });
  };
  const { buscarDetalhado } = await import("../lib/busca");
  const r = await buscarDetalhado({ consulta: "IA", dias: 7, site: "https://startse.com/artigos", provedores: ["searchapi"] });
  assert.equal(r.achados.length, 1); assert.equal(r.achados[0].publicadoEm, ""); assert.equal(r.fontes[0].estado, "ok");
  global.fetch = async () => new Response("recusada", { status: 401 });
  const { consultarSearchAPI, ChaveSearchAPIRecusada } = await import("../lib/searchapi");
  await assert.rejects(consultarSearchAPI("IA", 7), ChaveSearchAPIRecusada);
  delete process.env.SEARCHAPI_API_KEY;
});

test("StartSe usa busca pública restrita aos artigos, sem incluir outros veículos", async () => {
  global.fetch = async input => {
    const url = new URL(String(input)); assert.match(url.searchParams.get("q")!, /site:startse.com\/artigos/);
    return new Response(`<rss><item><title>IA nas empresas - StartSe</title><source>StartSe</source><link>https://news.google.com/rss/articles/123</link><pubDate>${new Date().toUTCString()}</pubDate></item><item><title>Fora</title><source>Outro veículo</source><link>https://outro.com/123</link><pubDate>${new Date().toUTCString()}</pubDate></item></rss>`);
  };
  const { buscarDetalhado } = await import("../lib/busca");
  const r = await buscarDetalhado({ consulta: "IA", dias: 7, provedores: ["startse"], site: "https://startse.com/artigos" });
  assert.equal(r.achados.length, 1); assert.equal(r.achados[0].fonte, "startse");
});

test("Firecrawl lê URL exata sem cache, isola falhas e mostra chave ausente", async () => {
  process.env.FIRECRAWL_API_KEY = "segredo-fire";
  const urls: string[] = [];
  global.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.firecrawl.dev/v2/scrape");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer segredo-fire");
    const b = JSON.parse(String(init?.body)); assert.equal(b.maxAge, 0); assert.deepEqual(b.formats, ["markdown"]); urls.push(b.url);
    return b.url.includes("falha") ? new Response("erro", { status: 503 }) : Response.json({ success: true, data: { markdown: "# Produto\nConteúdo atual", metadata: { statusCode: 200 } } });
  };
  const { coletarPaginas } = await import("../lib/paginas");
  const pagina = { url: "https://empresa.com/produto?id=2", nome: "Produto", ativa: true, provedor: "firecrawl" as const };
  const r = await coletarPaginas([pagina, { ...pagina, url: "https://empresa.com/falha" }, { ...pagina, ativa: false, url: "https://empresa.com/inativa" }, { ...pagina, provedor: "brightdata" }]);
  assert.deepEqual(urls.sort(), ["https://empresa.com/falha", pagina.url].sort());
  assert.equal(r.achados.length, 1); assert.equal(r.achados[0].publicadoEm, ""); assert.match(r.achados[0].trecho, /Conteúdo atual/);
  assert.equal(r.avisos.length, 2); assert.ok(r.fontes.some(f => f.estado === "sem_chave"));
  delete process.env.FIRECRAWL_API_KEY;
});

test("página monitorada chega à síntese mesmo sem resultados da busca", async () => {
  process.env.OPENROUTER_API_KEY = "teste"; process.env.FIRECRAWL_API_KEY = "teste";
  const { criarRadar, atualizarPesquisa } = await import("../lib/radares");
  const cadastro = criarRadar("Produto");
  const url = "https://empresa.com/p?id=2";
  atualizarPesquisa(cadastro.id, { ...PESQUISA_PADRAO, fontes: [], provedores: ["github"], termos: [{ termo: "Produto", categoria: "Mercado", ativo: true }], paginas: [{ url, nome: "Produto", ativa: true, provedor: "firecrawl" }] });
  global.fetch = async (input, init) => {
    if (String(input).includes("github")) return Response.json({ items: [] });
    if (String(input).includes("firecrawl")) return Response.json({ success: true, data: { markdown: "# Página monitorada de produto específico" } });
    const b = JSON.parse(String(init?.body)); assert.match(b.messages[1].content, /Página monitorada de produto específico/); assert.match(b.messages[1].content, /retratos atuais/);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ sinais: [{ id: "s", titulo: "Produto", resumo: "Evidência", tendencia: "estavel", temas: ["Produto"], oQueFazer: "Validar", fontes: [{ url }] }], nos: [], arestas: [], conexoes: [] }) } }] });
  };
  const { montarRadar } = await import("../lib/radar");
  const resultado = await montarRadar({ radarId: cadastro.id, temas: ["Produto"], periodoDias: 7 });
  assert.equal(resultado.sinais[0].fontes[0].url, url); assert.equal(resultado.fontes?.find(f => f.id === "firecrawl")?.estado, "ok");
  delete process.env.FIRECRAWL_API_KEY;
});

test("agente usa o resultado salvo, recusa exemplos e valida referências e tamanho da conversa", async () => {
  process.env.OPENROUTER_API_KEY = "teste";
  const { salvar } = await import("../lib/historico");
  const { conversarRadar } = await import("../lib/chat-radar");
  const fonte = { titulo: "Evidência", url: "https://startse.com/artigos/ia", veiculo: "StartSe", publicadoEm: "" };
  const saida = { periodoDias: 7, sinais: [{ id: "s1", titulo: "Sinal de IA", resumo: "Fato exclusivo do radar A", forca: "baixa", tendencia: "estavel", temas: ["IA"], fontes: [fonte], oQueFazer: "Validar" }], nos: [{ id: "s1", rotulo: "Sinal de IA", tipo: "sinal", peso: 1 }], arestas: [], conexoes: [{ titulo: "Leitura A", explicacao: "Relação a validar", nos: ["s1"] }] };
  const id = salvar({ tipo: "radar", titulo: "Radar A", entrada: { temas: ["IA"], periodoDias: 7 }, saida, meta: { demo: false, geradoEm: "2026-09-20" } });
  salvar({ tipo: "radar", titulo: "Radar B", entrada: {}, saida: { segredo: "Dado exclusivo de outro radar" }, meta: { demo: false } });
  global.fetch = async (_, init) => {
    const b = JSON.parse(String(init?.body)); const contexto = JSON.parse(b.messages[1].content);
    assert.equal(contexto.analise.sinais[0].resumo, "Fato exclusivo do radar A"); assert.equal(contexto.pontoSelecionado.id, "s1"); assert.ok(!b.messages[1].content.includes("Dado exclusivo de outro radar"));
    assert.equal(contexto.conversa.at(-1).texto, "Como validar?");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ resposta: "Entreviste os compradores para validar esta hipótese.", nos: ["s1", "inventado"], fontes: [fonte.url, "https://inventada.com"] }) } }] });
  };
  const r = await conversarRadar({ resultadoId: id, foco: "s1", mensagens: [{ papel: "usuario", texto: "Como validar?" }] });
  assert.equal(r.nos.length, 1); assert.deepEqual(r.fontes, [fonte]);
  await assert.rejects(conversarRadar({ resultadoId: id, mensagens: [{ papel: "usuario", texto: "a".repeat(4001) }] }), /4.000/);
  await assert.rejects(conversarRadar({ resultadoId: "inexistente", mensagens: [{ papel: "usuario", texto: "Como validar?" }] }), /não foi encontrada/);
  const demo = salvar({ tipo: "radar", titulo: "Demo", entrada: {}, saida, meta: { demo: true } });
  await assert.rejects(conversarRadar({ resultadoId: demo, mensagens: [{ papel: "usuario", texto: "Como validar?" }] }), /fontes reais/);
});

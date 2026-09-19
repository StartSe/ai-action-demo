import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { PESQUISA_PADRAO, validarPesquisa, pertenceAoSite } from "../lib/pesquisa";
const pasta = mkdtempSync(`${tmpdir()}/radar-pesquisa-`);
process.env.DATA_DIR = pasta;
const fetchOriginal = global.fetch;

test("cadastro persistente valida limites, evita duplicatas e distingue domínio/caminho", async () => {
  const api = await import("../app/api/radar/pesquisa/route");
  const pesquisa = { ...PESQUISA_PADRAO, termos: [{ termo: "IA", categoria: "Tecnologia", ativo: true }], fontes: [{ nome: "Referência", url: "startse.com/artigos", ativa: true }] };
  assert.equal((await api.PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(pesquisa) }))).status, 200);
  const salvo = (await (await api.GET()).json()).pesquisa;
  assert.equal(salvo.fontes[0].url, "https://startse.com/artigos");
  assert.equal(salvo.termos[0].termo, "IA");
  assert.throws(() => validarPesquisa({ ...pesquisa, provedores: [] }));
  assert.throws(() => validarPesquisa({ ...pesquisa, fontes: [{ ...pesquisa.fontes[0], url: "http://127.0.0.1" }] }));
  assert.equal(pertenceAoSite("https://www.startse.com/artigos/ia", salvo.fontes[0].url), true);
  assert.equal(pertenceAoSite("https://startse.com.evil.com/artigos/ia", salvo.fontes[0].url), false);
  assert.equal(pertenceAoSite("https://startse.com/artigos-falsos", salvo.fontes[0].url), false);
});

test("recência não inventa datas e dedup mantém IDs de artigos", async () => {
  const { dataPublicacao, filtrarPeriodo, normalizarUrl } = await import("../lib/busca");
  assert.equal(dataPublicacao(), ""); assert.equal(dataPublicacao("inválida"), "");
  assert.notEqual(normalizarUrl("https://site.com/post?id=1"), normalizarUrl("https://site.com/post?id=2"));
  assert.equal(normalizarUrl("https://site.com/post?id=1&utm_source=x#y"), "site.com/post?id=1");
  const agora = Date.parse("2026-09-18T12:00:00Z");
  const base = { titulo: "Teste", url: "https://site.com/post", trecho: "", veiculo: "Site", pontuacao: 1, fonte: "exa" as const };
  const filtrados = filtrarPeriodo(["", "2026-09-17", "2020-01-01", "2030-01-01"].map(publicadoEm => ({ ...base, publicadoEm })), 7, agora);
  assert.deepEqual(filtrados.map(f => f.publicadoEm), ["", "2026-09-17"]);
});

test("somente buscadores habilitados, filtro de site, falha parcial e data ausente", async () => {
  process.env.EXA_API_KEY = "exa-teste"; process.env.TAVILY_API_KEY = "tavily-teste";
  const urls: string[] = [];
  global.fetch = async (url, init) => {
    urls.push(String(url)); const corpo = JSON.parse(String(init?.body));
    assert.match(corpo.query, /site:startse.com\/artigos/);
    if (String(url).includes("tavily")) return new Response("erro", { status: 503 });
    return Response.json({ results: [{ title: "Atual", url: "https://startse.com/artigos/ia" }, { title: "Fora", url: "https://outro.com/a" }, { title: "Antigo", url: "https://startse.com/artigos/antigo", publishedDate: "2020-01-01" }] });
  };
  const { buscarDetalhado } = await import("../lib/busca");
  const r = await buscarDetalhado({ consulta: "IA", dias: 7, provedores: ["exa", "tavily"], site: "https://startse.com/artigos" });
  assert.equal(urls.length, 2); assert.equal(r.achados.length, 1); assert.equal(r.achados[0].publicadoEm, "");
  assert.equal(r.fontes.find(f => f.id === "tavily")?.estado, "indisponivel");
  delete process.env.EXA_API_KEY; delete process.env.TAVILY_API_KEY;
  await assert.rejects(buscarDetalhado({ consulta: "IA", dias: 7, provedores: ["exa"] }), /Nenhum buscador/);
});

test("Grok envia janela temporal e rejeita URL não citada pela ferramenta", async () => {
  process.env.XAI_API_KEY = "xai-teste";
  const id = ((BigInt(Date.now() - 10000) - BigInt(1288834974657)) << BigInt(22)).toString();
  const url = `https://x.com/autor/status/${id}`;
  global.fetch = async (_, init) => {
    const body = JSON.parse(String(init?.body)); assert.equal(body.tools[0].type, "x_search"); assert.match(body.tools[0].from_date, /^\d{4}-\d{2}-\d{2}$/);
    return Response.json({ citations: [url], output: [{ content: [{ type: "output_text", text: JSON.stringify({ achados: [{ titulo: "Post", url, trecho: "Conversa" }, { titulo: "Inventado", url: "https://x.com/autor/status/123", trecho: "Não citar" }] }) }] }] });
  };
  const { buscarGrok } = await import("../lib/grok"); const r = await buscarGrok("IA", 7);
  assert.equal(r.length, 1); assert.equal(r[0].url, url); assert.ok(Date.parse(r[0].publicadoEm) <= Date.now());
  delete process.env.XAI_API_KEY;
});

test("Redis reutiliza somente evidências recentes, isola chave e degrada para busca", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://teste.upstash.io"; process.env.UPSTASH_REDIS_REST_TOKEN = "segredo";
  const valores = new Map<string, string>(); let execucoes = 0; let falhar = false;
  global.fetch = async (_, init) => {
    if (falhar) throw new Error("offline");
    const [cmd, chave, valor, ex, ttl] = JSON.parse(String(init?.body));
    assert.ok(!chave.includes("credencial"));
    if (cmd === "SET") { assert.equal(ex, "EX"); assert.equal(ttl, 300); valores.set(chave, valor); return Response.json({ result: "OK" }); }
    return Response.json({ result: valores.get(chave) || null });
  };
  const { buscarComCache } = await import("../lib/cache-busca");
  const executar = async () => { execucoes++; return [{ titulo: "A", url: "https://a.com/a", trecho: "B", veiculo: "A", fonte: "exa" as const, publicadoEm: "", pontuacao: 1 }]; };
  assert.equal((await buscarComCache(["consulta", "credencial"], executar)).cache, false);
  assert.equal((await buscarComCache(["consulta", "credencial"], executar)).cache, true); assert.equal(execucoes, 1);
  await buscarComCache(["consulta", "outra-credencial"], executar); assert.equal(execucoes, 2);
  falhar = true; assert.equal((await buscarComCache(["consulta", "credencial"], executar)).cache, false); assert.equal(execucoes, 3);
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

test("ontologia descarta fontes inventadas, duplicatas e arestas órfãs", async () => {
  const { normalizar } = await import("../lib/radar");
  const { modelName } = await import("../lib/ai");
  process.env.OPENROUTER_MODEL_ONTOLOGIA = "provedor/modelo"; assert.equal(modelName("ontologia"), "provedor/modelo"); delete process.env.OPENROUTER_MODEL_ONTOLOGIA;
  const achado = { titulo: "Título real", url: "https://fonte.com/a", veiculo: "Fonte", trecho: "Texto", publicadoEm: "", fonte: "exa" as const, pontuacao: 1 };
  const radar = normalizar({ periodoDias: 999, sinais: [{ id: "s", titulo: "Sinal", resumo: "Resumo", temas: [], tendencia: "estavel", forca: "alta", oQueFazer: "Validar", fontes: [achado, achado, { ...achado, url: "https://inventada.com" }] }], nos: [{ id: "s", tipo: "sinal", rotulo: "Sinal", peso: 5 }], arestas: [{ origem: "s", destino: "inventado", relacao: "x", peso: 5 }] }, { temas: ["IA"], periodoDias: 7 }, [achado]);
  assert.equal(radar.periodoDias, 7); assert.equal(radar.sinais[0].fontes.length, 1); assert.equal(radar.sinais[0].forca, "baixa"); assert.equal(radar.arestas.length, 0);
});
test("termos e fonte cadastrados chegam à síntese e deixam proveniência auditável", async () => {
  process.env.OPENROUTER_API_KEY = "ia-teste"; process.env.EXA_API_KEY = "exa-teste";
  process.env.OPENROUTER_MODEL_ONTOLOGIA = "provedor/ontologia";
  const { salvarPesquisa } = await import("../lib/pesquisa-store");
  salvarPesquisa({ ...PESQUISA_PADRAO, provedores: ["exa"], termos: [{ termo: "EdTech", categoria: "Educação", ativo: true }], fontes: [{ url: "https://startse.com/artigos", nome: "StartSe", ativa: true }] });
  let direcionadas = 0;
  global.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).includes("exa.ai")) {
      if (body.query.includes("site:")) direcionadas++;
      return Response.json({ results: [{ title: "EdTech no Brasil", url: "https://startse.com/artigos/edtech", highlights: ["Evidência do site cadastrado"] }] });
    }
    assert.ok(String(url).includes("openrouter.ai")); assert.equal(body.model, "provedor/ontologia");
    assert.match(body.messages[1].content, /Evidência do site cadastrado/); assert.match(body.messages[1].content, /data não informada/);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ sinais: [{ id: "s", titulo: "EdTech", resumo: "Sinal", temas: ["EdTech"], tendencia: "estavel", oQueFazer: "Entrevistar compradores", fontes: [{ url: "https://startse.com/artigos/edtech" }] }], nos: [], arestas: [], conexoes: [] }) } }] });
  };
  const { montarRadar } = await import("../lib/radar"); const r = await montarRadar({ temas: ["EdTech"], periodoDias: 7 });
  assert.equal(direcionadas, 1); assert.equal(r.meta.demo, false); assert.equal(r.meta.model, "provedor/ontologia");
  assert.equal(r.sinais[0].fontes[0].url, "https://startse.com/artigos/edtech");
  assert.equal(r.coleta?.semData, 1); assert.equal(r.coleta?.consultas, 2); assert.deepEqual(r.coleta?.avisos, []);
  delete process.env.OPENROUTER_API_KEY; delete process.env.EXA_API_KEY; delete process.env.OPENROUTER_MODEL_ONTOLOGIA;
});
test.after(() => { global.fetch = fetchOriginal; rmSync(pasta, { recursive: true, force: true }); });

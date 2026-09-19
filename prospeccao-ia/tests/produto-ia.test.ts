import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const sugestao = {
  nome: "Masterclass de IA", descricao: "Aula sobre IA para gestores.", propostaValor: "Ensina gestores a aplicar IA na empresa.",
  icp: { nome: "Gestores", criterios: { setor: "Serviços" }, personas: ["Diretor"], dores: ["Tarefas manuais"], sinais: [] },
};
test("análise de produto: Markdown, resposta estruturada, progresso e falhas", async t => {
  const pasta = mkdtempSync(path.join(tmpdir(), "produto-ia-"));
  const ambiente = { ...process.env };
  process.env.DATA_DIR = pasta;
  process.env.OPENROUTER_API_KEY = "teste";
  process.env.BRIGHTDATA_API_KEY = "teste";
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const { sugerirProdutoDoSite } = await import("../lib/produto-ia");
  const { validarSugestao } = await import("../lib/produto-extracao");
  const { lerAnaliseProduto } = await import("../lib/produto-progresso");
  const { POST } = await import("../app/api/produtos/analisar/route");
  const markdown = "# Masterclass de IA\nUma aula para gestores aplicarem inteligência artificial nas empresas. Conheça práticas para reduzir tarefas manuais e desenvolver sua equipe.";
  let chamadasIA: Record<string, unknown>[] = [];
  let leituras = 0;
  let falhaLeitura = false;
  let vazio = false;
  let respostas: unknown[] = [];
  let httpIA = 200;
  let aguardarIA: Promise<void> | undefined;
  let timeoutIA = false;
  t.mock.method(console, "error", () => {});
  t.mock.method(global, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (String(input).startsWith("https://openrouter.ai/")) {
      chamadasIA.push(body);
      if (timeoutIA) throw new DOMException("Tempo esgotado", "TimeoutError");
      await aguardarIA;
      assert.ok(init?.signal);
      if (httpIA !== 200) return new Response("", { status: httpIA });
      return Response.json(respostas.shift() ?? { model: "modelo-real", choices: [{ message: { content: JSON.stringify(sugestao) }, finish_reason: "stop" }] });
    }
    assert.equal(new URL(String(input)).hostname, "mcp.brightdata.com");
    let result;
    if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "teste", version: "1" } };
    else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    else if (body.method === "tools/list") result = { tools: [{ name: "scrape_as_markdown", inputSchema: { type: "object" } }] };
    else {
      assert.equal(body.params.name, "scrape_as_markdown");
      leituras++;
      result = falhaLeitura ? { isError: true, content: [{ type: "text", text: "Page unavailable" }] } : { content: [{ type: "text", text: vazio ? "" : markdown }] };
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, result }, { headers: { "Mcp-Session-Id": "teste" } });
  });
  await t.test("usa conteúdo Markdown e devolve modelo real com etapas ordenadas", async () => {
    const etapas: string[] = [];
    const r = await sugerirProdutoDoSite("https://pages.startse.com/lp-masterclass-ia", e => etapas.push(e));
    assert.deepEqual(r.sugestao, sugestao);
    assert.equal(r.meta.model, "modelo-real");
    assert.deepEqual(etapas, ["leitura", "analise", "revisao"]);
    assert.ok(JSON.stringify(chamadasIA[0].messages).includes(markdown.replace(/\n/g, "\\n")));
    assert.deepEqual(chamadasIA[0].response_format, { type: "json_object" });
    assert.equal(leituras, 1);
  });
  await t.test("recupera JSON truncado sem repetir a leitura", async () => {
    const antes = leituras;
    respostas = [{ choices: [{ finish_reason: "length", message: { content: '{"nome":' } }] }];
    chamadasIA = [];
    const etapas: string[] = [];
    const r = await sugerirProdutoDoSite("https://pages.startse.com/lp-masterclass-ia", e => etapas.push(e));
    assert.equal(r.sugestao.nome, sugestao.nome);
    assert.equal(leituras, antes);
    assert.equal(chamadasIA.length, 2);
    assert.equal(chamadasIA[1].max_tokens, 8000);
    assert.ok(etapas.includes("tentativa"));
  });
  await t.test("rejeita formatos incompatíveis e não aceita produto vazio", async () => {
    for (const valor of [null, [], {}, { ...sugestao, nome: 3 }, { ...sugestao, icp: { ...sugestao.icp, personas: "Diretor" } }]) assert.throws(() => validarSugestao(valor));
    respostas = Array.from({ length: 2 }, () => ({ choices: [{ message: { content: "{}" } }] }));
    await assert.rejects(sugerirProdutoDoSite("Produto descrito pelo vendedor"), /não conseguiu organizar/);
  });
  await t.test("não usa apenas a URL quando a página falha", async () => {
    chamadasIA = []; falhaLeitura = true;
    await assert.rejects(sugerirProdutoDoSite("https://example.com/falha"));
    falhaLeitura = false; vazio = true;
    await assert.rejects(sugerirProdutoDoSite("https://example.com/vazio"));
    vazio = false;
    assert.equal(chamadasIA.length, 0);
  });
  await t.test("texto colado dispensa leitura; cancelamento não inicia IA", async () => {
    const antes = leituras;
    await sugerirProdutoDoSite("Produto com uma descrição escrita pelo vendedor.");
    assert.equal(leituras, antes);
    const controle = new AbortController(); controle.abort();
    await assert.rejects(sugerirProdutoDoSite("Uma descrição", () => {}, controle.signal), { name: "AbortError" });
  });
  await t.test("erro de credencial não repete a chamada", async () => {
    chamadasIA = []; httpIA = 401;
    await assert.rejects(sugerirProdutoDoSite("Uma descrição"), /chave da IA foi recusada/);
    assert.equal(chamadasIA.length, 1); httpIA = 200;
  });
  await t.test("rota transmite progresso e resultado que o cliente interpreta", async () => {
    const resposta = await POST(new Request("http://localhost/api/produtos/analisar", { method: "POST", headers: { Accept: "application/x-ndjson" }, body: JSON.stringify({ entrada: "Descrição de produto" }) }));
    assert.match(resposta.headers.get("content-type") || "", /ndjson/);
    const etapas: string[] = [];
    const r = await lerAnaliseProduto(resposta, e => etapas.push(e));
    assert.deepEqual(r.sugestao, sugestao);
    assert.deepEqual(etapas, ["preparacao", "analise", "revisao"]);
  });
  await t.test("cliente detecta erro e conexão cortada, preserva acentos em chunks", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ tipo: "resultado", resultado: { sugestao } }) + "\n");
    const r = await lerAnaliseProduto(new Response(new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } })), () => {});
    assert.equal(r.sugestao.propostaValor, sugestao.propostaValor);
    await assert.rejects(lerAnaliseProduto(new Response('{"tipo":"progresso","etapa":"leitura"}\n'), () => {}), /interrompida/);
    await assert.rejects(lerAnaliseProduto(new Response('{"tipo":"erro","error":"Página indisponível"}\n'), () => {}), /Página indisponível/);
  });
  await t.test("progresso chega antes da conclusão da IA e timeout tem orientação", async () => {
    let liberar!: () => void;
    aguardarIA = new Promise<void>(resolve => { liberar = resolve; });
    try {
      const resposta = await POST(new Request("http://localhost/api/produtos/analisar", { method: "POST", headers: { Accept: "application/x-ndjson" }, body: JSON.stringify({ entrada: "Produto descrito" }) }));
      const leitor = resposta.body!.getReader();
      const primeiro = await leitor.read();
      assert.match(new TextDecoder().decode(primeiro.value), /preparacao/);
      liberar();
      while (!(await leitor.read()).done) { /* consome a conclusão */ }
      leitor.releaseLock();
    } finally { liberar(); aguardarIA = undefined; }
    timeoutIA = true;
    await assert.rejects(sugerirProdutoDoSite("Produto descrito"), /demorou mais que o esperado/);
    timeoutIA = false;
  });
  await t.test("sem pesquisa conectada pede descrição, sem IA oferece demo explícita", async () => {
    delete process.env.BRIGHTDATA_API_KEY;
    await assert.rejects(sugerirProdutoDoSite("https://example.com/"), /Conecte a pesquisa/);
    delete process.env.OPENROUTER_API_KEY;
    const etapas: string[] = [];
    const r = await sugerirProdutoDoSite("https://example.com/", e => etapas.push(e));
    assert.equal(r.demo, true); assert.deepEqual(etapas, ["demonstracao"]);
  });
});

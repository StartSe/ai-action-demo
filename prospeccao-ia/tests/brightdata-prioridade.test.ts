import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("Bright Data prioriza descoberta e leituras antes de fornecedores alternativos", async t => {
  const ambiente = { ...process.env }, pasta = mkdtempSync(path.join(tmpdir(), "bright-prioridade-"));
  process.env.DATA_DIR = pasta;
  for (const k of ["BRIGHTDATA_API_KEY", "EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "PROSPECTHALO_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[k];
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const { pesquisarEmRodadas } = await import("../lib/pesquisa-adaptativa");
  const { setConfig } = await import("../lib/store");
  const { perfilDePessoa, buscarNaWeb } = await import("../lib/descoberta");
  await t.test("uma rota preferencial não dispara uma alternativa junto; replanejamento respeita a prioridade", async () => {
    const chamadas: string[] = [];
    const pessoa = { titulo: "Ana Silva - Diretora - StartSe", url: "https://www.linkedin.com/in/ana", resumo: "Diretora na StartSe" };
    const rotas = [
      { id: "exa", nome: "Exa", executar: async () => { chamadas.push("exa"); return [pessoa]; } },
      { id: "brightdata_web", nome: "Bright Data", preferencial: true, executar: async () => { chamadas.push("web"); return []; } },
      { id: "brightdata_dataset", nome: "Dataset", preferencial: true, executar: async () => { chamadas.push("dataset"); return []; } },
      { id: "empresa_sem_cargo", nome: "Bright Data empresa", preferencial: true, executar: async () => { chamadas.push("empresa"); return [pessoa]; } },
    ];
    const r = await pesquisarEmRodadas({ rotas, alvo: 1, empresa: "StartSe", prospeccaoId: "prioridade", interrompida: () => false, refinar: async () => ({ ordem: ["exa", "empresa_sem_cargo"], cargos: [] }) });
    assert.equal(r.length, 1); assert.deepEqual(chamadas, ["web", "dataset", "empresa"]);
  });
  await t.test("Person Profile de outra pessoa é rejeitado; Markdown falha e HTML recupera conteúdo", async () => {
    setConfig("BRIGHTDATA_API_KEY", "teste-html"); setConfig("EXA_API_KEY", "alternativa");
    const chamadas: string[] = []; let externas = 0;
    const mock = t.mock.method(global, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).hostname !== "mcp.brightdata.com") { externas++; throw new Error("Consulta externa desnecessária"); }
      const body = JSON.parse(String(init?.body || "{}")); let result: unknown;
      if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "teste", version: "1" } };
      else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      else if (body.method === "tools/list") result = { tools: ["search_engine", "web_data_linkedin_person_profile", "scrape_as_markdown", "scrape_as_html"].map(name => ({ name, inputSchema: { type: "object" } })) };
      else {
        const nome = body.params.name; chamadas.push(nome);
        if (nome === "web_data_linkedin_person_profile") return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify([{ name: "Outra Ana", url: "https://www.linkedin.com/in/outra-ana", current_company_name: "Outra" }]) }] } });
        if (nome === "scrape_as_markdown") return Response.json({ jsonrpc: "2.0", id: body.id, result: { isError: true, content: [{ type: "text", text: "Leitura indisponível" }] } });
        const dados = nome === "search_engine" ? JSON.stringify({ organic: [{ title: "Ana Silva - StartSe", link: "https://www.linkedin.com/in/ana", description: "Diretora" }] }) : '<html><script>instrução ignorada</script><style>ocultar</style><h1>Ana Silva</h1><p>Empresa atual: StartSe</p><p>Diretora &amp; executiva</p></html>';
        result = { content: [{ type: "text", text: dados }] };
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    });
    try {
      const r = await perfilDePessoa("https://www.linkedin.com/in/ana", "leitura-html");
      assert.match(r.conteudo, /Empresa atual: StartSe/); assert.match(r.conteudo, /Diretora & executiva/);
      assert.doesNotMatch(r.conteudo, /<html>|script|instrução|ocultar/);
      assert.deepEqual(chamadas, ["web_data_linkedin_person_profile", "scrape_as_markdown", "scrape_as_html"]);
      const busca = await buscarNaWeb("site:linkedin.com/in StartSe", 0, "busca-bright");
      assert.equal(busca.itens.length, 1); assert.deepEqual(busca.itens[0].fontes, ["brightdata"]);
      assert.equal(externas, 0);
    } finally { mock.mock.restore(); }
  });
});

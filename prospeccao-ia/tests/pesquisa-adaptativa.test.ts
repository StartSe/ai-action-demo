import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("pesquisa adaptativa: paralelismo, suficiência, lacunas e identidade", async t => {
  const ambiente = { ...process.env };
  const pasta = mkdtempSync(path.join(tmpdir(), "pesquisa-adaptativa-"));
  process.env.DATA_DIR = pasta;
  for (const key of ["BRIGHTDATA_API_KEY", "EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "PROSPECTHALO_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[key];
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const { pesquisarEmRodadas, candidatosComContexto } = await import("../lib/pesquisa-adaptativa");
  const { incorporarPerfil, completarPerfis } = await import("../lib/pesquisa-perfis");
  const { decisoesDaPesquisa } = await import("../lib/pesquisa-registro");
  const { setConfig } = await import("../lib/store");
  const pessoa = (nome: string) => ({ titulo: `${nome} - Diretora - Exemplo`, url: `https://www.linkedin.com/in/${nome.toLowerCase().replace(/ /g, "-")}`, resumo: "Diretora na Exemplo, Brasil" });

  await t.test("duas fontes em paralelo; resultado suficiente não consulta as demais", async () => {
    let ativas = 0, maximo = 0;
    const chamadas: string[] = [];
    const executar = (id: string) => async () => {
      chamadas.push(id); ativas++; maximo = Math.max(maximo, ativas);
      await new Promise(r => setTimeout(r, 10)); ativas--;
      return [pessoa(id)];
    };
    const itens = await pesquisarEmRodadas({ rotas: ["Ana", "Bia", "Carla"].map(id => ({ id, nome: id, executar: executar(id) })), alvo: 2, cargo: "Diretora", empresa: "Exemplo", prospeccaoId: "suficiente", interrompida: () => false });
    assert.equal(maximo, 2); assert.deepEqual(chamadas, ["Ana", "Bia"]); assert.equal(itens.length, 2);
    assert.match(decisoesDaPesquisa("suficiente").at(-1)!.mensagem, /parou/);
  });
  await t.test("falha e lacunas acionam outras fontes; não descarta resultados parciais", async () => {
    const item = { ...pessoa("Ana"), titulo: "Ana", resumo: "Perfil público" };
    assert.equal(candidatosComContexto([item], "Diretora"), 0);
    const r = await pesquisarEmRodadas({ rotas: [
      { id: "a", nome: "a", executar: async () => [item] },
      { id: "b", nome: "b", executar: async () => { throw new Error("Falha externa"); } },
      { id: "c", nome: "c", executar: async () => [pessoa("Bia")] },
    ], alvo: 2, cargo: "Diretora", prospeccaoId: "lacunas", interrompida: () => false });
    assert.equal(r.length, 2); assert.equal(candidatosComContexto(r, "Diretora"), 1);
  });
  await t.test("cancelamento impede rodadas seguintes e há teto de oito estratégias", async () => {
    let cancelar = false, chamadas = 0;
    const rotas = Array.from({ length: 12 }, (_, i) => ({ id: String(i), nome: String(i), executar: async () => { chamadas++; cancelar = true; return []; } }));
    await pesquisarEmRodadas({ rotas, alvo: 5, prospeccaoId: "cancelada", interrompida: () => cancelar });
    assert.equal(chamadas, 2);
    chamadas = 0;
    await pesquisarEmRodadas({ rotas, alvo: 5, prospeccaoId: "limite", interrompida: () => false });
    assert.equal(chamadas, 8);
  });
  await t.test("homônimo nunca preenche dados de outro perfil", () => {
    const item = pessoa("Ana Silva");
    assert.equal(incorporarPerfil(item, [{ name: "Ana Silva", position: "Diretora", current_company_name: "Exemplo", url: "https://www.linkedin.com/in/outra-ana" }]), false);
    assert.equal(incorporarPerfil(item, [{ name: "Ana Silva", position: "Diretora", current_company_name: "Exemplo", url: item.url }]), true);
  });
  await t.test("People Search preenche lacuna, respeita schema e encerra leituras extras", async () => {
    setConfig("BRIGHTDATA_API_KEY", "teste"); setConfig("EXA_API_KEY", "teste");
    const chamadas: string[] = [];
    const perfil = pessoa("Ana Silva");
    const acoes = ["web_data_linkedin_person_profile", "scrape_as_markdown", "web_data_linkedin_people_search"].map(nome => ({ nome, schema: { type: "object", properties: { url: { type: "string" }, ...(nome.endsWith("people_search") ? { first_name: { type: "string" }, last_name: { type: "string" } } : {}) }, required: nome.endsWith("people_search") ? ["url", "first_name", "last_name"] : ["url"] } }));
    const mock = t.mock.method(global, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      let result: unknown;
      if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "teste", version: "1" } };
      else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      else if (body.method === "tools/list") result = { tools: acoes.map(a => ({ name: a.nome, inputSchema: a.schema })) };
      else {
        const nome = body.params.name; chamadas.push(nome);
        if (nome === "web_data_linkedin_people_search") {
          assert.equal(body.params.arguments.first_name, "Ana"); assert.equal(body.params.arguments.last_name, "Silva");
        }
        const dados = nome === "web_data_linkedin_people_search" ? [{ name: "Ana Silva", position: "Diretora", current_company_name: "Exemplo", url: perfil.url }] : [{ name: "Ana Silva", url: perfil.url, about: "Perfil público" }];
        result = { content: [{ type: "text", text: JSON.stringify(dados) }] };
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    });
    await completarPerfis([perfil], "perfil", acoes, () => false);
    assert.deepEqual(chamadas, ["web_data_linkedin_person_profile", "web_data_linkedin_people_search"]);
    const antes = chamadas.length;
    await completarPerfis([perfil], "perfil", acoes, () => false);
    assert.equal(chamadas.length, antes);
    mock.mock.restore();
  });
});

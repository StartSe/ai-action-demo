import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as esperar } from "node:timers/promises";

function barreira() {
  let liberar!: () => void;
  const promessa = new Promise<void>(resolve => { liberar = resolve; });
  return { promessa, liberar };
}

test("resultados parciais chegam antes da fonte lenta e do enriquecimento", { timeout: 15000 }, async t => {
  const ambiente = { ...process.env }, pasta = mkdtempSync(path.join(tmpdir(), "parciais-"));
  process.env.DATA_DIR = pasta;
  for (const key of ["PROSPECTHALO_API_KEY", "BRIGHTDATA_API_KEY", "EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[key];
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const ws = await import("../lib/workspace");
  const { setConfig } = await import("../lib/store");
  const { executarPipeline } = await import("../lib/execucao-prospeccao");
  const { candidatosDaPesquisa, registrarCandidatosParciais } = await import("../lib/pesquisa-parciais");
  const { urlAvatarPublico } = await import("../lib/avatar-pessoa");
  setConfig("BRIGHTDATA_API_KEY", "teste-parciais");
  let web = barreira(), perfil = barreira(), sufixo = "fluxo";
  t.after(() => { web.liberar(); perfil.liberar(); });
  const foto = "https://media.licdn.com/dms/image/avatar.jpg?token=publico";
  const urlPessoa = (nome: string) => `https://www.linkedin.com/in/${nome}-${sufixo}`;
  const bio = "Diretora de marketing na Exemplo, no Brasil. Lidera projetos de capacitação e expansão comercial em parceria com as equipes de vendas.";
  t.mock.method(global, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new URL(String(input)).hostname, "mcp.brightdata.com");
    const body = JSON.parse(String(init?.body || "{}"));
    let result: unknown;
    if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "teste", version: "1" } };
    else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    else if (body.method === "tools/list") result = { tools: ["list_dataset_fields", "search_dataset", "search_engine", "scrape_as_markdown", "web_data_linkedin_person_profile"].map(name => ({ name, inputSchema: { type: "object" } })) };
    else {
      const acao = body.params.name;
      let dados: unknown;
      if (acao === "list_dataset_fields") dados = [{ name: "position", type: "text" }, { name: "country_code", type: "text" }];
      else if (acao === "search_dataset") dados = { hits: [{ _source: { name: "Ana Silva", position: "Diretora", current_company_name: "Exemplo", url: urlPessoa("ana") } }] };
      else if (acao === "search_engine") {
        await web.promessa;
        dados = { organic: [
          { title: "Bia Souza - Diretora - Exemplo", link: urlPessoa("bia"), description: bio },
          { title: "Ana Silva - Diretora - Exemplo", link: urlPessoa("ana").replace("www.", "br.") + "/?trk=busca", description: bio },
        ] };
      } else {
        const bia = body.params.arguments.url.includes("/bia-");
        if (bia) await perfil.promessa;
        dados = [{ name: bia ? "Bia Souza" : "Ana Silva", url: body.params.arguments.url, position: "Diretora de marketing", current_company_name: "Exemplo", about: bio, avatar: bia ? "https://licdn.com.evil.test/foto.jpg" : foto }];
      }
      result = { content: [{ type: "text", text: JSON.stringify(dados) }] };
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
  function criar() {
    const produto = ws.criarProduto({ nome: "Gestão", descricao: "", propostaValor: "Capacitação profissional", site: null });
    const icp = ws.criarICP({ produtoId: produto.id, nome: "Diretoras", jornada: "b2b", criterios: {}, personas: [], dores: [], sinais: [] });
    return ws.criarProspeccao({ produtoId: produto.id, icpId: icp.id, modo: "pessoas", criterios: { cargo: "Diretora", localizacao: "Brasil" }, estado: "executando", etapa: null, erro: null });
  }
  async function aguardar(condicao: () => boolean) {
    const inicio = Date.now();
    while (!condicao()) { assert.ok(Date.now() - inicio < 3000, "resultado parcial não chegou"); await esperar(5); }
  }

  await t.test("fonte rápida, atualização por perfil, foto e transição sem duplicação", async () => {
    const p = criar();
    const execucao = executarPipeline(p.id);
    try {
      await aguardar(() => !!ws.obterAndamento(p.id)?.candidatos.length);
      const inicial = ws.obterAndamento(p.id)!;
      assert.equal(inicial.prospeccao.estado, "executando");
      assert.deepEqual(inicial.candidatos.map(c => c.nome), ["Ana Silva"]);
      assert.equal(inicial.leads.length, 0, "candidato não é qualificado antes da análise");
      web.liberar();
      await aguardar(() => ws.obterAndamento(p.id)!.candidatos.some(c => c.nome === "Ana Silva" && c.fase === "analisando"));
      const durante = ws.obterAndamento(p.id)!;
      assert.equal(durante.candidatos.length, 2, "deduplica URLs regionais e com rastreamento");
      assert.equal(durante.leads.length, 0);
      assert.equal(durante.candidatos.find(c => c.nome === "Ana Silva")!.avatarUrl, foto);
      assert.equal(durante.candidatos.find(c => c.nome === "Ana Silva")!.cargo, "Diretora de marketing");
      assert.equal(durante.candidatos.find(c => c.nome === "Bia Souza")!.fase, "verificando");
      // Outra leitura do banco simula recarregar a página durante a execução.
      assert.deepEqual(ws.obterAndamento(p.id)!.candidatos, durante.candidatos);
      perfil.liberar(); await execucao;
      const final = ws.obterAndamento(p.id)!;
      assert.equal(final.prospeccao.estado, "pronta");
      assert.equal(final.candidatos.length, 0, "a prévia some ao existir o lead do mesmo perfil");
      assert.equal(final.leads.length, 2);
      assert.equal(final.leads.find(l => l.nome === "Ana Silva")!.avatarUrl, foto);
      assert.equal(final.leads.find(l => l.nome === "Bia Souza")!.avatarUrl, null);
    } finally { web.liberar(); perfil.liberar(); await execucao; }
  });
  await t.test("cancelar preserva os parciais e rejeita respostas tardias; excluir limpa tudo", async () => {
    web = barreira(); perfil = barreira(); sufixo = "cancelada";
    const p = criar(), execucao = executarPipeline(p.id);
    try {
      await aguardar(() => !!ws.obterAndamento(p.id)?.candidatos.length);
      const antes = candidatosDaPesquisa(p.id);
      ws.atualizarProspeccao(p.id, { estado: "cancelada" });
      web.liberar(); perfil.liberar(); await execucao;
      assert.deepEqual(candidatosDaPesquisa(p.id), antes);
      assert.equal(ws.listarLeads(p.id).length, 0);
      registrarCandidatosParciais(p.id, [{ titulo: "Carla Silva", url: urlPessoa("carla"), resumo: "" }]);
      assert.deepEqual(candidatosDaPesquisa(p.id), antes);
      ws.apagarProspeccao(p.id);
      registrarCandidatosParciais(p.id, [{ titulo: "Carla Silva", url: urlPessoa("carla"), resumo: "" }]);
      assert.deepEqual(candidatosDaPesquisa(p.id), []);
      assert.equal(ws.obterAndamento(p.id), null);
    } finally { web.liberar(); perfil.liberar(); await execucao; }
  });
  await t.test("avatar aceita apenas uma foto HTTPS do CDN público", () => {
    assert.equal(urlAvatarPublico(foto), foto);
    for (const url of ["javascript:alert(1)", "http://media.licdn.com/a.jpg", "https://licdn.com.evil.test/a.jpg", "https://user:pass@media.licdn.com/a.jpg", "https://127.0.0.1/a.jpg"]) assert.equal(urlAvatarPublico(url), null);
  });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "progresso-pesquisa-"));
const { criar, apagar, obter, atualizar } = await import("./candidatos");
const { iniciarProgressoPesquisa, etapaPesquisa, concluirEtapaPesquisa, lerProgressoPesquisa } = await import("./progresso-pesquisa");
const { pesquisarCandidato } = await import("./pesquisa");
const { esquecerFerramentas } = await import("./pesquisa-cliente");
const { POST: revisar } = await import("../app/api/candidatos/[id]/identidade/route");
const { GET } = await import("../app/api/candidatos/[id]/route");

test("progresso persistido é devolvido pela API e removido com o candidato", async () => {
  const c = criar({ nome: "Ana Silva" });
  iniciarProgressoPesquisa(c.id);
  etapaPesquisa(c.id, "Consultando o perfil");
  concluirEtapaPesquisa(c.id, "aviso");
  etapaPesquisa(c.id, "Organizando informações");
  const r = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: c.id }) });
  const { progresso } = await r.json();
  assert.deepEqual(progresso.passos.map((p: { estado: string }) => p.estado), ["concluido", "aviso", "em_andamento"]);
  assert.ok(progresso.passos.every((p: { iniciadoEm?: string }) => p.iniciadoEm));
  assert.ok(progresso.passos[0].concluidoEm);
  assert.ok(progresso.passos[1].concluidoEm);
  assert.equal(progresso.passos[2].concluidoEm, undefined);
  concluirEtapaPesquisa(c.id, "falhou");
  assert.equal(lerProgressoPesquisa(c.id)?.passos.at(-1)?.estado, "falhou");
  iniciarProgressoPesquisa(c.id);
  assert.equal(lerProgressoPesquisa(c.id)?.passos.length, 1);
  apagar(c.id);
  assert.equal(lerProgressoPesquisa(c.id), null);
});

test("pipeline usa Search Engine, Search Dataset, LinkedIn e Markdown e aguarda aprovação antes de atualizar a ficha", async (t) => {
  esquecerFerramentas();
  const c = criar({ nome: "Ana Silva", linkedinUrl: "https://linkedin.com/in/ana-silva", termoBusca: "Engenheira" });
  const observados: string[] = [];
  const ferramentasUsadas: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const p = JSON.parse(init.body as string);
    if (p.method === "notifications/initialized") return new Response(null, { status: 202 });
    let result: unknown;
    if (p.method === "initialize") result = { protocolVersion: "2025-03-26" };
    else if (p.method === "tools/list") result = { tools: [{ name: "search_engine" }, { name: "web_data_linkedin_person_profile" }, { name: "scrape_as_markdown" }, { name: "search_dataset" }, { name: "list_dataset_fields" }] };
    else {
      observados.push(lerProgressoPesquisa(c.id)?.passos.at(-1)?.titulo ?? "");
      ferramentasUsadas.push(p.params.name);
      let valor: unknown = "Ana Silva — engenheira na Empresa Exemplo";
      if (p.params.name === "search_engine") valor = { organic: [{ url: "https://github.com/ana-silva", title: "Ana Silva — engenheira" }] };
      if (p.params.name === "list_dataset_fields") valor = [{ name: "url", type: "text" }, { name: "name", type: "text" }];
      if (p.params.name === "search_dataset") {
        assert.deepEqual(p.params.arguments, { dataset_id: "gd_l1viktl72bvl7bjuj0", filter: { name: "url", operator: "=", value: "https://linkedin.com/in/ana-silva" }, size: 5 });
        valor = { hits: [{ _source: { url: "https://linkedin.com/in/ana-silva", name: "Ana Silva", description: "Engenheira" } }] };
      }
      result = { content: [{ type: "text", text: typeof valor === "string" ? valor : JSON.stringify(valor) }] };
    }
    return Response.json({ jsonrpc: "2.0", id: p.id, result });
  });
  const status = await pesquisarCandidato(c.id, {
    conexao: { url: "https://teste.invalid/progresso", token: "fake", modoAvancado: true },
    consolidador: async () => {
      assert.match(lerProgressoPesquisa(c.id)?.passos.at(-1)?.titulo ?? "", /Organizando/);
      return { ficha: { cargoAtual: { valor: "Engenheira", confianca: 0.95 } }, identidadesPossiveis: [] };
    },
  });
  assert.equal(status, "concluida");
  assert.deepEqual(ferramentasUsadas, ["web_data_linkedin_person_profile", "search_engine", "list_dataset_fields", "search_dataset", "scrape_as_markdown"]);
  assert.match(observados[0], /LinkedIn/);
  assert.match(observados[1], /Buscando/);
  assert.ok(lerProgressoPesquisa(c.id)?.passos.every((p) => p.estado === "concluido"));
  assert.equal(obter(c.id)?.ficha?.cargoAtual, undefined);
  assert.equal(obter(c.id)?.identidadeConfirmada, false);
  assert.equal(obter(c.id)?.ficha?.web?.ficha.cargoAtual?.valor, "Engenheira");
  const pendente = obter(c.id)!.ficha!;
  const r = await revisar(new Request("http://localhost", { method: "POST", body: JSON.stringify({ escolha: 0 }) }), { params: Promise.resolve({ id: c.id }) });
  assert.equal(r.status, 200);
  assert.equal(obter(c.id)?.ficha?.cargoAtual?.valor, "Engenheira");
  assert.equal(obter(c.id)?.ficha?.web, undefined);
  // Descartar outra rodada mantém os campos que o gestor já havia preenchido.
  atualizar(c.id, { ficha: { ...pendente, cargoAtual: { valor: "Líder técnica", origem: "gestor" } }, identidadeConfirmada: false });
  const descarte = await revisar(new Request("http://localhost", { method: "POST", body: JSON.stringify({ escolha: null }) }), { params: Promise.resolve({ id: c.id }) });
  assert.equal(descarte.status, 200);
  assert.equal(obter(c.id)?.ficha?.cargoAtual?.valor, "Líder técnica");
  assert.equal(obter(c.id)?.ficha?.web, undefined);
});

test("falha de conexão termina o progresso sem simular sucesso", async (t) => {
  esquecerFerramentas();
  const c = criar({ nome: "Ana Silva", termoBusca: "Engenheira" });
  t.mock.method(globalThis, "fetch", async () => new Response("Unauthorized", { status: 401 }));
  const status = await pesquisarCandidato(c.id, { conexao: { url: "https://teste.invalid/falha", token: "fake", modoAvancado: false } });
  assert.equal(status, "falhou");
  assert.equal(lerProgressoPesquisa(c.id)?.passos.at(-1)?.estado, "falhou");
  assert.equal(obter(c.id)?.ficha, undefined);
});

test("tags removidas não são consultadas e busca sem resultados reformula a consulta", async (t) => {
  esquecerFerramentas();
  const c = criar({ nome: "Ana Silva", linkedinUrl: "https://linkedin.com/in/nao-consultar" });
  const queries: string[] = [];
  const chamadas: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const p = JSON.parse(init.body as string);
    if (p.method === "notifications/initialized") return new Response(null, { status: 202 });
    let result: unknown;
    if (p.method === "initialize") result = { protocolVersion: "2025-03-26" };
    else if (p.method === "tools/list") result = { tools: [{ name: "search_engine" }, { name: "web_data_linkedin_person_profile" }, { name: "scrape_as_markdown" }] };
    else {
      chamadas.push(p.params.name);
      let valor: unknown = "Ana Silva engenheira na Acme em Recife";
      if (p.params.name === "search_engine") {
        queries.push(p.params.arguments.query);
        valor = { organic: queries.length === 1 ? [] : [{ url: "https://example.com/ana", title: "Ana Silva" }, { url: "https://example.org/ana", title: "Ana Silva" }] };
      }
      result = { content: [{ type: "text", text: typeof valor === "string" ? valor : JSON.stringify(valor) }] };
    }
    return Response.json({ jsonrpc: "2.0", id: p.id, result });
  });
  await pesquisarCandidato(c.id, {
    conexao: { url: "https://teste.invalid/tags", token: "fake", modoAvancado: true },
    termos: [{ tipo: "nome", valor: "Ana Silva" }, { tipo: "empresa", valor: "Acme" }, { tipo: "cidade", valor: "Recife" }],
    consolidador: async () => ({ ficha: { cargoAtual: { valor: "Engenheira", confianca: 0.9 } }, identidadesPossiveis: [] }),
  });
  assert.deepEqual(queries, ["Ana Silva Acme Recife", "Ana Silva Acme"]);
  assert.equal(chamadas.includes("web_data_linkedin_person_profile"), false);
  assert.ok(obter(c.id)?.ficha?.web);
  assert.equal(obter(c.id)?.ficha?.cargoAtual, undefined);
});

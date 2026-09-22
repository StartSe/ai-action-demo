import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-test-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { indexarDocumento, buscarDocumentos, excluirDocumento, listarDocumentos } = await import("../lib/documentos");
const { toolsAgenda } = await import("../lib/agenda");
const { setConfig } = await import("../lib/store");
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; rmSync(pasta, { recursive: true, force: true }); });

test("documento longo preserva o final, limita o contexto, deduplica e exclui", async () => {
  const texto = "Descrição geral de serviços de limpeza. ".repeat(1200) + "\nGarantia especial ZX900: substituição gratuita por noventa dias.";
  const d = await indexarDocumento("manual.txt", texto);
  assert.equal(d.caracteres, texto.length);
  assert.equal(d.modo, "palavras-chave");
  assert.ok(d.trechos > 20);
  const contexto = await buscarDocumentos("garantia ZX900");
  assert.match(contexto, /noventa dias/);
  assert.match(contexto, /manual.txt/);
  assert.ok(contexto.length < 8500);
  await indexarDocumento("manual.txt", texto);
  assert.equal(listarDocumentos().length, 1);
  assert.match(await buscarDocumentos("astronomia planetária"), /Nenhum trecho/);
  assert.equal(excluirDocumento(d.id), true);
  assert.equal(await buscarDocumentos("ZX900"), "");
  await assert.rejects(indexarDocumento("grande.txt", "x".repeat(200001)), /200 mil/);
  assert.equal(listarDocumentos().length, 0);
});

test("busca semântica recupera paráfrase, com fallback se embeddings falharem", async () => {
  setConfig("OPENROUTER_API_KEY", "teste");
  globalThis.fetch = async (_url, opts) => {
    const { input } = JSON.parse(String(opts?.body));
    return Response.json({ data: input.map((_: string, index: number) => ({ index, embedding: [1, 0, 0] })) });
  };
  const d = await indexarDocumento("trocas.txt", "Aceitamos devolução em trinta dias com comprovante.");
  assert.equal(d.modo, "semântica");
  assert.match(await buscarDocumentos("posso desistir da compra?"), /trinta dias/);
  globalThis.fetch = async () => new Response("Indisponível", { status: 503 });
  assert.match(await buscarDocumentos("devolução"), /trinta dias/);
  const fallback = await indexarDocumento("prazos.txt", "Entrega em sete dias.");
  assert.equal(fallback.modo, "palavras-chave");
  excluirDocumento(d.id); excluirDocumento(fallback.id);
  setConfig("OPENROUTER_API_KEY", null);
});

test("agenda exige conexão e lista explícita, encaminha argumentos e rejeita erro MCP", async () => {
  assert.equal(await toolsAgenda(), null);
  setConfig("MCP_AGENDA_URL", "https://agenda.example/mcp");
  setConfig("MCP_AGENDA_CODIGO", "teste");
  assert.equal(await toolsAgenda(), null);
  setConfig("MCP_AGENDA_FERRAMENTAS", "consultar_horarios, criar_evento");
  const chamadas: unknown[] = [];
  let erro = false;
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(String(opts?.body));
    if (body.method === "tools/list") return Response.json({ result: { tools: ["consultar_horarios", "criar_evento", "apagar_agenda"].map((name) => ({ name, inputSchema: { type: "object" } })) } });
    chamadas.push(body.params);
    return Response.json({ result: { isError: erro, content: [{ type: "text", text: '{"id":"evento-1"}' }] } });
  };
  const agenda = await toolsAgenda();
  assert.equal(agenda?.tools.length, 2);
  await assert.rejects(agenda!.executeTool("apagar_agenda", {}), /não autorizada/);
  assert.deepEqual(await agenda!.executeTool("agenda_1", { inicio: "2026-09-20T09:00:00-03:00" }), { id: "evento-1" });
  assert.deepEqual(chamadas[0], { name: "criar_evento", arguments: { inicio: "2026-09-20T09:00:00-03:00" } });
  erro = true;
  await assert.rejects(agenda!.executeTool("agenda_1", {}), /falha/);
  setConfig("MCP_AGENDA_FERRAMENTAS", "consultar_horarios");
  await assert.rejects(agenda!.executeTool("agenda_1", {}), /não autorizada/);
  setConfig("MCP_AGENDA_CODIGO", null);
  await assert.rejects(agenda!.executeTool("agenda_0", {}), /desconectada/);
});

test("atendimento usa trechos recuperados e explica ausência de agenda no prompt", async () => {
  const d = await indexarDocumento("politicas.txt", "A garantia do produto ORION cobre defeitos por sessenta dias.");
  setConfig("OPENROUTER_API_KEY", "teste");
  let system = "";
  globalThis.fetch = async (url, opts) => {
    assert.match(String(url), /chat\/completions/);
    const body = JSON.parse(String(opts?.body));
    system = body.messages[0].content;
    return Response.json({ choices: [{ message: { content: "A garantia do ORION cobre defeitos por sessenta dias." } }] });
  };
  const { responder } = await import("../lib/atendente");
  const resultado = await responder({ numero: "teste-rag", texto: "Qual é a garantia do ORION?", origem: "whatsapp", config: {
    negocio: "Loja", atendente: "Ana", objetivo: "agendamentos", tom: "profissional", horario: "9h às 18h", baseConhecimento: "Atendemos em São Paulo.", naoSei: "humano", midia: { audio: true, imagem: true, documento: true }, ferramentas: { coletarContato: false, agenda: true, sistemas: true },
  } });
  assert.match(system, /politicas.txt/);
  assert.match(system, /sessenta dias/);
  assert.match(system, /agenda não está disponível/);
  assert.match(system, /Só confirme agendamento após sucesso/);
  assert.match(resultado.resposta!, /sessenta dias/);
  excluirDocumento(d.id);
  setConfig("OPENROUTER_API_KEY", null);
});

test("upload HTTP preserva arquivo e oferece listagem e remoção", async () => {
  const { POST, GET, DELETE } = await import("../app/api/base/arquivo/route");
  const form = new FormData();
  form.set("arquivo", new File(["Política de frete: entrega em quatro dias."], "frete.txt", { type: "text/plain" }));
  const resposta = await POST(new Request("http://localhost/api/base/arquivo", { method: "POST", body: form }));
  assert.equal(resposta.status, 200);
  const { documento } = await resposta.json();
  assert.equal((await (await GET()).json()).documentos.length, 1);
  assert.match(await buscarDocumentos("frete"), /quatro dias/);
  const removido = await DELETE(new Request(`http://localhost/api/base/arquivo?id=${documento.id}`, { method: "DELETE" }));
  assert.equal(removido.status, 200);
  assert.equal((await (await GET()).json()).documentos.length, 0);
  const invalido = new FormData();
  invalido.set("arquivo", new File(["x".repeat(200001)], "grande.txt"));
  assert.equal((await POST(new Request("http://localhost/api/base/arquivo", { method: "POST", body: invalido }))).status, 400);
});

test("atendimento executa agenda pelo loop de ferramentas e recebe confirmação real", async () => {
  setConfig("OPENROUTER_API_KEY", "teste");
  setConfig("MCP_AGENDA_CODIGO", "teste");
  setConfig("MCP_AGENDA_FERRAMENTAS", "criar_evento");
  let chamadasIA = 0;
  let criacoes = 0;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(String(opts?.body));
    if (String(url).includes("agenda.example")) {
      if (body.method === "tools/list") return Response.json({ result: { tools: [{ name: "criar_evento", inputSchema: { type: "object", properties: { inicio: { type: "string" } } } }] } });
      criacoes++;
      assert.equal(body.params.name, "criar_evento");
      return Response.json({ result: { content: [{ type: "text", text: '{"sucesso":true,"id":"reserva-23"}' }] } });
    }
    chamadasIA++;
    if (chamadasIA === 1) {
      assert.equal(body.tools[0].function.name, "agenda_0");
      return Response.json({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "chamada-1", type: "function", function: { name: "agenda_0", arguments: '{"inicio":"2026-09-20T09:00:00-03:00"}' } }] } }] });
    }
    assert.equal(body.messages.at(-1).role, "tool");
    assert.match(body.messages.at(-1).content, /reserva-23/);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "Seu horário foi confirmado na agenda." } }] });
  };
  const { responder } = await import("../lib/atendente");
  const r = await responder({ numero: "teste-agenda", texto: "Confirmo dia 20/09 às 9h, São Paulo, 30 minutos, somente eu.", config: {
    negocio: "Clínica", atendente: "Ana", objetivo: "agendamentos", tom: "profissional", horario: "9h às 18h", baseConhecimento: "Consultas com duração de trinta minutos.", naoSei: "humano", midia: { audio: true, imagem: true, documento: true }, ferramentas: { coletarContato: false, agenda: true, sistemas: true },
  } });
  assert.equal(criacoes, 1);
  assert.equal(chamadasIA, 2);
  assert.equal(r.ferramentaUsada, "agenda_0");
  assert.match(r.resposta!, /confirmado/);
  setConfig("OPENROUTER_API_KEY", null);
  setConfig("MCP_AGENDA_CODIGO", null);
});

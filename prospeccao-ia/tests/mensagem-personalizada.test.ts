import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("mensagens usam o contexto completo e revisam fórmulas genéricas", async t => {
  const ambiente = { ...process.env }, pasta = mkdtempSync(path.join(tmpdir(), "mensagens-"));
  process.env.DATA_DIR = pasta; process.env.OPENROUTER_API_KEY = "teste";
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const ws = await import("../lib/workspace");
  const { gerarOuObterAbordagem } = await import("../lib/estrategia");
  const { problemasMensagens } = await import("../lib/mensagem-qualidade");
  const { POST } = await import("../app/api/leads/[id]/abordagem/regenerar/route");
  const produto = ws.criarProduto({ nome: "Oficina de IA", descricao: "Laboratório para mapear processos e priorizar pilotos de automação com gestores.", propostaValor: "Transformar tarefas repetitivas em pilotos de IA", site: null });
  const icp = ws.criarICP({ produtoId: produto.id, nome: "Operações", jornada: "b2b", criterios: {}, personas: ["Diretora de operações"], dores: ["retrabalho no fechamento de pedidos"], sinais: [] });
  const p = ws.criarProspeccao({ produtoId: produto.id, icpId: icp.id, modo: "pessoas", criterios: {}, estado: "pronta", etapa: null, erro: null });
  const conta = ws.criarConta({ prospeccaoId: p.id, nome: "FerroSul", site: "https://ferrosul.example", setor: null, porte: null, cidade: null, fit: null, evidencias: [], sinais: [], resumo: "FerroSul abriu um centro de distribuição em Recife para ampliar a operação regional.", demo: false });
  const lead = ws.criarLead({ prospeccaoId: p.id, contaId: conta.id, nome: "Carla Torres", cargo: "Diretora de operações", empresa: "FerroSul", cidade: null, linkedin: "https://linkedin.com/in/carla", fonte: "pesquisa", papel: "decisor", fit: null, evidencias: [{ criterio: "Porte", valor: "501-1000", resultado: "nao_verificavel" }], sinais: [{ descricao: "Abertura do centro de distribuição em Recife", data: "2026-09-20", tipo: "sinal", origem: "https://ferrosul.example/noticias/recife" }], hipotese: "A expansão pode aumentar o retrabalho no fechamento de pedidos.", status: "pesquisado", noCRM: false, demo: false });
  const estrategia = { objetivo: "Entender a prioridade operacional", gancho: "Abertura do centro de distribuição em Recife", dorProvavel: "A expansão pode aumentar o retrabalho", tom: "direto", cta: "Como estão priorizando os processos a automatizar?" };
  const boas = { email: { assunto: "Processos do centro de Recife", corpo: "Carla, a FerroSul abriu um centro de distribuição em Recife. Essa expansão mudou o fechamento de pedidos? Na Oficina de IA, gestores mapeiam processos e priorizam pilotos de automação. Como estão escolhendo o primeiro processo?" }, linkedin: "Carla, a expansão da FerroSul em Recife mudou o fechamento de pedidos? Trabalho com oficinas para gestores priorizarem pilotos de IA nesse tipo de processo.", whatsapp: "Carla, o novo centro de Recife trouxe mais etapas ao fechamento de pedidos? A Oficina de IA ajuda gestores a mapear o processo antes de escolher o piloto." };
  const prompts: { system: string; prompt: string }[] = [];
  let rodadas = 0, sempreGenerica = false;
  t.mock.method(console, "error", () => {});
  t.mock.method(global, "fetch", async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const system = body.messages[0].content, prompt = body.messages[1].content;
    prompts.push({ system, prompt });
    let resposta;
    if (system.includes("estrategista")) resposta = estrategia;
    else if (system.includes("reescrevendo só")) resposta = { texto: sempreGenerica ? "Vi seu perfil interessante, temos sinergia." : "Carla, como estão priorizando a automação de pedidos no centro de Recife? Na Oficina de IA, gestores mapeiam esse processo e escolhem um piloto." };
    else { rodadas++; resposta = sempreGenerica || rodadas === 1 ? { ...boas, linkedin: "Vi seu perfil, Carla. Nossa solução inovadora pode potencializar seus resultados." } : boas; }
    return Response.json({ choices: [{ message: { content: JSON.stringify(resposta) } }] });
  });
  await t.test("redação recebe descrição do produto, empresa, origem e lacunas; revisa antes de salvar", async () => {
    const r = (await gerarOuObterAbordagem(lead.id))!;
    assert.equal(r.abordagem.linkedin, boas.linkedin); assert.equal(rodadas, 2);
    const redacoes = prompts.filter(p => !p.system.includes("estrategista"));
    assert.ok(redacoes.every(p => p.prompt.includes("Laboratório para mapear processos") && p.prompt.includes("FerroSul abriu um centro") && p.prompt.includes("https://ferrosul.example/noticias/recife") && p.prompt.includes("Porte: nao_verificavel")));
    assert.match(redacoes[1].prompt, /Revisão obrigatória/);
    assert.match(redacoes[0].system, /Sem detalhe público suficiente/);
    assert.match(redacoes[0].system, /Não invente clientes, percentuais/);
  });
  await t.test("personaliza só o canal salvo e usa a versão anterior como referência", async () => {
    const antes = ws.listarAbordagens(lead.id)[0];
    const r = await POST(new Request(`http://localhost/api/leads/${lead.id}/abordagem/regenerar`, { method: "POST", body: JSON.stringify({ canal: "linkedin", direcao: "mais_personalizado" }) }), { params: Promise.resolve({ id: lead.id }) });
    assert.equal(r.status, 200);
    const depois = ws.listarAbordagens(lead.id)[0];
    assert.notEqual(depois.linkedin, antes.linkedin); assert.deepEqual(depois.email, antes.email); assert.equal(depois.whatsapp, antes.whatsapp); assert.deepEqual(depois.estrategia, antes.estrategia);
    assert.ok(prompts.at(-1)?.prompt.includes(antes.linkedin));
  });
  await t.test("resposta ainda genérica após revisão não sobrescreve o texto salvo", async () => {
    sempreGenerica = true; const antes = ws.listarAbordagens(lead.id)[0];
    const r = await POST(new Request(`http://localhost/api/leads/${lead.id}/abordagem/regenerar`, { method: "POST", body: JSON.stringify({ canal: "linkedin", direcao: "mais_personalizado" }) }), { params: Promise.resolve({ id: lead.id }) });
    assert.equal(r.status, 500); assert.deepEqual(ws.listarAbordagens(lead.id)[0], antes);
  });
  await t.test("limite do LinkedIn e marcadores exigem revisão sem cortar frases", () => {
    assert.ok(problemasMensagens([{ canal: "linkedin", texto: "a".repeat(301) }]).some(p => p.includes("300")));
    assert.ok(problemasMensagens([{ canal: "email", texto: "Olá [nome do lead], aqui é [seu nome]." }]).length);
    assert.deepEqual(problemasMensagens([{ canal: "linkedin", texto: boas.linkedin }]), []);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("abordagem: etapas reais, persistência e recuperação de falhas", async t => {
  const pasta = mkdtempSync(path.join(tmpdir(), "abordagem-"));
  const ambiente = { ...process.env };
  process.env.DATA_DIR = pasta; process.env.OPENROUTER_API_KEY = "teste";
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const ws = await import("../lib/workspace");
  const { gerarOuObterAbordagem } = await import("../lib/estrategia");
  const { lerAbordagem } = await import("../lib/abordagem-progresso");
  const { GET, PUT } = await import("../app/api/leads/[id]/abordagem/route");
  const { POST } = await import("../app/api/leads/[id]/abordagem/regenerar/route");
  const produto = ws.criarProduto({ nome: "Masterclass de IA", descricao: "IA para gestores", site: null, propostaValor: "Implementar IA com segurança" });
  const icp = ws.criarICP({ produtoId: produto.id, nome: "Diretores", jornada: "b2b", criterios: {}, personas: [], dores: [], sinais: [] });
  const prospeccao = ws.criarProspeccao({ produtoId: produto.id, icpId: icp.id, modo: "pessoas", criterios: {}, estado: "pronta", etapa: null, erro: null });
  function lead() { return ws.criarLead({ prospeccaoId: prospeccao.id, contaId: null, nome: "Rodrigo Silva", cargo: "Diretor", empresa: "Empresa", cidade: "São Paulo", linkedin: null, fonte: null, papel: "decisor", fit: "alta", evidencias: [], sinais: [], hipotese: "Pode precisar reduzir tarefas manuais", status: "qualificado", noCRM: false }); }
  const estrategia = { objetivo: "Conhecer os desafios", gancho: "Seu papel de liderança", dorProvavel: "Caso precise reduzir tarefas manuais", tom: "consultivo", cta: "Podemos conversar?" };
  const mensagens = { email: { assunto: "Uma conversa sobre IA", corpo: "Olá, Rodrigo. Podemos conversar?" }, linkedin: "Rodrigo, podemos conversar sobre IA?", whatsapp: "Oi, Rodrigo! Podemos conversar?" };
  const prompts: string[] = []; let invalida = false;
  let http = 200; let chamadas = 0; let bloqueio: Promise<void> | undefined;
  t.mock.method(console, "error", () => {});
  t.mock.method(global, "fetch", async (_url: unknown, init?: RequestInit) => {
    chamadas++;
    await bloqueio;
    if (http !== 200) return new Response("", { status: http });
    const body = JSON.parse(String(init?.body));
    prompts.push(body.messages[1].content);
    const system = body.messages[0].content as string;
    const resultado = system.includes("estrategista") ? estrategia : system.includes("reescrevendo só") ? { texto: "Uma mensagem alternativa." } : invalida ? { ...mensagens, linkedin: "..." } : mensagens;
    return Response.json({ choices: [{ message: { content: JSON.stringify(resultado) } }] });
  });
  const req = (id: string) => new Request(`http://localhost/api/leads/${id}/abordagem`, { headers: { Accept: "application/x-ndjson" } });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  await t.test("transmite etapas antes de terminar e compartilha geração simultânea", async () => {
    const l = lead(); let liberar!: () => void;
    bloqueio = new Promise<void>(resolve => { liberar = resolve; });
    const resposta = await GET(req(l.id), params(l.id));
    const etapas: string[] = [];
    const lendo = lerAbordagem(resposta, e => etapas.push(e));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(etapas, ["contexto", "estrategia"]);
    assert.equal(ws.listarAbordagens(l.id).length, 0);
    const segunda = gerarOuObterAbordagem(l.id);
    liberar(); bloqueio = undefined;
    const [a, b] = await Promise.all([lendo, segunda]);
    assert.deepEqual(etapas, ["contexto", "estrategia", "mensagens", "salvando"]);
    assert.equal(chamadas, 2); assert.equal(a.abordagem.id, b?.abordagem.id);
    assert.equal(a.lead.status, "selecionado"); assert.equal(a.abordagem.demo, false);
    await gerarOuObterAbordagem(l.id); assert.equal(chamadas, 2);
    assert.equal(ws.listarAbordagens(l.id).length, 1);
  });
  await t.test("falha de IA não salva exemplo; permite tentar de novo", async () => {
    const l = lead(); http = 401;
    await assert.rejects(lerAbordagem(await GET(req(l.id), params(l.id)), () => {}), /chave/i);
    assert.equal(ws.listarAbordagens(l.id).length, 0); assert.equal(ws.obterLead(l.id)?.status, "qualificado");
    http = 200;
    const r = await lerAbordagem(await GET(req(l.id), params(l.id)), () => {});
    assert.equal(r.abordagem.linkedin, mensagens.linkedin);
  });
  await t.test("edição e regeneração preservam o registro em caso de falha", async () => {
    const l = lead(); const antes = (await gerarOuObterAbordagem(l.id))!.abordagem;
    http = 401;
    const r = await PUT(new Request(req(l.id), { method: "PUT", body: JSON.stringify({ estrategia: { ...estrategia, tom: "direto" } }) }), params(l.id));
    assert.equal(r.status, 401); assert.deepEqual(ws.listarAbordagens(l.id)[0], antes);
    const falha = await POST(new Request(req(l.id), { method: "POST", body: JSON.stringify({ canal: "linkedin", direcao: "mais_curto" }) }), params(l.id));
    assert.equal(falha.status, 401); assert.deepEqual(ws.listarAbordagens(l.id)[0], antes);
    http = 200;
    const ok = await POST(new Request(req(l.id), { method: "POST", body: JSON.stringify({ canal: "linkedin", direcao: "mais_curto" }) }), params(l.id));
    assert.equal(ok.status, 200); const depois = ws.listarAbordagens(l.id)[0];
    assert.notEqual(depois.linkedin, antes.linkedin); assert.deepEqual(depois.email, antes.email);
  });
  await t.test("leitor preserva acentos e detecta HTTP ou conexão interrompida", async () => {
    const r = (await gerarOuObterAbordagem(lead().id))!;
    const bytes = new TextEncoder().encode(JSON.stringify({ tipo: "resultado", resultado: r }) + "\n");
    const resposta = new Response(new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } }));
    assert.deepEqual(await lerAbordagem(resposta, () => {}), r);
    await assert.rejects(lerAbordagem(new Response('{"tipo":"progresso","etapa":"contexto"}\n'), () => {}), /interrompida/);
    await assert.rejects(lerAbordagem(Response.json({ error: "Entre novamente" }, { status: 401 }), () => {}), /Entre novamente/);
    assert.equal((await GET(req("inexistente"), params("inexistente"))).status, 404);
  });
  await t.test("novas evidências entram na estratégia e mensagens; texto incompleto não é salvo", async () => {
    const l = lead();
    const { salvarQualificacaoProfunda } = await import("../lib/qualificacao-profunda-store");
    const agora = new Date().toISOString();
    salvarQualificacaoProfunda({ id: "pesquisa", leadId: l.id, estado: "pronta", etapa: "avaliacao", fontes: [], avisos: [], erro: null, iniciadoEm: agora, atualizadoEm: agora, resultado: { pontuacao: 40, cobertura: 40, calculadoEm: agora, criterios: [{ criterio: "Necessidade", peso: 40, resultado: "atende", trecho: "Estamos implementando IA na operação", fonte: "https://www.linkedin.com/posts/rodrigo_123" }] } });
    invalida = true;
    await assert.rejects(gerarOuObterAbordagem(l.id), /incompleta/);
    assert.equal(ws.listarAbordagens(l.id).length, 0);
    assert.ok(prompts.slice(-2).every(p => p.includes("Estamos implementando IA na operação")));
    invalida = false;
    await gerarOuObterAbordagem(l.id);
    assert.equal(ws.listarAbordagens(l.id).length, 1);
  });
  await t.test("tempo limite libera o fluxo para nova tentativa", async () => {
    const { comPrazoIA } = await import("../lib/ia-prazo");
    await assert.rejects(comPrazoIA(new Promise(() => {}), 5), /demorou/);
    assert.equal(await comPrazoIA(Promise.resolve("pronto"), 5), "pronto");
  });
  await t.test("sem IA identifica explicitamente a demonstração", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const r = await gerarOuObterAbordagem(lead().id);
    assert.equal(r?.abordagem.demo, true);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("qualificação profunda: fontes sociais, nota verificável e trabalho em background", async t => {
  const pasta = mkdtempSync(path.join(tmpdir(), "qualificacao-")); const ambiente = { ...process.env };
  process.env.DATA_DIR = pasta; process.env.OPENROUTER_API_KEY = "teste"; process.env.BRIGHTDATA_API_KEY = "teste";
  for (const key of ["EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY"]) delete process.env[key];
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  const ws = await import("../lib/workspace");
  const { iniciarQualificacaoProfunda, aguardarQualificacao, qualificacaoAtual, calcularPontuacao, instagramValido } = await import("../lib/qualificacao-profunda");
  const { obterQualificacaoProfunda, salvarQualificacaoProfunda } = await import("../lib/qualificacao-profunda-store");
  const { POST, GET } = await import("../app/api/leads/[id]/qualificacao/route");
  const { PUT } = await import("../app/api/leads/[id]/route");
  const linkedin = "https://www.linkedin.com/in/rodrigo-teste/";
  const post = "https://www.linkedin.com/posts/rodrigo-teste_iniciativa-123";
  const instagram = "https://www.instagram.com/rodrigoteste/";
  const trecho = "Diretor no Brasil, liderando um projeto de inteligência artificial na empresa.";
  const produto = ws.criarProduto({ nome: "Masterclass IA", descricao: "", site: null, propostaValor: "Implementar inteligência artificial" });
  const icp = ws.criarICP({ produtoId: produto.id, nome: "Diretores", jornada: "b2b", criterios: { localizacao: "Brasil" }, personas: ["Diretor"], dores: [], sinais: [] });
  const prospeccao = ws.criarProspeccao({ produtoId: produto.id, icpId: icp.id, modo: "pessoas", criterios: {}, estado: "pronta", etapa: null, erro: null });
  const novo = (perfil: string | null = linkedin) => ws.criarLead({ prospeccaoId: prospeccao.id, contaId: null, nome: "Rodrigo Silva", cargo: null, empresa: null, cidade: null, linkedin: perfil, fonte: null, papel: "desconhecido", fit: null, evidencias: [], sinais: [], hipotese: null, status: "pesquisado", noCRM: false });
  let erroPerfil = false, semInstagram = false; let http = 200; let bloqueio: Promise<void> | undefined;
  const acoes: string[] = []; let chamadasIA = 0;
  t.mock.method(global, "fetch", async (input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (String(input).includes("openrouter.ai")) {
      chamadasIA++; if (http !== 200) return new Response("", { status: http });
      const prompt = JSON.parse(body.messages[1].content);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ criterios: prompt.criterios.map((c: { indice: number }) => ({ indice: c.indice, resultado: "atende", trecho, fonte: linkedin })) }) } }] });
    }
    let result;
    if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "teste", version: "1" } };
    else if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    else if (body.method === "tools/list") result = { tools: ["search_engine", "web_data_linkedin_person_profile", "web_data_linkedin_posts", "web_data_instagram_profiles", "web_data_instagram_posts"].map(name => ({ name, inputSchema: { type: "object" } })) };
    else {
      const acao = body.params.name; acoes.push(acao); await bloqueio;
      const data = acao === "search_engine" ? { organic: [{ title: "Outro Rodrigo", link: "https://www.linkedin.com/posts/homonimo_123", description: trecho }, { title: "Post do Rodrigo", link: post, description: trecho }] }
        : acao === "web_data_linkedin_person_profile" ? (erroPerfil ? [{ error: "not found" }] : [{ about: trecho, instagram: semInstagram ? null : instagram }])
        : acao === "web_data_instagram_profiles" ? [{ bio: trecho, posts: ["https://www.instagram.com/p/ABC123/"] }]
        : [{ content: trecho }];
      result = { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, result }, { headers: { "Mcp-Session-Id": "teste" } });
  });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = (id: string, dados: unknown = {}) => new Request(`http://localhost/api/leads/${id}/qualificacao`, { method: "POST", body: JSON.stringify(dados) });
  await t.test("POST retorna antes de terminar; evita duplicação e grava progresso e nota", async () => {
    const lead = novo(); let liberar!: () => void;
    bloqueio = new Promise<void>(resolve => { liberar = resolve; });
    const response = await POST(req(lead.id), params(lead.id));
    assert.equal(response.status, 202); const primeiro = (await response.json()).qualificacao;
    const segundo = iniciarQualificacaoProfunda(lead.id, undefined, true);
    assert.equal(primeiro.id, segundo.id); assert.equal(segundo.estado, "executando");
    liberar(); bloqueio = undefined; await aguardarQualificacao(lead.id);
    const job = qualificacaoAtual(lead.id)!;
    assert.equal(job.estado, "pronta"); assert.equal(job.resultado?.pontuacao, 100); assert.equal(job.resultado?.cobertura, 100);
    assert.equal(ws.obterLead(lead.id)?.status, "pesquisado"); assert.equal(chamadasIA, 1);
    assert.deepEqual(acoes, ["web_data_linkedin_person_profile", "search_engine", "web_data_linkedin_posts", "web_data_instagram_profiles", "web_data_instagram_posts"]);
    assert.equal(job.fontes.some(f => f.url.includes("homonimo")), false);
    const recarregada = await GET(new Request(req(lead.id).url), params(lead.id));
    assert.equal((await recarregada.json()).qualificacao.resultado.pontuacao, 100);
  });
  await t.test("citações inexistentes e atributos sensíveis não pontuam; ausência não vira rejeição", () => {
    const fontes = [{ url: linkedin, texto: trecho, titulo: "Perfil", consultadoEm: new Date().toISOString() }];
    const criterios = [{ criterio: "Perfil", peso: 60 }, { criterio: "Produto", peso: 40 }];
    let r = calcularPontuacao(criterios, [{ indice: 0, resultado: "atende", fonte: linkedin, trecho }, { indice: 1, resultado: "atende", fonte: linkedin, trecho: "Uma afirmação inventada" }], fontes);
    assert.equal(r.pontuacao, 60); assert.equal(r.cobertura, 60); assert.equal(r.criterios[1].resultado, "nao_verificavel");
    r = calcularPontuacao(criterios, [{ indice: 0, resultado: "atende", fonte: "https://inventada.com", trecho }], fontes);
    assert.equal(r.pontuacao, null);
    const sensivel = "Sua convicção religiosa é uma característica pessoal.";
    r = calcularPontuacao(criterios, [{ indice: 0, resultado: "atende", fonte: linkedin, trecho: sensivel }], [{ ...fontes[0], texto: sensivel }]);
    assert.equal(r.pontuacao, null);
  });
  await t.test("Instagram só vinculado ou confirmado; falhas de IA preservam fontes", async () => {
    semInstagram = true; http = 401; acoes.length = 0;
    const lead = novo(); iniciarQualificacaoProfunda(lead.id); await aguardarQualificacao(lead.id);
    const job = qualificacaoAtual(lead.id)!; assert.equal(job.estado, "falhou"); assert.ok(job.fontes.length); assert.equal(job.resultado, null);
    assert.equal(acoes.some(a => a.includes("instagram")), false);
    http = 200;
    iniciarQualificacaoProfunda(lead.id, instagram, true); await aguardarQualificacao(lead.id);
    assert.ok(qualificacaoAtual(lead.id)?.fontes.some(f => f.url === instagram));
    assert.equal(instagramValido("https://instagram.com.evil.test/pessoa"), null);
    assert.equal((await POST(req(lead.id, { instagram: "https://instagram.com/p/ABC" }), params(lead.id))).status, 400);
  });
  await t.test("marcar qualificado inicia pesquisa; atualização em background preserva status posterior", async () => {
    const lead = novo(); const r = await PUT(new Request(`http://localhost/api/leads/${lead.id}`, { method: "PUT", body: JSON.stringify({ status: "qualificado" }) }), params(lead.id));
    assert.equal(r.status, 200); ws.atualizarLead(lead.id, { status: "abordado" });
    await aguardarQualificacao(lead.id); assert.equal(ws.obterLead(lead.id)?.status, "abordado"); assert.ok(qualificacaoAtual(lead.id)?.resultado);
  });
  await t.test("reinício e remoção não deixam trabalho fantasma nem recriam dados", async () => {
    const lead = novo(); iniciarQualificacaoProfunda(lead.id); await aguardarQualificacao(lead.id);
    const salvo = qualificacaoAtual(lead.id)!; salvarQualificacaoProfunda({ ...salvo, estado: "executando" });
    assert.equal(qualificacaoAtual(lead.id)?.estado, "falhou");
    let liberar!: () => void; bloqueio = new Promise<void>(resolve => { liberar = resolve; });
    iniciarQualificacaoProfunda(lead.id, undefined, true); await new Promise(resolve => setImmediate(resolve));
    ws.apagarLead(lead.id); liberar(); bloqueio = undefined; await aguardarQualificacao(lead.id);
    assert.equal(obterQualificacaoProfunda(lead.id), null);
  });
  await t.test("sem perfil ou fonte real não produz demonstração nem nota", async () => {
    const lead = novo(null); iniciarQualificacaoProfunda(lead.id); await aguardarQualificacao(lead.id);
    assert.equal(qualificacaoAtual(lead.id)?.estado, "falhou"); assert.equal(qualificacaoAtual(lead.id)?.resultado, null);
    erroPerfil = true; const l = novo(); iniciarQualificacaoProfunda(l.id); await aguardarQualificacao(l.id);
    assert.equal(qualificacaoAtual(l.id)?.fontes.some(f => f.titulo.includes("Perfil público do LinkedIn")), false);
    delete process.env.BRIGHTDATA_API_KEY; const semFonte = novo(); iniciarQualificacaoProfunda(semFonte.id); await aguardarQualificacao(semFonte.id);
    assert.equal(qualificacaoAtual(semFonte.id)?.fontes.length, 0); assert.equal(qualificacaoAtual(semFonte.id)?.estado, "falhou");
  });
});

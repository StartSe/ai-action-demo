import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { carregarConversaComRecuperacao } from "./carregar-conversa";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "recuperacao-ia-"));
process.env.OPENROUTER_API_KEY = "teste-local";
const { askText, ErroIA } = await import("./ai");

test("leitura recupera 502 HTML sem perder a conversa", async (t) => {
  let chamadas = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal);
    return ++chamadas === 1 ? new Response("<html>Bad Gateway</html>", { status: 502 }) : Response.json({ transcricao: [{ texto: "Resposta salva" }] });
  });
  const res = await carregarConversaComRecuperacao("http://localhost/conversa");
  assert.equal((await res.json()).transcricao[0].texto, "Resposta salva");
  assert.equal(chamadas, 2);
});

test("leitura para após três falhas e não repete link expirado", async (t) => {
  let chamadas = 0;
  const mock = t.mock.method(globalThis, "fetch", async () => { chamadas++; return new Response(null, { status: 502 }); });
  assert.equal((await carregarConversaComRecuperacao("http://localhost/conversa")).status, 502);
  assert.equal(chamadas, 3);
  mock.mock.mockImplementation(async () => { chamadas++; return new Response(null, { status: 410 }); });
  assert.equal((await carregarConversaComRecuperacao("http://localhost/conversa")).status, 410);
  assert.equal(chamadas, 4);
});

test("IA recupera 502 temporário com prazo de espera", async (t) => {
  let chamadas = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.ok(init.signal);
    return ++chamadas === 1 ? new Response("Bad Gateway", { status: 502 }) : Response.json({ choices: [{ message: { content: "Resposta" } }] });
  });
  assert.equal(await askText({ system: "Teste", prompt: "Teste" }), "Resposta");
  assert.equal(chamadas, 2);
});

test("IA não repete erro de credencial e limita indisponibilidade persistente", async (t) => {
  let chamadas = 0;
  const mock = t.mock.method(globalThis, "fetch", async () => { chamadas++; return new Response("Unauthorized", { status: 401 }); });
  await assert.rejects(askText({ system: "", prompt: "" }), (err) => err instanceof ErroIA && err.codigo === "chave_invalida");
  assert.equal(chamadas, 1);
  mock.mock.mockImplementation(async () => { chamadas++; return new Response("Bad Gateway", { status: 502 }); });
  await assert.rejects(askText({ system: "", prompt: "" }), (err) => err instanceof ErroIA && err.codigo === "provedor_fora");
  assert.equal(chamadas, 3);
});

test("convite prepara roteiro recuperando 502 e abertura usa apenas dados salvos", async (t) => {
  const { criar: vaga } = await import("./vagas");
  const { criar: candidato } = await import("./candidatos");
  const { atribuirEConvidar } = await import("./convite");
  const { POST } = await import("../app/api/entrevista/candidato/[token]/falar/route");
  const { GET } = await import("../app/api/entrevista/candidato/[token]/conversa/route");
  let chamadas = 0;
  t.mock.method(globalThis, "fetch", async () => {
    chamadas++;
    if (chamadas === 1) return new Response("Bad Gateway", { status: 502 });
    const resposta = chamadas === 2 ? { perguntas: [{ bloco: "abertura", pergunta: "Conte sobre sua trajetória." }, { bloco: "encerramento", pergunta: "Tem alguma pergunta?" }] } : { fala: "Olá, Ana! Conte sobre sua trajetória." };
    return Response.json({ choices: [{ message: { content: JSON.stringify(resposta) } }] });
  });
  const convite = await atribuirEConvidar({ vagaId: vaga({ cargo: "Analista" }).id, candidatoId: candidato({ nome: "Ana" }).id, origem: "http://localhost" });
  assert.ok(convite.ok);
  assert.equal(chamadas, 2, "roteiro preparado antes de entregar o convite, incluindo recuperação do 502");
  const params = { params: Promise.resolve({ token: convite.convite.codigo }) };
  const abertura = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ resposta: "", ordem: 0 }) }), params);
  assert.equal(abertura.status, 200);
  const turno = await abertura.json();
  assert.ok(turno.pergunta);
  assert.equal(turno.transcricao.length, 1);
  const antes = chamadas;
  const retomada = await GET(new Request("http://localhost"), params);
  assert.equal(retomada.status, 200);
  assert.deepEqual((await retomada.json()).transcricao, turno.transcricao);
  assert.equal(chamadas, antes, "retomada usa o roteiro salvo, sem depender do provedor");
});

test("inícios concorrentes compartilham roteiro e primeira pergunta, sem chamada extra de IA", async (t) => {
  const { criar: vaga } = await import("./vagas");
  const { criar: candidato } = await import("./candidatos");
  const { atribuirEConvidar } = await import("./convite");
  const { proximaFala } = await import("./roteiro");
  const { transcricao } = await import("./entrevistas");
  let chamadas = 0;
  t.mock.method(globalThis, "fetch", async () => {
    chamadas++;
    await new Promise(resolve => setTimeout(resolve, 20));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ perguntas: [{ bloco: "abertura", pergunta: "Conte sobre sua trajetória." }, { bloco: "encerramento", pergunta: "Tem alguma pergunta?" }] }) } }] });
  });
  const convite = await atribuirEConvidar({ vagaId: vaga({ cargo: "Analista" }).id, candidatoId: candidato({ nome: "Ana" }).id, origem: "http://localhost" });
  assert.ok(convite.ok);
  const [primeira, repetida] = await Promise.all([proximaFala(convite.entrevista.id), proximaFala(convite.entrevista.id)]);
  assert.equal(chamadas, 1);
  assert.deepEqual(primeira, repetida);
  assert.match(primeira.pergunta, /Olá, Ana! Conte sobre sua trajetória/);
  assert.equal(transcricao(convite.entrevista.id).length, 1);
});

test("prazo de preparação cancela o provedor lento e encerra a espera", async (t) => {
  const { askJSON } = await import("./ai");
  // O timer mantém o teste vivo enquanto AbortSignal.timeout, que é unref, dispara.
  const manterVivo = setTimeout(() => {}, 1000);
  t.after(() => clearTimeout(manterVivo));
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  }));
  await assert.rejects(askJSON({ system: "", prompt: "", limiteMs: 20 }), (err) => err instanceof ErroIA && err.codigo === "rede");
});

test("falha no planejamento não libera link e nova tentativa reaproveita a entrevista", async (t) => {
  const { criar: criarVaga } = await import("./vagas");
  const { criar: criarCandidato } = await import("./candidatos");
  const { atribuirEConvidar } = await import("./convite");
  const { entrevistaViva, lerRoteiro } = await import("./entrevistas");
  const parametros = { vagaId: criarVaga({ cargo: "Analista" }).id, candidatoId: criarCandidato({ nome: "Bia" }).id, origem: "http://localhost" };
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("Unauthorized", { status: 401 }));
  const falha = await atribuirEConvidar(parametros);
  assert.equal(falha.ok, false);
  const entrevista = entrevistaViva(parametros.vagaId, parametros.candidatoId)!;
  assert.ok(!entrevista.codigo);
  assert.equal(lerRoteiro(entrevista.id), null);
  let chamadas = 0;
  mock.mock.mockImplementation(async () => {
    chamadas++;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ perguntas: [{ bloco: "abertura", pergunta: "Conte sobre sua trajetória." }] }) } }] });
  });
  const [convite, repetido] = await Promise.all([atribuirEConvidar(parametros), atribuirEConvidar(parametros)]);
  assert.ok(convite.ok && repetido.ok);
  assert.equal(convite.entrevista.id, entrevista.id);
  assert.equal(convite.convite.codigo, repetido.convite.codigo);
  assert.equal(chamadas, 1);
  assert.ok(lerRoteiro(entrevista.id));
});

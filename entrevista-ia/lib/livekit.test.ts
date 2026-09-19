import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-livekit-"));
delete process.env.OPENROUTER_API_KEY;
const { criar: vaga } = await import("./vagas");
const { criar: candidato } = await import("./candidatos");
const { atribuirEConvidar } = await import("./convite");
const { transcricao, lerRoteiro } = await import("./entrevistas");
const { proximaFala } = await import("./roteiro");
const { configuracaoVoz, tokenDaEntrevista } = await import("./livekit");
const { llm, initializeLogger } = await import("@livekit/agents");
const { RoteiroLLM } = await import("../agents/roteiro-llm");
initializeLogger({ pretty: false, level: "silent" });

test("pipeline LiveKit usa roteiro salvo e não duplica turno repetido", async () => {
  const convite = await atribuirEConvidar({ vagaId: vaga({ cargo: "Analista", numeroPerguntas: 6 }).id, candidatoId: candidato({ nome: "Ana" }).id, origem: "http://localhost" });
  assert.ok(convite.ok);
  const id = convite.entrevista.id;
  assert.ok(lerRoteiro(id));
  await proximaFala(id);
  const eventos: unknown[] = [];
  const modelo = new RoteiroLLM(id, async (fala) => { eventos.push(fala); });
  const contexto = llm.ChatContext.empty();
  contexto.addMessage({ role: "user", content: "Trabalhei na equipe de atendimento por três anos e organizei o acompanhamento dos clientes para reduzir o tempo de resposta." });
  const primeira = await modelo.chat({ chatCtx: contexto }).collect();
  assert.ok(primeira.text.length > 0);
  const antes = transcricao(id).length;
  const repetida = await modelo.chat({ chatCtx: contexto }).collect();
  assert.equal(repetida.text, primeira.text);
  assert.equal(transcricao(id).length, antes);
  assert.equal(transcricao(id).filter((f) => f.papel === "candidato").length, 1);
  assert.equal(eventos.length, 2);
  await modelo.aclose();
});

test("token só permite entrar na sala da entrevista e não expõe credenciais", async (t) => {
  const config = { LIVEKIT_URL: "wss://teste.livekit.cloud", LIVEKIT_API_KEY: "teste", LIVEKIT_API_SECRET: "segredo-local-somente-teste", ELEVENLABS_API_KEY: "voz-teste", OPENROUTER_API_KEY: "ia-teste", ELEVENLABS_VOICE_ID: "voz-escolhida", ELEVENLABS_MODEL_ID: "eleven_turbo_v2_5" };
  Object.assign(process.env, config);
  t.after(() => { for (const chave of Object.keys(config)) delete process.env[chave]; });
  const { TokenVerifier } = await import("livekit-server-sdk");
  const acesso = await tokenDaEntrevista("entrevista-teste");
  const jwt = await new TokenVerifier(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET).verify(acesso.token);
  assert.match(jwt.video?.room || "", /^entrevista-entrevista-teste-/);
  assert.notEqual((await tokenDaEntrevista("entrevista-teste")).room, acesso.room, "reconexão explícita despacha um novo agente");
  assert.equal(jwt.video?.roomJoin, true);
  assert.equal(jwt.video?.roomAdmin, undefined);
  assert.equal(jwt.sub, "candidato-entrevista-teste");
  assert.equal(jwt.roomConfig?.agents?.[0]?.agentName, "entrevistadora");
  const publico = JSON.stringify(acesso);
  assert.ok(!publico.includes(config.ELEVENLABS_API_KEY));
  assert.ok(!publico.includes(config.OPENROUTER_API_KEY));
  assert.deepEqual(configuracaoVoz(), { apiKey: "voz-teste", voiceId: "voz-escolhida", model: "eleven_turbo_v2_5" });
});

test("AgentSession encaminha entrada por texto ao modelo e salva a conversa", async () => {
  const { voice } = await import("@livekit/agents");
  const convite = await atribuirEConvidar({ vagaId: vaga({ cargo: "Suporte" }).id, candidatoId: candidato({ nome: "Bia" }).id, origem: "http://localhost" });
  assert.ok(convite.ok);
  await proximaFala(convite.entrevista.id);
  let respondeu = false;
  const modelo = new RoteiroLLM(convite.entrevista.id, async () => { respondeu = true; });
  const session = new voice.AgentSession({ llm: modelo });
  try {
    await session.start({ agent: new voice.Agent({ instructions: "Siga o roteiro." }), inputOptions: { audioEnabled: false }, outputOptions: { audioEnabled: false } });
    await session.generateReply({ userInput: "Trabalhei com atendimento durante três anos e organizei os processos para reduzir prazos de resposta aos clientes da empresa." }).waitForPlayout();
    assert.equal(respondeu, true);
    assert.equal(transcricao(convite.entrevista.id).filter((f) => f.papel === "candidato").length, 1);
  } finally { await session.close(); }
});

test("porta de voz exige consentimento neste aparelho e recusa convite cancelado", async () => {
  const { POST } = await import("../app/api/entrevista/candidato/[token]/livekit/route");
  const { cancelarConvite } = await import("./convite");
  const convite = await atribuirEConvidar({ vagaId: vaga({ cargo: "Suporte" }).id, candidatoId: candidato({ nome: "Bia" }).id, origem: "http://localhost" });
  assert.ok(convite.ok);
  const params = { params: Promise.resolve({ token: convite.convite.codigo }) };
  assert.equal((await POST(new Request("http://localhost", { method: "POST" }), params)).status, 403);
  cancelarConvite(convite.entrevista.id);
  assert.equal((await POST(new Request("http://localhost", { method: "POST" }), params)).status, 410);
});

test("trava no banco serializa turnos entre chamadores independentes", async () => {
  const { comTurnoExclusivo } = await import("./trava-entrevista");
  const { criar } = await import("./entrevistas");
  const entrevista = criar({ vagaId: vaga({ cargo: "Suporte" }).id, candidatoId: candidato({ nome: "Bia" }).id });
  const ordem: string[] = [];
  await Promise.all([
    comTurnoExclusivo(entrevista.id, async () => { ordem.push("primeiro"); await new Promise((resolve) => setTimeout(resolve, 20)); ordem.push("fim-primeiro"); }),
    comTurnoExclusivo(entrevista.id, async () => { ordem.push("segundo"); }),
  ]);
  assert.deepEqual(ordem, ["primeiro", "fim-primeiro", "segundo"]);
});

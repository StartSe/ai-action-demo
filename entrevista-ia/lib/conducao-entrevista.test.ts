import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { llm, voice, initializeLogger } from "@livekit/agents";
import { CONDUCAO_VOZ } from "./conducao-voz";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "conducao-entrevista-"));
process.env.OPENROUTER_API_KEY = "teste-sem-rede";
delete process.env.OPENROUTER_MODEL;
const { RoteiroLLM } = await import("../agents/roteiro-llm");
const { criar: criarVaga } = await import("./vagas");
const { criar: criarCandidato } = await import("./candidatos");
const { criar, salvarRoteiro, transcricao } = await import("./entrevistas");
const { proximaFala, conversaAtual, planejarRoteiro, contextoDaVaga } = await import("./roteiro");
const { contextoDaAvaliacao } = await import("./avaliacao");
const { modelName } = await import("./ai");
const { abrirBanco } = await import("./store");
after(() => { abrirBanco().close(); fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true }); });

const perguntas = Array.from({ length: 8 }, (_, i) => ({
  bloco: i === 0 ? "abertura" : i === 7 ? "encerramento" : "requisitos",
  pergunta: `Pergunta principal ${i + 1}?`,
}));
function preparar() {
  const vaga = criarVaga({ cargo: "Analista", numeroPerguntas: 8 });
  const entrevista = criar({ vagaId: vaga.id, candidatoId: criarCandidato({ nome: "Pessoa de teste" }).id });
  salvarRoteiro(entrevista.id, JSON.stringify({ versaoConducao: 2, perguntas, despedida: "Obrigada pela conversa!", demo: false, em: new Date().toISOString() }));
  return { vaga, entrevista };
}

test("voz: respostas curtas e repetições do SDK não pulam perguntas nem encerram cedo", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "openai/gpt-4.1-mini");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ fala: body.messages[1].content.includes("Instrução deste turno: aprofunde") ? "Qual foi a sua ação e o resultado?" : "Entendi o contexto." }) } }] });
  });
  const { entrevista } = preparar();
  const turnos: Awaited<ReturnType<typeof proximaFala>>[] = [await proximaFala(entrevista.id)];
  const modelo = new RoteiroLLM(entrevista.id, async fala => { turnos.push(fala); });
  assert.equal(modelo.model, "openai/gpt-4.1-mini");
  assert.equal(modelName(), "openai/gpt-4.1-mini");
  initializeLogger({ pretty: false, level: "silent" });
  const session = new voice.AgentSession({ llm: modelo, turnHandling: CONDUCAO_VOZ });
  assert.equal(session.sessionOptions.turnHandling.preemptiveGeneration.enabled, false, "o SDK não pode gerar turnos especulativos com efeitos no banco");
  const ctx = new llm.ChatContext();
  for (let i = 0; !modelo.terminou && i < 20; i++) {
    ctx.addMessage({ id: `resposta-${i}`, role: "user", content: "Fiz atendimento a clientes." });
    const texto = await modelo.responder(ctx);
    const tamanho = transcricao(entrevista.id).length;
    if (!modelo.terminou) {
      assert.equal(await modelo.responder(ctx), texto);
      assert.equal(transcricao(entrevista.id).length, tamanho);
      assert.deepEqual(await conversaAtual(entrevista.id), turnos.at(-1));
    }
  }
  assert.ok(modelo.terminou);
  assert.equal(contextoDaAvaliacao(entrevista.id).parcial, false);
  const falas = transcricao(entrevista.id).filter(f => f.papel === "entrevistadora").map(f => f.texto);
  for (const pergunta of perguntas) assert.equal(falas.filter(f => f.includes(pergunta.pergunta)).length, 1);
  assert.equal(falas.at(-1), "Obrigada pela conversa!");
  assert.deepEqual([...new Set(turnos.map(f => f.indice))], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(turnos.every(f => f.indice <= f.total));
});

test("pedir repetição mantém a pergunta e o espaço de aprofundamento", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: '{"fala":"Pode contar um exemplo?"}' } }] }));
  const { entrevista } = preparar();
  const primeira = await proximaFala(entrevista.id);
  const repeticao = await proximaFala(entrevista.id, "Pode repetir? Não ouvi.", 1);
  assert.equal(repeticao.indice, primeira.indice);
  assert.match(repeticao.pergunta, /Pergunta principal 1/);
  const aprofundamento = await proximaFala(entrevista.id, "Trabalhei com atendimento.", 2);
  assert.equal(aprofundamento.indice, 1);
  assert.equal(aprofundamento.encerrar, false);
  assert.equal((await proximaFala(entrevista.id, "Não sei responder.", 3)).indice, 2);
});

test("transição gerada não substitui a pergunta principal por despedida", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: '{"fala":"Obrigada pelo seu tempo, vamos encerrar!"}' } }] }));
  const { entrevista } = preparar();
  await proximaFala(entrevista.id);
  const seguinte = await proximaFala(entrevista.id, "Prefiro não responder.", 1);
  assert.equal(seguinte.pergunta, perguntas[1].pergunta);
  assert.equal(seguinte.encerrar, false);
});

test("planejamento incompleto é refeito e só aceita um roteiro completo", async t => {
  let chamadas = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: JSON.stringify({ perguntas: ++chamadas === 1 ? perguntas.slice(0, 1) : perguntas }) } }] }));
  const { vaga } = preparar();
  assert.equal((await planejarRoteiro(contextoDaVaga(vaga))).perguntas.length, 8);
  assert.equal(chamadas, 2);
});

test("planejamento sempre incompleto não vira entrevista de uma pergunta", async t => {
  let chamadas = 0;
  t.mock.method(globalThis, "fetch", async () => { chamadas++; return Response.json({ choices: [{ message: { content: JSON.stringify({ perguntas: perguntas.slice(0, 1) }) } }] }); });
  const { vaga } = preparar();
  await assert.rejects(planejarRoteiro(contextoDaVaga(vaga)), /não preparou todas as perguntas/);
  assert.equal(chamadas, 2);
});

test("duração configurada permanece entre 10 e 20 minutos", () => {
  assert.equal(criarVaga({ cargo: "Curta", duracaoMin: 1 }).duracaoMin, 10);
  assert.equal(criarVaga({ cargo: "Longa", duracaoMin: 30 }).duracaoMin, 20);
  assert.equal(criarVaga({ cargo: "Padrão" }).duracaoMin, 15);
});


test("o parecer continua parcial quando oito respostas cobrem só quatro perguntas principais", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: '{"fala":"Conte um exemplo concreto."}' } }] }));
  const { entrevista } = preparar();
  await proximaFala(entrevista.id);
  for (let i = 1; i <= 8; i++) await proximaFala(entrevista.id, "Tenho experiência.", i);
  assert.equal(contextoDaAvaliacao(entrevista.id).parcial, true);
});

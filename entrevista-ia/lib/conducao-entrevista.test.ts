import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
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
const { criar, salvarRoteiro, transcricao, lerMemoria } = await import("./entrevistas");
const { proximaFala, conversaAtual, planejarRoteiro, contextoDaVaga, FALA_CONTINUAR, lerMemoriaGravada } = await import("./roteiro");
const { contextoDaAvaliacao, notasNoPrompt } = await import("./avaliacao");
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
    assert.equal(body.model, "openai/gpt-5.4-mini");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ fala: body.messages[1].content.includes("Instrução deste turno: aprofunde") ? "Qual foi a sua ação e o resultado?" : "Entendi o contexto." }) } }] });
  });
  const { entrevista } = preparar();
  const turnos: Awaited<ReturnType<typeof proximaFala>>[] = [await proximaFala(entrevista.id)];
  const modelo = new RoteiroLLM(entrevista.id, async fala => { turnos.push(fala); });
  assert.equal(modelo.model, "openai/gpt-5.4-mini");
  assert.equal(modelName(), "openai/gpt-5.4-mini");
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

test("pedidos de repetição em várias formas repetem a ÚLTIMA fala, inclusive um aprofundamento", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const curta = body.messages[1].content.includes("Candidato: Trabalhei com atendimento.");
    return Response.json({ choices: [{ message: { content: JSON.stringify(curta ? { intencao: "resposta", aprofundar: true, fala: "Pode contar um exemplo concreto disso?" } : { intencao: "resposta", fala: "Entendi." }) } }] });
  });
  const { entrevista } = preparar();
  const primeira = await proximaFala(entrevista.id);
  let ordem = 0;
  for (const pedido of ["Você pode repetir a pergunta?", "não escutei", "hã"]) {
    const repeticao = await proximaFala(entrevista.id, pedido, ++ordem);
    assert.equal(repeticao.indice, primeira.indice, pedido);
    assert.equal(repeticao.pergunta, `Claro. ${perguntas[0].pergunta}`, pedido);
    assert.equal(repeticao.encerrar, false);
  }
  const aprofundamento = await proximaFala(entrevista.id, "Trabalhei com atendimento.", ++ordem);
  assert.equal(aprofundamento.pergunta, "Pode contar um exemplo concreto disso?");
  const repetida = await proximaFala(entrevista.id, "Desculpa, pode repetir?", ++ordem);
  assert.equal(repetida.pergunta, "Claro. Pode contar um exemplo concreto disso?", "repete o aprofundamento, não a pergunta do plano");
  assert.equal(repetida.indice, 1);
  const seguinte = await proximaFala(entrevista.id, "Prefiro não responder.", ++ordem);
  assert.equal(seguinte.indice, 2);
  assert.deepEqual(await conversaAtual(entrevista.id), seguinte);
});

test("'não terminei' devolve a palavra e refaz a pergunta que saiu cedo demais", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: '{"fala":"Entendi."}' } }] }));
  const { entrevista } = preparar();
  await proximaFala(entrevista.id);
  const longa = "Trabalhei quatro anos com atendimento a clientes B2B e hoje lidero o time de suporte, cuidando de uma carteira de sessenta contas; redesenhei os processos, treinei os colegas e medi os resultados toda semana para reduzir o tempo de resolução e a perda de clientes da carteira.";
  const segunda = await proximaFala(entrevista.id, longa, 1);
  assert.equal(segunda.indice, 2);
  const pausa = await proximaFala(entrevista.id, "Espera, eu não terminei.", 2);
  assert.equal(pausa.pergunta, FALA_CONTINUAR);
  assert.equal(pausa.indice, 1, "o indicador volta para a pergunta que estava sendo respondida");
  assert.equal(pausa.encerrar, false);
  const retomada = await proximaFala(entrevista.id, `${longa} E foi isso que me trouxe até aqui.`, 3);
  assert.equal(retomada.indice, 2);
  assert.ok(retomada.pergunta.includes(perguntas[1].pergunta), "a pergunta 2 é feita de novo");
  assert.deepEqual(await conversaAtual(entrevista.id), retomada);
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

const LONGA_NAO_VAGA = "Trabalhei quatro anos com atendimento a clientes B2B e hoje lidero o time de suporte, cuidando de uma carteira de sessenta contas; redesenhei os processos, treinei os colegas e medi os resultados toda semana para reduzir o tempo de resolução e a perda de clientes da carteira.";

/** Um modelo de mentira que devolve, para cada fala do candidato, a interpretação combinada no teste. */
function modeloQueInterpreta(t: TestContext, respostas: Record<string, Record<string, unknown>>, padrao: Record<string, unknown> = { intencao: "resposta", fala: "Entendi." }) {
  const prompts: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const prompt: string = body.messages[1].content;
    prompts.push(prompt);
    // A conversa inteira vai no prompt; o que se interpreta é a ÚLTIMA fala do candidato.
    const ultima = prompt.split("\n").filter((l) => l.startsWith("Candidato: ")).at(-1)?.slice("Candidato: ".length) ?? "";
    return Response.json({ choices: [{ message: { content: JSON.stringify(respostas[ultima] ?? padrao) } }] });
  });
  return prompts;
}

test("o modelo interpreta o que as regras não pegam: um pedido de repetição em outras palavras", async t => {
  modeloQueInterpreta(t, { "Acho que não peguei bem o que você quis dizer com isso.": { intencao: "repetir", fala: "" } });
  const { entrevista } = preparar();
  const primeira = await proximaFala(entrevista.id);
  const repeticao = await proximaFala(entrevista.id, "Acho que não peguei bem o que você quis dizer com isso.", 1);
  assert.equal(repeticao.pergunta, `Claro. ${perguntas[0].pergunta}`);
  assert.equal(repeticao.indice, primeira.indice);
  assert.equal(repeticao.transcricao.at(-1)?.passo, "retomar");
});

test("uma resposta curta que o modelo considera completa segue adiante, e a posição refeita concorda", async t => {
  modeloQueInterpreta(t, { "Sim, três anos com HubSpot na carteira de PMEs.": { intencao: "resposta", aprofundar: false, fala: "Ótimo, HubSpot é o que usamos aqui." } });
  const { entrevista } = preparar();
  await proximaFala(entrevista.id);
  const seguinte = await proximaFala(entrevista.id, "Sim, três anos com HubSpot na carteira de PMEs.", 1);
  assert.equal(seguinte.indice, 2, "sem aprofundamento: a segunda pergunta sai");
  assert.equal(seguinte.pergunta, `Ótimo, HubSpot é o que usamos aqui. ${perguntas[1].pergunta}`);
  assert.equal(seguinte.transcricao.at(-1)?.passo, "pergunta:1");
  // Pelas regras, uma resposta de sete palavras seria aprofundada; o passo gravado é o que mantém a
  // posição igual ao que a sala mostrou.
  assert.deepEqual(await conversaAtual(entrevista.id), seguinte);
  const terceira = await proximaFala(entrevista.id, LONGA_NAO_VAGA, 2);
  assert.equal(terceira.indice, 3);
  assert.ok(terceira.pergunta.includes(perguntas[2].pergunta));
});

test("'já respondi isso' e a próxima pergunta já coberta andam no roteiro sem pular abertura nem encerramento", async t => {
  modeloQueInterpreta(t, {
    "Isso eu já contei na primeira resposta.": { intencao: "ja_respondida", fala: "Verdade, você já comentou. Vamos adiante." },
    "Cobri duas de uma vez.": { intencao: "resposta", aprofundar: false, proximaJaCoberta: true, fala: "Você já adiantou o próximo ponto." },
  });
  const { entrevista } = preparar();
  await proximaFala(entrevista.id);
  await proximaFala(entrevista.id, LONGA_NAO_VAGA, 1);
  const pulada = await proximaFala(entrevista.id, "Isso eu já contei na primeira resposta.", 2);
  assert.equal(pulada.indice, 3);
  assert.equal(pulada.pergunta, `Verdade, você já comentou. Vamos adiante. ${perguntas[2].pergunta}`);
  const coberta = await proximaFala(entrevista.id, "Cobri duas de uma vez.", 3);
  assert.equal(coberta.indice, 5, "a pergunta 4 ficou coberta e a 5 sai");
  assert.ok(coberta.pergunta.includes(perguntas[4].pergunta));
  assert.equal(coberta.transcricao.at(-1)?.passo, "pergunta:4;coberta:3");
  assert.deepEqual(await conversaAtual(entrevista.id), coberta);
  // Cobrir a penúltima pergunta leva ao encerramento, que é feito — nunca coberto.
  await proximaFala(entrevista.id, LONGA_NAO_VAGA, 4);
  const quaseFim = await proximaFala(entrevista.id, "Cobri duas de uma vez.", 5);
  assert.equal(quaseFim.indice, 8);
  assert.ok(quaseFim.pergunta.includes(perguntas[7].pergunta), "o encerramento é feito, nunca coberto");
  assert.equal(quaseFim.transcricao.at(-1)?.passo, "pergunta:7;coberta:6");
  const fim = await proximaFala(entrevista.id, "Cobri duas de uma vez.", 6);
  assert.equal(fim.encerrar, true);
  assert.equal(fim.pergunta, "Obrigada pela conversa!");
  assert.equal(contextoDaAvaliacao(entrevista.id).parcial, false, "perguntas cobertas não deixam a entrevista parcial");
});

test("quando o modelo falha, valem as regras e a pergunta do plano sai crua", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  const { entrevista } = preparar();
  await proximaFala(entrevista.id);
  const curta = await proximaFala(entrevista.id, "Fiz atendimento.", 1);
  assert.equal(curta.indice, 1, "resposta curta: aprofundamento pela regra");
  assert.equal(curta.transcricao.at(-1)?.passo, "followup");
  const longa = await proximaFala(entrevista.id, LONGA_NAO_VAGA, 2);
  assert.equal(longa.pergunta, perguntas[1].pergunta);
  assert.equal(longa.indice, 2);
  assert.deepEqual(await conversaAtual(entrevista.id), longa);
});

test("as anotações são guardadas, entram no turno seguinte e chegam ao parecer", async t => {
  const prompts = modeloQueInterpreta(t, {
    "Liderei o suporte por três anos, com sessenta contas.": { intencao: "resposta", aprofundar: false, fala: "", notas: ["P1 (abertura): liderou suporte por três anos, sessenta contas; sem resultado citado"] },
    "Reduzi o churn em vinte por cento.": { intencao: "resposta", aprofundar: false, fala: "Você comentou a carteira de sessenta contas; faz sentido.", notas: ["P1 (abertura): liderou suporte por três anos, sessenta contas; sem resultado citado", "P2 (requisitos): reduziu churn em 20%; sem prazo"] },
    "Esqueci de copiar.": { intencao: "resposta", aprofundar: false, fala: "", notas: ["só a nova"] },
  });
  const { entrevista } = preparar();
  await proximaFala(entrevista.id);
  await proximaFala(entrevista.id, "Liderei o suporte por três anos, com sessenta contas.", 1);
  assert.deepEqual(lerMemoriaGravada(lerMemoria(entrevista.id)).notas, ["P1 (abertura): liderou suporte por três anos, sessenta contas; sem resultado citado"]);
  const segunda = await proximaFala(entrevista.id, "Reduzi o churn em vinte por cento.", 2);
  assert.match(prompts.at(-1)!, /Suas anotações até aqui:\n- P1 \(abertura\)/);
  assert.match(segunda.pergunta, /^Você comentou a carteira de sessenta contas; faz sentido\. /);
  assert.equal(lerMemoriaGravada(lerMemoria(entrevista.id)).notas.length, 2);
  await proximaFala(entrevista.id, "Esqueci de copiar.", 3);
  assert.equal(lerMemoriaGravada(lerMemoria(entrevista.id)).notas.length, 2, "uma lista mais curta que a anterior não apaga a memória");
  const ctx = contextoDaAvaliacao(entrevista.id);
  assert.equal(ctx.notas?.length, 2);
  assert.match(notasNoPrompt(ctx), /Anotações da entrevistadora[\s\S]*- P2 \(requisitos\): reduziu churn em 20%/);
  assert.match(notasNoPrompt(ctx), /vale a transcrição/);
  assert.equal(notasNoPrompt({ notas: [] }), "");
});

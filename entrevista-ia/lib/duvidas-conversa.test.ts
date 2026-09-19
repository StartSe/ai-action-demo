import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { llm } from "@livekit/agents";
import { temDuvidaSobreVaga, responderDuvidaDaVaga } from "./duvidas-vaga";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "duvidas-conversa-"));
process.env.OPENROUTER_API_KEY = "teste-sem-rede";
const { criar: criarVaga } = await import("./vagas");
const { criar: criarCandidato } = await import("./candidatos");
const { criar, salvarRoteiro, transcricao } = await import("./entrevistas");
const { contextoDaVaga, proximaFala, conversaAtual, falaAvulsa } = await import("./roteiro");
const { contextoDaAvaliacao } = await import("./avaliacao");
const { RoteiroLLM } = await import("../agents/roteiro-llm");
const { abrirBanco } = await import("./store");
after(() => { abrirBanco().close(); fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true }); });
const plano = { versaoConducao: 2 as const, perguntas: [
  { bloco: "abertura" as const, pergunta: "Conte sobre seu trabalho." },
  { bloco: "requisitos" as const, pergunta: "Como você atende um cliente?" },
  { bloco: "encerramento" as const, pergunta: "Tem alguma dúvida sobre a vaga?" },
], despedida: "Obrigada pelo seu tempo. Tchau!", demo: false, em: new Date().toISOString() };
function preparar() {
  const vaga = criarVaga({ cargo: "Analista", modelo: "hibrido", local: "São Paulo", salarioMin: 5000, salarioMax: 7000, salarioACombinar: false, perguntaPretensao: false });
  const e = criar({ vagaId: vaga.id, candidatoId: criarCandidato({ nome: "Pessoa" }).id });
  salvarRoteiro(e.id, JSON.stringify(plano));
  return { vaga, id: e.id };
}
test("reconhece perguntas sem pontuação, mas não salário ou disponibilidade em respostas", () => {
  for (const texto of ["qual é o salário", "e o salário", "A vaga é híbrida, presencial ou remota?", "queria saber sobre benefícios", "E quanto pagam", "qual o horário", "Posso perguntar uma coisa", "É home office", "Tem vale transporte", "É presencial ou híbrido"]) assert.equal(temDuvidaSobreVaga(texto), true, texto);
  for (const texto of ["Minha pretensão é 6000 reais", "Tenho disponibilidade para trabalhar remoto", "Não tenho dúvidas", "Nenhuma pergunta", "Trabalhei presencialmente por três anos"]) assert.equal(temDuvidaSobreVaga(texto), false, texto);
});
test("salário e modelo conhecidos são respondidos juntos, sem exigir pergunta de pretensão", () => {
  const { vaga } = preparar();
  const ctx = contextoDaVaga(vaga);
  const resposta = responderDuvidaDaVaga(ctx, "Qual o salário? A vaga é híbrida, presencial ou remota?");
  assert.match(resposta, /R\$ 5\.000 a R\$ 7\.000/); assert.match(resposta, /híbrido/);
  assert.equal(ctx.perguntaPretensao, false);
  const incompleta = responderDuvidaDaVaga({ ...ctx, faixaSalarial: undefined, modelo: undefined }, "Qual o salário e o modelo, e quais benefícios?");
  assert.match(incompleta, /a combinar/); assert.match(incompleta, /não foi informado/); assert.match(incompleta, /benefícios/); assert.doesNotMatch(incompleta, /R\$/);
});
test("dúvida no meio retoma a mesma pergunta, sem gastar aprofundamento ou avançar o roteiro", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: '{"fala":"Pode dar um exemplo?"}' } }] }));
  const { id } = preparar(); await proximaFala(id);
  const resposta = await proximaFala(id, "Qual é o salário e o modelo de trabalho?", 1);
  assert.equal(resposta.indice, 1); assert.equal(resposta.encerrar, false); assert.match(resposta.pergunta, /R\$ 5\.000/); assert.match(resposta.pergunta, /Conte sobre seu trabalho/);
  assert.deepEqual(await conversaAtual(id), resposta);
  const tamanho = transcricao(id).length;
  assert.deepEqual(await proximaFala(id, "Qual é o salário e o modelo de trabalho?", 1), resposta);
  assert.equal(transcricao(id).length, tamanho);
  const proxima = await proximaFala(id, "Prefiro não responder", 2); assert.equal(proxima.indice, 2);
});
test("no final aceita várias dúvidas e até uma dúvida após o tchau, pelo adaptador real de voz", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: '{"fala":"Entendido."}' } }] }));
  const { id } = preparar(); await proximaFala(id);
  await proximaFala(id, "Prefiro não responder", 1); await proximaFala(id, "Prefiro não responder", 2);
  const ctx = new llm.ChatContext(); let ultima: Awaited<ReturnType<typeof proximaFala>> | undefined;
  const modelo = new RoteiroLLM(id, async fala => { ultima = fala; });
  ctx.addMessage({ id: "duvida", role: "user", content: "Qual o salário? É presencial ou remoto?" });
  assert.match((await modelo.responder(ctx))!, /híbrido/); assert.equal(modelo.terminou, false); assert.equal(ultima?.indice, 3);
  ctx.addMessage({ id: "outra", role: "user", content: "Quais benefícios?" });
  assert.match((await modelo.responder(ctx))!, /recrutamento/); assert.equal(modelo.terminou, false);
  assert.equal(contextoDaAvaliacao(id).parcial, false, "perguntar sobre a vaga não torna a avaliação parcial");
  ctx.addMessage({ id: "fim", role: "user", content: "Não tenho mais dúvidas, obrigada" });
  assert.equal(await modelo.responder(ctx), plano.despedida); assert.equal(modelo.terminou, true);
  ctx.addMessage({ id: "lembrei", role: "user", content: "Espera, qual é o local de trabalho?" });
  assert.match((await modelo.responder(ctx))!, /São Paulo/); assert.equal(modelo.terminou, false);
  assert.deepEqual(await conversaAtual(id), ultima);
});
test("prévia e links antigos também respondem dúvidas na última pergunta", async () => {
  const { vaga } = preparar();
  const historico = plano.perguntas.flatMap(p => [{ papel: "entrevistadora" as const, texto: p.pergunta }, { papel: "candidato" as const, texto: "Prefiro não responder" }]);
  historico[historico.length - 1].texto = "Qual o salário e o horário?";
  const fala = await falaAvulsa(contextoDaVaga(vaga), plano, historico);
  assert.equal(fala.encerrar, false); assert.match(fala.pergunta, /R\$ 5\.000/); assert.match(fala.pergunta, /horários e jornada/);
});

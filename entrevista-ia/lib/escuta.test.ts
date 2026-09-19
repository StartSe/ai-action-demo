import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEscuta } from "./escuta";

function preparar(automatico = false) {
  let paradas = 0;
  let abortos = 0;
  const r = {
    start() {}, stop() { paradas++; }, abort() { abortos++; },
  } as unknown as SpeechRecognition;
  const estados: string[] = [];
  const textos: string[] = [];
  const finais: string[] = [];
  const falhas: { erro: string; texto: string }[] = [];
  const sessao = criarEscuta({
    reconhecimento: r, automatico,
    onEstado: (e) => estados.push(e), onTexto: (t) => textos.push(t),
    onFim: (t) => finais.push(t), onFalha: (erro, texto) => falhas.push({ erro, texto }),
  });
  function resultado(...partes: string[]) {
    r.onresult?.({ results: partes.map((transcript) => ({ 0: { transcript } })) } as unknown as SpeechRecognitionEvent);
  }
  return { r, sessao, resultado, estados, textos, finais, falhas, paradas: () => paradas, abortos: () => abortos };
}

test("toque: só indica ouvindo depois da abertura e entrega uma resposta ao parar", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = preparar();
  assert.deepEqual(s.estados, ["iniciando"]);
  s.r.onstart?.();
  s.resultado("Trabalhei em suporte", "durante três anos");
  t.mock.timers.tick(5000);
  assert.deepEqual(s.finais, [], "uma pausa não envia a resposta no modo manual");
  s.sessao.stop();
  s.sessao.stop();
  assert.equal(s.paradas(), 1);
  assert.equal(s.estados.at(-1), "transcrevendo");
  s.r.onend?.();
  assert.deepEqual(s.finais, ["Trabalhei em suporte durante três anos"]);
});

test("correções do reconhecimento substituem o texto sem duplicar frases finais", () => {
  const s = preparar();
  s.r.onstart?.();
  s.resultado("Liderei o time", "por dois");
  s.resultado("Liderei o time", "por três anos");
  s.r.onend?.();
  assert.deepEqual(s.finais, ["Liderei o time por três anos"]);
});

test("sem onend, preserva a transcrição parcial e libera a revisão", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = preparar();
  s.r.onstart?.();
  s.resultado("Meu exemplo de liderança");
  const fimAtrasado = s.r.onend;
  s.sessao.stop();
  t.mock.timers.tick(3000);
  fimAtrasado?.();
  assert.deepEqual(s.finais, ["Meu exemplo de liderança"]);
  assert.equal(s.abortos(), 1);
});

test("mãos livres espera silêncio desde o último trecho", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = preparar(true);
  s.r.onstart?.();
  s.resultado("Comecei");
  t.mock.timers.tick(1500);
  s.resultado("Comecei", "pelo planejamento");
  t.mock.timers.tick(1500);
  assert.equal(s.paradas(), 0);
  t.mock.timers.tick(500);
  assert.equal(s.paradas(), 1);
  s.r.onend?.();
  assert.deepEqual(s.finais, ["Comecei pelo planejamento"]);
});

test("falha de rede conserva o texto para continuar digitando", () => {
  const s = preparar();
  s.r.onstart?.();
  s.resultado("Minha experiência");
  s.r.onerror?.({ error: "network" } as SpeechRecognitionErrorEvent);
  assert.deepEqual(s.falhas, [{ erro: "network", texto: "Minha experiência" }]);
  assert.deepEqual(s.finais, []);
  assert.equal(s.r.onend, null);
});

test("abertura sem resposta do navegador termina com uma ação recuperável", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = preparar();
  t.mock.timers.tick(12000);
  assert.deepEqual(s.falhas, [{ erro: "tempo-esgotado", texto: "" }]);
});

test("sair da sala cancela microfone, prazos e eventos atrasados", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = preparar(true);
  s.r.onstart?.();
  s.resultado("Rascunho");
  const fimAtrasado = s.r.onend;
  s.sessao.abort();
  fimAtrasado?.();
  t.mock.timers.tick(15000);
  assert.deepEqual(s.finais, []);
  assert.deepEqual(s.falhas, []);
  assert.equal(s.paradas(), 0);
  assert.equal(s.abortos(), 1);
});

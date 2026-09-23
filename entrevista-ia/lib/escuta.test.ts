import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEscuta, janelaDeSilencio } from "./escuta";

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
  t.mock.timers.tick(2500);
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


test("a janela de silêncio cresce com a resposta e com a frase deixada aberta", () => {
  assert.equal(janelaDeSilencio("Sim."), 4000);
  assert.equal(janelaDeSilencio("Eu trabalhei lá porque"), 5500);
  assert.equal(janelaDeSilencio("Eu trabalhei lá,"), 5500);
  const longa = Array.from({ length: 45 }, (_, i) => `palavra${i}`).join(" ");
  assert.equal(janelaDeSilencio(longa), 6000);
  assert.equal(janelaDeSilencio(`${longa} e`), 7500);
});

test("mãos livres: pensar antes de começar a falar não fecha o microfone", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = preparar(true);
  s.r.onstart?.();
  for (let i = 0; i < 3; i++) {
    s.r.onerror?.({ error: "no-speech" } as SpeechRecognitionErrorEvent);
    s.r.onend?.();
    s.r.onstart?.();
  }
  assert.deepEqual(s.finais, []);
  assert.deepEqual(s.falhas, []);
  s.resultado("Agora sim, minha resposta");
  t.mock.timers.tick(4000);
  s.r.onend?.();
  assert.deepEqual(s.finais, ["Agora sim, minha resposta"]);
});

test("depois de muitas esperas sem fala nenhuma, devolve a vez com resposta vazia", () => {
  const s = preparar(true);
  s.r.onstart?.();
  for (let i = 0; i < 7; i++) {
    s.r.onerror?.({ error: "no-speech" } as SpeechRecognitionErrorEvent);
    s.r.onend?.();
    s.r.onstart?.();
  }
  assert.deepEqual(s.finais, [""]);
  assert.deepEqual(s.falhas, []);
});

test("mãos livres: uma resposta longa que o navegador fecha várias vezes continua inteira", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = preparar(true);
  s.r.onstart?.();
  const partes = ["Comecei em suporte", "depois fui para vendas", "e então liderei um time", "por três anos", "com bons resultados", "em duas empresas", "sempre medindo", "o que importava"];
  for (const parte of partes) {
    s.resultado(parte);
    t.mock.timers.tick(1000);
    s.r.onend?.();
    s.r.onstart?.();
  }
  assert.deepEqual(s.falhas, [], "oito fechamentos seguidos de texto novo não são falha");
  assert.equal(s.textos.at(-1), partes.join(" "));
  t.mock.timers.tick(4000);
  s.r.onend?.();
  assert.deepEqual(s.finais, [partes.join(" ")]);
});

test("fim espontâneo do reconhecimento não envia uma resposta incompleta", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const s = preparar(true);
  s.r.onstart?.();
  s.resultado("Atendi um cliente");
  t.mock.timers.tick(1000);
  s.r.onend?.();
  assert.deepEqual(s.finais, []);
  s.r.onstart?.();
  s.resultado("que queria cancelar o contrato");
  t.mock.timers.tick(3900);
  assert.equal(s.paradas(), 0);
  t.mock.timers.tick(100);
  s.r.onend?.();
  assert.deepEqual(s.finais, ["Atendi um cliente que queria cancelar o contrato"]);
});

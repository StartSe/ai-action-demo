import test from "node:test";
import assert from "node:assert/strict";
import { DESTAQUES_PAGOS, MODELOS_GRATUITOS, organizarModelos } from "../lib/modelos";

test("catálogo de modelos: recomendado, gratuitos, mais usados na ordem e pagos por contexto, sem variantes fora do chat", () => {
  const catalogo = [
    { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super (free)", context_length: 262144 },
    { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B (free)", context_length: 262144 },
    { id: "nvidia/nemotron-3.5-lightning:free", name: "Nemotron 3.5 Lightning (free)", context_length: 1000000 },
    { id: "nvidia/nemotron-3.5-content-safety:free", name: "Content Safety (free)", context_length: 128000 },
    { id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini", context_length: 400000 },
    { id: "openai/gpt-5.4-mini:batch", name: "GPT-5.4 Mini (batch)", context_length: 400000 },
    { id: "openai/gpt-5.4-image-2", name: "GPT-5.4 Image 2", context_length: 272000 },
    { id: "openai/gpt-5.3-codex", name: "GPT-5.3-Codex", context_length: 400000 },
    { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", context_length: 1048576 },
    { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", context_length: 1000000 },
    { id: "x-ai/grok-4.20", name: "Grok 4.20", context_length: 2000000 },
    { id: "openrouter/auto", name: "Auto Router", context_length: 2000000 },
    { id: "sem-barra", name: "inválido" },
  ];
  const opcoes = organizarModelos(catalogo, "nvidia/nemotron-3-super-120b-a12b:free");
  const ids = (grupo: string) => opcoes.filter((o) => o.grupo === grupo).map((o) => o.valor);
  assert.deepEqual(ids("recomendado"), ["nvidia/nemotron-3-super-120b-a12b:free"]);
  assert.deepEqual(ids("gratuito"), ["nvidia/nemotron-3.5-lightning:free", "google/gemma-4-31b-it:free"], "maior contexto primeiro; modelo de segurança fica de fora");
  assert.deepEqual(ids("destaque"), ["openai/gpt-5.4-mini", "google/gemini-3.8-flash", "anthropic/claude-sonnet-5"], "na ordem de DESTAQUES_PAGOS, só os que existem no catálogo");
  assert.deepEqual(ids("pago"), ["x-ai/grok-4.20", "openrouter/auto"], "sem lote, imagem, código nem repetir os destaques");
  assert.ok(!opcoes.some((o) => o.valor === "sem-barra"));
  assert.equal(new Set(opcoes.map((o) => o.valor)).size, opcoes.length, "nenhum modelo repetido");
  assert.deepEqual(organizarModelos([], "x"), [], "catálogo vazio devolve vazio para o chamador cair na rede de segurança");
});

test("rede de segurança e destaques trazem um gratuito recomendado e os pagos mais pedidos", () => {
  assert.equal(MODELOS_GRATUITOS[0].grupo, "recomendado");
  assert.ok(MODELOS_GRATUITOS.some((m) => m.valor.endsWith(":free") && m.grupo === "gratuito"), "ErrorBox precisa de um gratuito alternativo ao padrão");
  for (const id of ["openai/gpt-5.4-mini", "google/gemini-3.8-flash", "anthropic/claude-sonnet-5"]) {
    assert.ok(DESTAQUES_PAGOS.includes(id), `${id} nos destaques`);
    assert.ok(MODELOS_GRATUITOS.some((m) => m.valor === id), `${id} na rede de segurança`);
  }
});

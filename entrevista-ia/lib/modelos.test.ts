import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-modelos-"));
const { openrouter } = await import("./setup-comum");

test("OpenAI e Gemini aparecem sem chave e não desaparecem com catálogo extenso", async (t) => {
  const campo = openrouter({}).campos.find((c) => c.chave === "OPENROUTER_MODEL")!;
  const locais = await campo.opcoesDinamicas!({});
  assert.ok(locais.some((o) => o.valor === "google/gemini-3.5-flash"));
  assert.ok(locais.some((o) => o.valor === "openai/gpt-5.4-mini"));
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: [
    ...Array.from({ length: 25 }, (_, i) => ({ id: `outro/modelo-${i}`, context_length: 9999999 })),
    { id: "google/gemini-3.5-flash", context_length: 1000 },
    { id: "openai/gpt-5.4-mini", context_length: 1000 },
    { id: "openai/gpt-5.4-mini:batch", context_length: 99999999 },
    { id: "imagem/apenas", architecture: { output_modalities: ["image"] }, context_length: 99999999 },
  ] }));
  const catalogo = await campo.opcoesDinamicas!({ OPENROUTER_API_KEY: "teste" });
  assert.ok(catalogo.some((o) => o.valor === "google/gemini-3.5-flash"));
  assert.ok(catalogo.some((o) => o.valor === "openai/gpt-5.4-mini"));
  assert.ok(!catalogo.some((o) => /:batch|imagem\//.test(o.valor)));
});

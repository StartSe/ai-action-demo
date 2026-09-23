import test from "node:test";
import assert from "node:assert/strict";
import { sourcePreview } from "./source-preview";
const source = (payload: unknown) => ({
  title: "Coleta · obter mensagens",
  tags: ["coleta"],
  content: `## Instrução da coleta\nObter mensagens do Slack\n\n## Conteúdo original\n${JSON.stringify(payload)}`,
});
test("fontes antigas e novas mostram mensagens em texto sem repetir a instrução nem duplicar structuredContent", () => {
  const messages = Array.from({ length: 10 }, (_, i) => ({
    text: `Decisão ${i + 1}`,
    user: `U${i}`,
    ts: `178998000${i}.000001`,
  }));
  const note = source({
    content: [{ type: "text", text: JSON.stringify({ messages }) }],
    structuredContent: { messages },
  });
  const original = note.content;
  const preview = sourcePreview(note);
  assert.equal(preview.title, "Slack · 10 mensagens");
  assert.equal(preview.messages.length, 10);
  assert.equal(preview.messages[0].author, "U0");
  assert.match(preview.text, /Decisão 1/);
  assert.doesNotMatch(preview.text, /Instrução/);
  assert.equal(note.content, original);
});
test("texto de coleta e formatos desconhecidos têm leitura de fallback sem perder o original", () => {
  assert.equal(
    sourcePreview(
      source({ content: [{ type: "text", text: "Texto completo coletado" }] }),
    ).text,
    "Texto completo coletado",
  );
  assert.match(sourcePreview(source({ unknown: "valor" })).text, /valor/);
  const manual = { title: "Minha nota", tags: [], content: "Texto manual" };
  assert.equal(sourcePreview(manual).title, manual.title);
  assert.equal(sourcePreview(manual).text, manual.content);
  assert.equal(sourcePreview(manual).collected, false);
});

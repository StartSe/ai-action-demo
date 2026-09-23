import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "daily-voice-"));
process.env.DATA_DIR = dir;
const { setConfig, abrirBanco } = await import("./store");
const { POST } = await import("../app/api/voice/route");
test.after(() => {
  abrirBanco().close();
  rmSync(dir, { recursive: true, force: true });
});
test("voz envia áudio ao Scribe v2 e retorna transcrição revisável", async () => {
  const original = globalThis.fetch;
  setConfig("ELEVENLABS_API_KEY", "fixture-eleven-key");
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.elevenlabs.io/v1/speech-to-text");
    assert.equal(
      new Headers(init?.headers).get("xi-api-key"),
      "fixture-eleven-key",
    );
    const form = init?.body as FormData;
    assert.equal(form.get("model_id"), "scribe_v2");
    assert.equal(form.get("language_code"), "por");
    assert.ok(form.get("file") instanceof Blob);
    return Response.json({ text: "Minha nova ideia." });
  };
  try {
    const form = new FormData();
    form.set(
      "audio",
      new Blob(["fake audio"], { type: "audio/webm" }),
      "audio.webm",
    );
    const r = await POST(
      new Request("http://localhost/api/voice", { method: "POST", body: form }),
    );
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { text: "Minha nova ideia." });
  } finally {
    globalThis.fetch = original;
  }
});
test("síntese usa voz escolhida, limita tamanho e não devolve erro secreto do provedor", async () => {
  const original = globalThis.fetch;
  setConfig("ELEVENLABS_VOICE_ID", "selected-voice");
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("text-to-speech/selected-voice"));
    const b = JSON.parse(String(init?.body));
    assert.equal(b.model_id, "eleven_flash_v2_5");
    assert.equal(b.text.length, 2500);
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  };
  try {
    const request = () =>
      new Request("http://localhost/api/voice", {
        method: "POST",
        body: JSON.stringify({ text: "a".repeat(3000) }),
      });
    const r = await POST(request());
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("Content-Type"), "audio/mpeg");
    assert.equal((await r.arrayBuffer()).byteLength, 3);
    globalThis.fetch = async () =>
      new Response("fixture-eleven-key", { status: 401 });
    const error = await POST(request());
    assert.equal(error.status, 502);
    assert.ok(!(await error.text()).includes("fixture-eleven-key"));
  } finally {
    globalThis.fetch = original;
  }
});

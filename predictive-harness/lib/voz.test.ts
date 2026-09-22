import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "jev-voz-"));
process.env.DATA_DIR = dir;
delete process.env.ELEVENLABS_API_KEY;
delete process.env.ELEVENLABS_VOICE_ID;
const voz = await import("./voz");
const { abrirBanco } = await import("./store");
const fetchReal = globalThis.fetch;
const chamadas: { url: string; init?: RequestInit }[] = [];
let recusar = false;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input); chamadas.push({ url, init });
  if (recusar) return Response.json({ detail: "sensitive provider error" }, { status: 401 });
  if (url.includes("/v2/voices")) return Response.json({ voices: [
    { voice_id: "vozPT", name: "Português", labels: { accent: "portuguese" } },
    { voice_id: "vozBR", name: "Brasileira", labels: { accent: "brazilian" } },
  ], has_more: false });
  if (url.endsWith("/single-use-token/realtime_scribe")) return Response.json({ token: "single-use-test-token" });
  return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
}) as typeof fetch;
test.after(() => { globalThis.fetch = fetchReal; rmSync(dir, { recursive: true, force: true }); });

test("conexão verifica chave, cifra segredo e prioriza vozes brasileiras", async () => {
  await assert.rejects(voz.listarVozes(), /Conecte a ElevenLabs/);
  const key = "test-secret-elevenlabs-123456789";
  await voz.configurarVoz({ chave: key });
  const status = voz.statusVoz();
  assert.equal(status.conectado, true);
  assert.equal(status.vozId, "");
  assert.ok(!JSON.stringify(status).includes(key));
  const row = abrirBanco().prepare("SELECT valor FROM config WHERE chave = 'ELEVENLABS_API_KEY'").get() as { valor: string };
  assert.match(row.valor, /^v1:/);
  assert.ok(!row.valor.includes(key));
  const vozes = await voz.listarVozes();
  assert.equal(vozes[0].id, "vozBR");
  assert.equal(new URL(chamadas.at(-1)!.url).searchParams.get("language"), "pt");
  await assert.rejects(voz.configurarVoz({ vozId: "missing" }), /Escolha uma voz/);
  await voz.configurarVoz({ vozId: "vozBR" });
  assert.equal(voz.statusVoz().vozId, "vozBR");
});

test("fala e token de uso único usam os contratos da ElevenLabs sem expor credencial", async () => {
  const token = await voz.tokenVoz();
  assert.deepEqual(token, { token: "single-use-test-token" });
  assert.equal(chamadas.at(-1)!.init!.method, "POST");
  assert.ok((chamadas.at(-1)!.init!.headers as Record<string, string>)["xi-api-key"]);
  const audio = await voz.falar("Sua **margem** é de 30%.");
  assert.equal(audio.headers.get("content-type"), "audio/mpeg");
  assert.equal(audio.headers.get("cache-control"), "no-store");
  const call = chamadas.at(-1)!;
  assert.match(call.url, /text-to-speech\/vozBR/);
  assert.deepEqual(JSON.parse(String(call.init!.body)), { text: "Sua margem é de 30%.", model_id: "eleven_multilingual_v2" });
  await assert.rejects(voz.falar("x".repeat(10001)), /10.000/);
});

test("erro do provedor é seguro e desconectar remove a voz e a credencial", async () => {
  recusar = true;
  await assert.rejects(voz.listarVozes(), e => e instanceof Error && /recusou a credencial/.test(e.message) && !e.message.includes("sensitive"));
  recusar = false;
  await voz.configurarVoz({ desconectar: true });
  assert.equal(voz.statusVoz().conectado, false);
  assert.equal(voz.statusVoz().vozId, "");
  await assert.rejects(voz.falar("Teste"), /Selecione a voz padrão/);
});

test("voz ao vivo exige conversa válida e não aceita upload de áudio", async () => {
  const route = await import("../app/api/voz/route");
  const form = new FormData(); form.set("audio", new File(["x"], "audio.webm"));
  const upload = await route.POST(new Request("http://localhost/api/voz", { method: "POST", body: form }));
  assert.equal(upload.status, 415);
  const res = await route.POST(new Request("http://localhost/api/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tempoReal: true, conversaId: "inexistente" }) }));
  assert.equal(res.status, 404);
  await assert.rejects(voz.tokenVoz(), /Selecione a voz padrão/);
  await voz.configurarVoz({ chave: "test-secret-elevenlabs-987654321", vozId: "vozBR" });
  const { criarConversa } = await import("./sessoes");
  const conversa = criarConversa([]);
  const live = await route.POST(new Request("http://localhost/api/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tempoReal: true, conversaId: conversa.id }) }));
  assert.equal(live.status, 200);
  assert.equal(live.headers.get("cache-control"), "no-store");
  assert.deepEqual(await live.json(), { token: "single-use-test-token" });

});

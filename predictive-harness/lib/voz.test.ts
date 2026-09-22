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
let signedUrl = "wss://api.elevenlabs.io/v1/convai/conversation?token=temporary";
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input); chamadas.push({ url, init });
  if (recusar) return Response.json({ detail: "sensitive provider error" }, { status: 401 });
  if (url.includes("/v2/voices")) return Response.json({ voices: [
    { voice_id: "vozPT", name: "Português", labels: { accent: "portuguese" } },
    { voice_id: "vozBR", name: "Brasileira", labels: { accent: "brazilian" } },
  ], has_more: false });
  if (url.endsWith("/convai/tools")) return Response.json({ id: "tool-" + chamadas.length });
  if (url.endsWith("/agents/create")) return Response.json({ agent_id: "private-agent" });
  if (url.includes("get-signed-url")) return Response.json({ signed_url: signedUrl });
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

test("agente privado prepara ferramentas uma vez e emite sessões sem expor credencial", async () => {
  const results = await Promise.all([voz.sessaoVoz(), voz.sessaoVoz()]);
  assert.deepEqual(results, [{ signedUrl }, { signedUrl }]);
  await voz.sessaoVoz();
  const agentes = chamadas.filter(c => c.url.endsWith("/agents/create"));
  const tools = chamadas.filter(c => c.url.endsWith("/convai/tools"));
  assert.equal(agentes.length, 1);
  assert.equal(tools.length, 2);
  assert.deepEqual(tools.map(c => JSON.parse(String(c.init!.body)).tool_config.name), ["analisar_dados", "mostrar_analise"]);
  const config = JSON.parse(String(agentes[0].init!.body));
  assert.equal(config.platform_settings.auth.enable_auth, true);
  assert.equal(config.platform_settings.privacy.record_voice, false);
  assert.equal(config.conversation_config.agent.language, "pt");
  assert.equal(config.conversation_config.agent.prompt.tool_ids.length, 2);
  assert.equal(config.conversation_config.tts.voice_id, "vozBR");
  assert.equal(config.conversation_config.asr.user_input_audio_format, "pcm_16000");
  assert.ok(config.conversation_config.conversation.client_events.includes("conversation_initiation_metadata"));
  assert.ok(config.conversation_config.conversation.client_events.includes("ping"));
  assert.ok((chamadas.at(-1)!.init!.headers as Record<string, string>)["xi-api-key"]);
  signedUrl = "wss://untrusted.example/session";
  await assert.rejects(voz.sessaoVoz(), /endereço inválido/);
  signedUrl = "wss://api.elevenlabs.io/v1/convai/conversation?token=temporary";
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
  await assert.rejects(voz.sessaoVoz(), /Conecte a ElevenLabs/);
  await voz.configurarVoz({ chave: "test-secret-elevenlabs-987654321", vozId: "vozBR" });
  const { criarConversa } = await import("./sessoes");
  const conversa = criarConversa([]);
  const live = await route.POST(new Request("http://localhost/api/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tempoReal: true, conversaId: conversa.id }) }));
  assert.equal(live.status, 200);
  assert.equal(live.headers.get("cache-control"), "no-store");
  const data = await live.json();
  assert.equal(data.signedUrl, signedUrl);
  assert.deepEqual(JSON.parse(data.contexto).historico, []);
  assert.deepEqual(JSON.parse(data.contexto).fontes, []);
  assert.ok(!JSON.stringify(data).includes("test-secret"));

});

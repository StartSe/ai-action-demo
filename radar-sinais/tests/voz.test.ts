import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "radar-voz-"));
process.env.DATA_DIR = dir;
delete process.env.ELEVENLABS_API_KEY;
delete process.env.ELEVENLABS_VOICE_ID;
test("Conversa por voz", async t => {
const voz = await import("../lib/voz");
const { abrirBanco } = await import("../lib/store");
const fetchReal = globalThis.fetch;
const chamadas: { url: string; init?: RequestInit }[] = [];
let recusar = false;
let falha: { caminho: string; status: number; detail: unknown } | null = null;
let signedUrl = "wss://api.elevenlabs.io/v1/convai/conversation?token=temporary";
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input); chamadas.push({ url, init });
  if (falha && url.includes(falha.caminho)) return Response.json({ detail: falha.detail }, { status: falha.status });
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
t.after(() => { globalThis.fetch = fetchReal; rmSync(dir, { recursive: true, force: true }); });

await t.test("conexão verifica chave, cifra segredo e prioriza vozes brasileiras", async () => {
  await assert.rejects(voz.listarVozes(), /Conecte a ElevenLabs/);
  const key = "test-secret-elevenlabs-123456789";
  await voz.configurarVoz({ chave: key });
  const status = voz.statusVoz();
  assert.equal(status.conectado, true);
  assert.equal(status.vozId, "");
  assert.equal(status.conversa.estado, "nao_verificada");
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

await t.test("agente privado prepara ferramentas uma vez e emite sessões sem expor credencial", async () => {
  const results = await Promise.all([voz.sessaoVoz(), voz.sessaoVoz()]);
  assert.deepEqual(results, [{ signedUrl }, { signedUrl }]);
  await voz.sessaoVoz();
  const agentes = chamadas.filter(c => c.url.endsWith("/agents/create"));
  const tools = chamadas.filter(c => c.url.endsWith("/convai/tools"));
  assert.equal(agentes.length, 1);
  assert.equal(tools.length, 1);
  assert.deepEqual(tools.map(c => JSON.parse(String(c.init!.body)).tool_config.name), ["consultar_radar"]);
  const config = JSON.parse(String(agentes[0].init!.body));
  assert.equal(config.platform_settings.auth.enable_auth, true);
  assert.equal(config.platform_settings.privacy.record_voice, false);
  assert.equal(config.conversation_config.agent.language, "pt");
  assert.equal(config.conversation_config.agent.prompt.tool_ids.length, 1);
  assert.equal(config.conversation_config.tts.voice_id, "vozBR");
  assert.equal(config.conversation_config.asr.user_input_audio_format, "pcm_16000");
  assert.ok(config.conversation_config.conversation.client_events.includes("conversation_initiation_metadata"));
  assert.ok(config.conversation_config.conversation.client_events.includes("ping"));
  assert.ok((chamadas.at(-1)!.init!.headers as Record<string, string>)["xi-api-key"]);
  signedUrl = "wss://untrusted.example/session";
  await assert.rejects(voz.sessaoVoz(), /endereço inválido/);
  signedUrl = "wss://api.elevenlabs.io/v1/convai/conversation?token=temporary";

});

await t.test("erro do provedor é seguro e desconectar remove a voz e a credencial", async () => {
  recusar = true;
  await assert.rejects(voz.listarVozes(), e => e instanceof Error && /negou acesso/.test(e.message) && !e.message.includes("sensitive"));
  recusar = false;
  await voz.configurarVoz({ desconectar: true });
  assert.equal(voz.statusVoz().conectado, false);
  assert.equal(voz.statusVoz().vozId, "");
  assert.equal(voz.statusVoz().conversa.estado, "nao_verificada");

});

await t.test("salvar voz detecta chave que lista vozes mas não cria ferramentas e permite recuperar sem desconectar", async () => {
  const route = await import("../app/api/voz/route");
  await voz.configurarVoz({ chave: "test-restricted-tools-key" });
  const inicio = chamadas.length;
  falha = { caminho: "/convai/tools", status: 401, detail: { status: "missing_permissions", message: "Missing convai_write permission; sensitive provider error test-secret" } };
  const req = (data: unknown) => new Request("http://localhost/api/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const saved = await route.PUT(req({ vozId: "vozBR" }));
  assert.equal(saved.status, 200, "a seleção é preservada mesmo se a verificação falha");
  const data = await saved.json();
  assert.equal(data.conectado, true);
  assert.equal(data.vozId, "vozBR");
  assert.equal(data.conversa.estado, "erro");
  assert.match(data.conversa.mensagem, /ferramentas.*convai_write/);
  assert.ok(!JSON.stringify(data).includes("test-secret"));
  assert.ok(!JSON.stringify(data).includes("sensitive"));
  assert.equal(voz.statusVoz().conversa.estado, "erro");
  falha = null;
  const verified = await route.POST(req({ verificar: true }));
  assert.equal(verified.status, 200);
  const ok = await verified.json();
  assert.equal(ok.conversa.estado, "pronta");
  assert.ok(ok.conversa.verificadoEm);
  assert.equal(ok.conversa.mensagem, undefined);
  assert.equal(ok.signedUrl, undefined, "teste não envia URL assinada ao navegador");
  assert.ok(!JSON.stringify(ok).includes("test-restricted"));
  assert.equal(voz.statusVoz().conversa.estado, "pronta");
  assert.ok(!chamadas.slice(inicio).some(c => c.url.includes("text-to-speech")), "verificar não gera áudio");
});

await t.test("negação ao criar agente identifica etapa e nova tentativa reutiliza ferramentas já criadas", async () => {
  await voz.configurarVoz({ chave: "test-restricted-agent-key", vozId: "vozBR" });
  const inicio = chamadas.length;
  falha = { caminho: "/agents/create", status: 403, detail: { status: "missing_permissions", message: "convai_write" } };
  const denied = await voz.verificarVoz();
  assert.match(denied.conversa.mensagem!, /agente conversacional/);
  const tools = () => chamadas.slice(inicio).filter(c => c.url.endsWith("/convai/tools"));
  assert.equal(tools().length, 1);
  await voz.verificarVoz();
  assert.equal(tools().length, 1);
  falha = null;
  assert.equal((await voz.verificarVoz()).conversa.estado, "pronta");
  assert.equal(tools().length, 1);
});

await t.test("negação ao autorizar sessão não aparece como credencial inválida nem como conversa pronta", async () => {
  falha = { caminho: "get-signed-url", status: 401, detail: { status: "missing_permissions", message: "convai_read" } };
  await assert.rejects(voz.sessaoVoz(), /autorizar a sessão.*convai_read/);
  assert.equal(voz.statusVoz().conectado, true);
  assert.equal(voz.statusVoz().conversa.estado, "erro");
  falha = null;
  await voz.verificarVoz();
  await voz.configurarVoz({ vozId: "vozPT" });
  assert.equal(voz.statusVoz().conversa.estado, "nao_verificada");
  await voz.verificarVoz();
  await voz.configurarVoz({ chave: "test-replacement-key" });
  assert.equal(voz.statusVoz().conversa.estado, "nao_verificada");
  await assert.rejects(voz.verificarVoz(), /Selecione a voz/);
});

});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "radar-provider-"));
process.env.DATA_DIR = dir;
delete process.env.AI_PROVIDER;
delete process.env.CHATGPT_MODEL;
delete process.env.OPENROUTER_API_KEY;
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; rmSync(dir, { recursive: true, force: true }); });

test("provedor escolhido governa status, síntese, modelo e erros sem fallback", async () => {
  const { setConfig } = await import("../lib/store");
  const { aiEnabled, askJSON, modelName } = await import("../lib/ai");
  const { chatGPT } = await import("../lib/chatgpt");
  const bridge = chatGPT();
  const account = bridge.account.bind(bridge), run = bridge.run.bind(bridge), models = bridge.models.bind(bridge);
  let conectado = true;
  const chamadas: { model?: string; system: string; prompt: string }[] = [];
  let chamadasOpenRouter = 0;
  bridge.account = async () => ({ account: conectado ? { type: "chatgpt", email: "test@example.com" } : null, login: null, error: null });
  bridge.models = async () => [{ id: "modelo-chat", name: "Modelo Chat" }];
  bridge.run = async opts => { chamadas.push(opts); return '{"resposta":"ChatGPT"}'; };
  global.fetch = async input => {
    assert.equal(String(input), "https://openrouter.ai/api/v1/chat/completions");
    chamadasOpenRouter++;
    return Response.json({ choices: [{ message: { content: '{"resposta":"OpenRouter"}' } }] });
  };
  try {
    setConfig("OPENROUTER_API_KEY", "teste");
    assert.equal(await aiEnabled(), true);
    assert.deepEqual(await askJSON({ system: "s", prompt: "p" }), { resposta: "OpenRouter" });
    const { PUT } = await import("../app/api/ia/route");
    const req = (v: unknown) => new Request("http://localhost/api/ia", { method: "PUT", body: JSON.stringify(v) });
    assert.equal((await PUT(req({ provedor: "chatgpt", modelo: "inexistente" }))).status, 400);
    assert.equal((await PUT(req({ provedor: "chatgpt", modelo: "modelo-chat" }))).status, 200);
    assert.equal(modelName("ontologia"), "modelo-chat");
    assert.equal(await aiEnabled(), true);
    assert.deepEqual(await askJSON({ system: "s", prompt: "p" }), { resposta: "ChatGPT" });
    assert.equal(chamadas[0].model, "modelo-chat");
    setConfig("OPENROUTER_API_KEY", null);
    const status = await import("../app/api/status/route");
    const estado = await (await status.GET(new Request("http://localhost/api/status"))).json();
    assert.equal(estado.ai, true); assert.equal(estado.setup.pronto, true); assert.equal(estado.exemplos, false);
    const setup = await import("../app/api/setup/route");
    assert.equal((await (await setup.GET()).json()).pronto, true, "ChatGPT dispensa chave OpenRouter no setup");
    assert.ok(!estado.proximos.some((p: { id: string }) => p.id === "openrouter"));
    const { salvarPesquisa } = await import("../lib/pesquisa-store");
    const { PESQUISA_PADRAO } = await import("../lib/pesquisa");
    salvarPesquisa({ ...PESQUISA_PADRAO, provedores: ["exa"] });
    setConfig("EXA_API_KEY", "exa-teste");
    global.fetch = async input => {
      assert.equal(String(input), "https://api.exa.ai/search");
      return Response.json({ results: [{ title: "Evidência", url: "https://fonte.com/a", highlights: ["Evidência real coletada"] }] });
    };
    bridge.run = async opts => {
      assert.match(opts.prompt, /Evidência real coletada/);
      assert.equal(opts.model, "modelo-chat");
      return JSON.stringify({ sinais: [
        { id: "s", titulo: "Sinal", resumo: "Resumo", temas: ["IA"], tendencia: "estavel", forca: "alta", oQueFazer: "Validar", fontes: [{ url: "https://fonte.com/a" }, { url: "https://inventada.com" }] },
        { id: "falso", titulo: "Inventado", fontes: [{ url: "https://inventada.com" }] },
      ], nos: [{ id: "orfao", tipo: "ator", rotulo: "Órfão", peso: 1 }], arestas: [], conexoes: [] });
    };
    const radarApi = await import("../app/api/radar/route");
    const resposta = await radarApi.POST(new Request("http://localhost/api/radar", { method: "POST", body: JSON.stringify({ temas: ["IA"], periodoDias: 30 }) }));
    assert.equal(resposta.status, 200);
    const gerado = await resposta.json();
    assert.equal(gerado.meta.demo, false); assert.equal(gerado.meta.model, "modelo-chat");
    assert.equal(gerado.radar.sinais.length, 1); assert.equal(gerado.radar.sinais[0].fontes.length, 1);
    assert.equal(gerado.radar.sinais[0].forca, "baixa"); assert.equal(gerado.radar.nos.length, 0);
    const salvo = await (await radarApi.GET(new Request("http://localhost/api/radar?ultimo=1"))).json();
    assert.equal(salvo.id, gerado.id);
    bridge.run = async () => { throw new Error("limite da assinatura"); };
    await assert.rejects(() => askJSON({ system: "s", prompt: "p" }), /ChatGPT não concluiu/);
    assert.equal(chamadasOpenRouter, 1, "erro do ChatGPT não consome OpenRouter");
    setConfig("OPENROUTER_API_KEY", "teste");
    conectado = false;
    assert.equal(await aiEnabled(), false, "a chave OpenRouter não mascara ChatGPT desconectado");
    const { montarRadar } = await import("../lib/radar");
    await assert.rejects(() => montarRadar({ temas: ["IA"], periodoDias: 30 }), /Conecte sua conta ChatGPT/);
    assert.equal((await PUT(req({ provedor: "openrouter" }))).status, 200);
    assert.equal(await aiEnabled(), true);
    process.env.AI_PROVIDER = "openrouter";
    assert.equal((await PUT(req({ provedor: "chatgpt" }))).status, 409);
    delete process.env.AI_PROVIDER;
  } finally { bridge.account = account; bridge.run = run; bridge.models = models; bridge.close(); }
});

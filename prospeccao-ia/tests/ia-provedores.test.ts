import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("conta de IA escolhida governa status, setup, geração e leitura de produto, sem troca automática", async (t) => {
  const pasta = mkdtempSync(path.join(tmpdir(), "ia-provedores-"));
  const ambiente = { ...process.env };
  process.env.DATA_DIR = pasta;
  for (const chave of ["AI_PROVIDER", "CHATGPT_MODEL", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "BRIGHTDATA_API_KEY", "EXA_API_KEY", "TAVILY_API_KEY", "SEARCHAPI_API_KEY", "APOLLO_API_KEY"]) delete process.env[chave];
  t.after(() => { process.env = ambiente; rmSync(pasta, { recursive: true, force: true }); });
  t.mock.method(console, "error", () => {});

  const { setConfig } = await import("../lib/store");
  const { aiEnabled, aiProvider, askJSON, modelName, openRouterModelName } = await import("../lib/ai");
  const { chatGPT } = await import("../lib/chatgpt");
  const bridge = chatGPT();
  const originais = { account: bridge.account.bind(bridge), run: bridge.run.bind(bridge), models: bridge.models.bind(bridge) };
  t.after(() => { bridge.account = originais.account; bridge.run = originais.run; bridge.models = originais.models; bridge.close(); });

  let conectado = true;
  const chamadasChat: { system: string; prompt: string; model?: string }[] = [];
  let chamadasOpenRouter = 0;
  bridge.account = async () => ({ account: conectado ? { type: "chatgpt", email: "vendas@exemplo.com", planType: "plus" } : null, login: null, error: null });
  bridge.models = async () => [{ id: "modelo-chat", name: "Modelo Chat" }];
  bridge.run = async (opts) => { chamadasChat.push(opts); return '{"resposta":"ChatGPT"}'; };
  t.mock.method(global, "fetch", async (input: string | URL | Request) => {
    if (String(input).endsWith("/api/v1/models")) return Response.json({ data: [] });
    assert.equal(String(input), "https://openrouter.ai/api/v1/chat/completions");
    chamadasOpenRouter++;
    return Response.json({ model: "modelo-openrouter", choices: [{ message: { content: '{"resposta":"OpenRouter"}' }, finish_reason: "stop" }] });
  });

  await t.test("OpenRouter é o padrão e responde com a chave salva", async () => {
    assert.equal(aiProvider(), "openrouter");
    assert.equal(await aiEnabled(), false);
    setConfig("OPENROUTER_API_KEY", "teste");
    assert.equal(await aiEnabled(), true);
    assert.deepEqual(await askJSON({ system: "s", prompt: "p" }), { resposta: "OpenRouter" });
    assert.equal(chamadasOpenRouter, 1);
  });

  const { PUT: escolherIA, GET: lerIA } = await import("../app/api/ia/route");
  const pedir = (corpo: unknown) => new Request("http://localhost/api/ia", { method: "PUT", body: JSON.stringify(corpo) });

  await t.test("trocar para ChatGPT exige modelo existente na conta e passa a governar tudo", async () => {
    assert.equal((await escolherIA(pedir({ provedor: "chatgpt", modelo: "inexistente" }))).status, 400);
    assert.equal((await escolherIA(pedir({ provedor: "chatgpt", modelo: "modelo-chat" }))).status, 200);
    assert.deepEqual(await (await lerIA()).json(), { provedor: "chatgpt", modelo: "modelo-chat", provedorFixo: false, modeloFixo: false });
    assert.equal(aiProvider(), "chatgpt");
    assert.equal(modelName(), "modelo-chat");
    assert.equal(openRouterModelName(), "nvidia/nemotron-3-super-120b-a12b:free", "o teste do cartão do OpenRouter continua com o modelo dele");
    assert.equal(await aiEnabled(), true);
    assert.deepEqual(await askJSON({ system: "s", prompt: "p" }), { resposta: "ChatGPT" });
    assert.equal(chamadasChat.at(-1)?.model, "modelo-chat");
    assert.equal(chamadasOpenRouter, 1, "nenhuma chamada nova ao OpenRouter");
  });

  await t.test("status e setup ficam prontos pela conta ChatGPT mesmo sem chave do OpenRouter", async () => {
    setConfig("OPENROUTER_API_KEY", null);
    const { GET: status } = await import("../app/api/status/route");
    const estado = await (await status(new Request("http://localhost/api/status"))).json();
    assert.equal(estado.ai, true);
    assert.equal(estado.demo, false);
    assert.equal(estado.provedor, "chatgpt");
    assert.equal(estado.setup.pronto, true);
    assert.equal(estado.vision, false, "visão só existe pelo OpenRouter");
    assert.equal(estado.integrations.ia, true);
    assert.ok(!estado.proximos.some((p: { id: string }) => ["ia", "openrouter", "notificacoes"].includes(p.id)), "nem a IA nem o cartão escondido entram nas sugestões");
    const { GET: setup } = await import("../app/api/setup/route");
    assert.equal((await (await setup()).json()).pronto, true);
  });

  await t.test("leitura de produto passa pelo ChatGPT e devolve o modelo da conta", async () => {
    const sugestao = { nome: "Masterclass de IA", descricao: "Aula.", propostaValor: "Ensina gestores.", icp: { nome: "Gestores", criterios: { setor: "Serviços" }, personas: ["Diretor"], dores: [], sinais: [] } };
    bridge.run = async (opts) => { chamadasChat.push(opts); return JSON.stringify(sugestao); };
    const { sugerirProdutoDoSite } = await import("../lib/produto-ia");
    const etapas: string[] = [];
    const r = await sugerirProdutoDoSite("Uma aula para gestores aplicarem inteligência artificial nas empresas.", (e) => etapas.push(e));
    assert.equal(r.demo, false);
    assert.deepEqual(r.sugestao, sugestao);
    assert.equal(r.meta.model, "modelo-chat");
    assert.deepEqual(etapas, ["analise", "revisao"]);
    assert.match(chamadasChat.at(-1)?.system ?? "", /objeto JSON/);
    assert.equal(chamadasOpenRouter, 1);
  });

  await t.test("falha do ChatGPT não cai no OpenRouter e conta desconectada desliga a IA", async () => {
    bridge.run = async () => { throw new Error("limite da assinatura"); };
    await assert.rejects(() => askJSON({ system: "s", prompt: "p" }), /ChatGPT não concluiu/);
    assert.equal(chamadasOpenRouter, 1);
    setConfig("OPENROUTER_API_KEY", "teste");
    conectado = false;
    assert.equal(await aiEnabled(), false, "a chave do OpenRouter não mascara a conta ChatGPT desconectada");
    const { GET: status } = await import("../app/api/status/route");
    const estado = await (await status(new Request("http://localhost/api/status"))).json();
    assert.equal(estado.ai, false);
    assert.equal(estado.proximos[0].id, "ia");
  });

  await t.test("voltar ao OpenRouter religa a IA; escolha travada no ambiente responde 409", async () => {
    assert.equal((await escolherIA(pedir({ provedor: "openrouter" }))).status, 200);
    assert.equal(await aiEnabled(), true);
    assert.equal((await escolherIA(pedir({ provedor: "outro" }))).status, 400);
    process.env.AI_PROVIDER = "openrouter";
    assert.equal((await escolherIA(pedir({ provedor: "chatgpt" }))).status, 409);
    delete process.env.AI_PROVIDER;
  });
});

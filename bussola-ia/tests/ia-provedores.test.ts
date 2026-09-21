import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUESTIONARIO_MODELO } from "../lib/modelo";

const dir = mkdtempSync(join(tmpdir(), "bussola-provider-"));
process.env.DATA_DIR = dir;
for (const key of ["AI_PROVIDER", "CHATGPT_MODEL", "OPENROUTER_API_KEY"])
  delete process.env[key];
const fetchOriginal = global.fetch;
test.after(() => {
  global.fetch = fetchOriginal;
  rmSync(dir, { recursive: true, force: true });
});

test("ChatGPT governa o Arquiteto e os três analistas, status e modelos, sem usar OpenRouter", async () => {
  const { setConfig } = await import("../lib/store");
  const { aiEnabled, askJSON, modelName } = await import("../lib/ai");
  const { chatGPT } = await import("../lib/chatgpt");
  const { PUT } = await import("../app/api/ia/route");
  const { GET: status } = await import("../app/api/status/route");
  const { GET: setup, PUT: salvarSetup } =
    await import("../app/api/setup/route");
  const { analisarAvaliacao, gerarQuestionarioParaSetor } =
    await import("../lib/bussola");
  const bridge = chatGPT();
  let conectado = true;
  let chamadas = 0;
  bridge.account = async () => ({
    account: conectado ? { type: "chatgpt", email: "test@example.test" } : null,
    login: null,
    error: null,
  });
  bridge.models = async () => [{ id: "modelo-chat", name: "Modelo Chat" }];
  global.fetch = async () => {
    throw new Error("Este teste não pode acessar serviços externos");
  };
  const req = (body: unknown) =>
    new Request("http://localhost/api/ia", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  assert.equal(
    (await PUT(req({ provedor: "chatgpt", modelo: "inexistente" }))).status,
    400,
  );
  assert.equal(
    (await PUT(req({ provedor: "chatgpt", modelo: "modelo-chat" }))).status,
    200,
  );
  assert.equal(modelName(), "modelo-chat");
  assert.equal(await aiEnabled(), true);
  const estado = await (
    await status(new Request("http://localhost/api/status"))
  ).json();
  assert.equal(estado.ai, true);
  assert.equal(estado.setup.pronto, true);
  assert.deepEqual(estado.proximos, []);
  assert.deepEqual(Object.keys(estado.integrations).sort(), [
    "chatgpt",
    "openrouter",
  ]);
  const configuracoes = await (await setup()).json();
  assert.equal(configuracoes.pronto, true);
  assert.deepEqual(
    configuracoes.integracoes.map((i: { id: string }) => i.id),
    ["openrouter"],
  );
  assert.equal(configuracoes.caixasEmail, undefined);
  assert.equal(configuracoes.enderecoPublico, undefined);

  bridge.run = async (opts) => {
    assert.equal(opts.model, "modelo-chat");
    chamadas++;
    return JSON.stringify(QUESTIONARIO_MODELO);
  };
  const questionario = await gerarQuestionarioParaSetor({ setor: "Varejo" });
  assert.equal(questionario.meta.demo, false);
  assert.equal(questionario.meta.model, "modelo-chat");
  bridge.run = async (opts) => {
    assert.equal(opts.model, "modelo-chat");
    chamadas++;
    return JSON.stringify(
      opts.system.includes("agente Crítico") ||
        opts.system.includes("agente Estrategista")
        ? {
            mensagem: "Valide as evidências do grupo.",
            recomendacoes: ["Converse com a área"],
            pergunta: "Qual evidência falta?",
            dimensoes: [QUESTIONARIO_MODELO.dimensoes[0].nome],
          }
        : {
            resumo: "Maturidade em estruturação.",
            forcas: ["Estratégia"],
            lacunas: ["Governança"],
            proximosPassos: ["Testar piloto"],
            leituraPorDimensao: QUESTIONARIO_MODELO.dimensoes.map((d) => ({
              dimensao: d.nome,
              leitura: "Prática em estruturação.",
            })),
            ondeDiscordam: [],
            nivelGeral: 5,
          },
    );
  };
  const entrada = {
    empresa: "Teste",
    titulo: "Diagnóstico",
    questionario: QUESTIONARIO_MODELO,
    respostas: [1, 5].map((nota, i) => ({
      id: String(i),
      criadoEm: new Date().toISOString(),
      valores: Object.fromEntries(
        QUESTIONARIO_MODELO.perguntas.map((p) => [
          p.id,
          p.tipo === "escala" ? String(nota) : "Resposta real do grupo",
        ]),
      ),
    })),
  };
  const resultado = await analisarAvaliacao(entrada);
  assert.equal(
    chamadas,
    4,
    "Arquiteto, Analista, Crítico e Estrategista usam ChatGPT",
  );
  assert.equal(resultado.meta.demo, false);
  assert.equal(resultado.meta.model, "modelo-chat");
  assert.equal(
    resultado.avaliacao.analise?.nivelGeral,
    3,
    "a nota é calculada no servidor",
  );
  assert.ok(
    resultado.avaliacao.analise?.conselho?.every((p) => p.origem === "ia"),
  );

  setConfig("OPENROUTER_API_KEY", "chave-de-teste");
  let chamadasOpenRouter = 0;
  global.fetch = async () => {
    chamadasOpenRouter++;
    return Response.json({
      choices: [{ message: { content: '{"resposta":"OpenRouter"}' } }],
    });
  };
  bridge.run = async () => {
    throw new Error("Limite da assinatura");
  };
  await assert.rejects(
    () => askJSON({ system: "s", prompt: "p" }),
    /ChatGPT não concluiu/,
  );
  assert.equal(chamadasOpenRouter, 0);
  const falha = await analisarAvaliacao(entrada);
  assert.equal(falha.avaliacao.analise?.origemLeitura, "automatica");
  assert.ok(falha.avaliacao.analise?.avisoIA);
  assert.equal(
    chamadasOpenRouter,
    0,
    "leitura automática é identificada, sem trocar provedor",
  );
  conectado = false;
  assert.equal(
    await aiEnabled(),
    false,
    "OpenRouter não mascara ChatGPT desconectado",
  );
  assert.equal((await PUT(req({ provedor: "openrouter" }))).status, 200);
  assert.equal(await aiEnabled(), true);
  assert.deepEqual(await askJSON({ system: "s", prompt: "p" }), {
    resposta: "OpenRouter",
  });
  assert.equal(chamadasOpenRouter, 1);
  setConfig("OPENROUTER_API_KEY", null);
  await salvarSetup(
    req({
      valores: {
        NOTIFICACOES_CANAL: "slack",
        MCP_TAREFAS_URL: "https://example.test",
        APP_URL: "https://example.test",
      },
    }),
  );
  const { getConfig } = await import("../lib/store");
  for (const key of ["NOTIFICACOES_CANAL", "MCP_TAREFAS_URL", "APP_URL"])
    assert.equal(getConfig(key), undefined);
  assert.equal(
    (
      await salvarSetup(
        req({ valores: { OPENROUTER_API_KEY: { invalid: true } } }),
      )
    ).status,
    400,
  );
  process.env.AI_PROVIDER = "chatgpt";
  assert.equal((await PUT(req({ provedor: "openrouter" }))).status, 409);
  delete process.env.AI_PROVIDER;
});

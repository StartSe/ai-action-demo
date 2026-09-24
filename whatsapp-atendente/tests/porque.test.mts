// "Por que respondeu assim" (0.3.0, US-010): cada resposta do atendente guarda como foi montada
// (lib/types.ts:DetalhesResposta) na coluna `detalhes` de `mensagens`, e é isso que a bolha abre. A IA
// é falsa (`globalThis.fetch` em `openrouter.ai`); os sistemas da empresa são um servidor MCP falso no
// mesmo `fetch`, para uma ferramenta chamada aparecer na lista com `ok`.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-porque-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { migrarConfig } = await import("../lib/estado");
const { apagarConversa, obterConversa } = await import("../lib/conversas");
const { responder, FONTE_APROVADA, FONTE_BASE, SEM_IA } = await import("../lib/atendente");
const { aprovarPar, baseAprovadaRelevante } = await import("../lib/base");
const { cenariosDoObjetivo, deveTransferir, motivoEsperado } = await import("../lib/cenarios");
const { setConfig: setChave } = await import("../lib/store");

const originalFetch = globalThis.fetch;
after(async () => {
  // A janela da rajada (3 s) pode estar aberta; apagar o DATA_DIR antes dela fechar suja o log.
  await new Promise((r) => setTimeout(r, 3500));
  globalThis.fetch = originalFetch;
  rmSync(pasta, { recursive: true, force: true });
});

/** O que a IA falsa vai responder ao cliente na próxima chamada (o marcador de transferência entra aqui). */
let respostaDaIA = "Atendemos de segunda a sexta, das 8h às 18h.";
/** A IA falsa pede esta ferramenta antes de responder, uma vez por conversa. */
let pedirFerramenta: string | null = null;
const jaPediu = new Set<string>();

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const endereco = String(url);
  const corpo = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  if (endereco.includes("sistemas.exemplo")) {
    if (corpo.method === "tools/list") {
      return Response.json({ result: { tools: [{ name: "consultar_pedido", inputSchema: { type: "object" } }] } });
    }
    return Response.json({ result: { content: [{ type: "text", text: '{"pedido":"12345","status":"em separação"}' }] } });
  }
  if (endereco.includes("openrouter.ai")) {
    const messages = (corpo.messages ?? []) as { role: string; content: string }[];
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    // A classificação de assunto usa o mesmo endereço; ela se reconhece pelo texto do próprio prompt.
    if (system.includes("separa por assunto")) {
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"assunto":"Outros"}' } }] });
    }
    if (pedirFerramenta && !jaPediu.has(pedirFerramenta)) {
      jaPediu.add(pedirFerramenta);
      return Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: null,
              tool_calls: [{ id: "c1", type: "function", function: { name: pedirFerramenta, arguments: JSON.stringify({ pedido: "12345" }) } }],
            },
          },
        ],
      });
    }
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: respostaDaIA } }] });
  }
  throw new Error(`Chamada inesperada no teste: ${endereco}`);
}) as typeof fetch;

const CONFIG_BASE = {
  negocio: "Clínica Teste",
  atendente: "Ana",
  baseConhecimento: "Horário de atendimento: segunda a sexta, das 8h às 18h.\n\nLimpeza: R$ 150.",
};

/** Responde de verdade (com IA, se `comIA`) e devolve os detalhes gravados na mensagem do atendente. */
async function responderEObterDetalhes(numero: string, texto: string, { comIA = true } = {}) {
  if (comIA) process.env.OPENROUTER_API_KEY = "chave-de-teste";
  try {
    const resultado = await responder({ numero, texto, origem: "simulador", config: migrarConfig(CONFIG_BASE) });
    const conversa = obterConversa(numero);
    const resposta = conversa?.mensagens.filter((m) => m.papel === "atendente").at(-1);
    return { resultado, gravados: resposta?.detalhes };
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
}

test("a resposta da IA grava as fontes, o tempo e o modelo, e o retorno traz os mesmos detalhes", async () => {
  respostaDaIA = "Atendemos de segunda a sexta, das 8h às 18h.";
  const { resultado, gravados } = await responderEObterDetalhes("55110000201", "Qual o horário de atendimento?");
  assert.ok(resultado.detalhes, "quem chamou recebe os detalhes junto da resposta");
  assert.deepEqual(gravados, resultado.detalhes, "e é exatamente o que ficou gravado na mensagem");
  assert.equal(gravados?.modelo.includes("/"), true, "o modelo que respondeu fica registrado");
  assert.equal(gravados?.rajada, 1);
  assert.ok((gravados?.tempoMs ?? -1) >= 0, "o tempo de escrita é medido");
  assert.deepEqual(
    gravados?.fontes.map((f) => f.tipo),
    ["base"],
    "a base de conhecimento é sempre uma fonte: é lá que a pessoa corrige"
  );
  assert.equal(gravados?.fontes[0].nome, FONTE_BASE);
  // O trecho da base é o mais parecido com a pergunta (é onde a pessoa vai mexer), não o começo do texto.
  assert.match(gravados?.fontes[0].trecho ?? "", /Horário de atendimento/);
  assert.equal(gravados?.transferencia, undefined, "resposta normal não tem transferência");
  apagarConversa("55110000201");
});

test("transferência entra nos detalhes com o motivo que a IA escolheu", async () => {
  respostaDaIA = "Vou chamar alguém da equipe para te ajudar.\n[TRANSFERIR:cliente_pediu]";
  const { gravados } = await responderEObterDetalhes("55110000202", "Quero falar com uma pessoa");
  assert.deepEqual(gravados?.transferencia, { motivo: "cliente_pediu" });
  apagarConversa("55110000202");
});

test("uma resposta aprovada que casa com a pergunta aparece como fonte", async () => {
  aprovarPar({ pergunta: "Vocês têm estacionamento?", resposta: "Temos convênio no prédio ao lado, com desconto." });
  assert.equal(baseAprovadaRelevante("Vocês têm estacionamento?").length, 1, "a comparação por palavras acha o par");
  assert.equal(baseAprovadaRelevante("Qual o valor do clareamento?").length, 0, "e não acha o que não tem a ver");

  respostaDaIA = "Temos convênio no prédio ao lado, com desconto.";
  const { gravados } = await responderEObterDetalhes("55110000203", "Vocês têm estacionamento?");
  assert.deepEqual(
    gravados?.fontes.map((f) => f.nome),
    [FONTE_BASE, FONTE_APROVADA],
    "as respostas aprovadas entram ao lado da base"
  );
  setChave("ATENDENTE_BASE", null);
  apagarConversa("55110000203");
});

test("ferramenta chamada entra na lista com o resumo do que foi consultado", async () => {
  setChave("MCP_EMPRESA_URL", "https://sistemas.exemplo/mcp");
  setChave("MCP_EMPRESA_CODIGO", "codigo-de-teste");
  pedirFerramenta = "consultar_pedido";
  jaPediu.clear();
  respostaDaIA = "Seu pedido 12345 está em separação.";
  try {
    const { gravados, resultado } = await responderEObterDetalhes("55110000204", "Onde está meu pedido 12345?");
    assert.equal(gravados?.ferramentas.length, 1, "a ferramenta chamada fica registrada");
    assert.equal(gravados?.ferramentas[0].ok, true, "e deu certo");
    assert.match(gravados?.ferramentas[0].resumo ?? "", /12345/, "o resumo diz o que foi consultado");
    assert.equal(resultado.ferramentaUsada, gravados?.ferramentas[0].nome, "o campo antigo continua valendo (relatório diário)");
  } finally {
    pedirFerramenta = null;
    setChave("MCP_EMPRESA_URL", null);
    setChave("MCP_EMPRESA_CODIGO", null);
    apagarConversa("55110000204");
  }
});

test("sem IA, os detalhes dizem que a resposta veio da busca local e mostram o trecho escolhido", async () => {
  const { gravados } = await responderEObterDetalhes("55110000205", "Qual o horário de atendimento?", { comIA: false });
  assert.equal(gravados?.modelo, SEM_IA);
  assert.equal(gravados?.fontes.length, 1, "sem IA, a única fonte é o trecho que a busca escolheu");
  assert.match(gravados?.fontes[0].trecho ?? "", /segunda a sexta/);
  apagarConversa("55110000205");
});

test("cada objetivo tem seis cenários, com um fora do escopo e um pedido de pessoa", () => {
  for (const objetivo of ["atendimento", "vendas", "agendamentos", "outro"] as const) {
    const cenarios = cenariosDoObjetivo(objetivo);
    assert.equal(cenarios.length, 6, `${objetivo} precisa de seis cenários`);
    assert.equal(new Set(cenarios.map((c) => c.id)).size, 6, "os identificadores não se repetem");
    const devem = cenarios.filter(deveTransferir);
    assert.equal(devem.length, 2, "dois deles têm que terminar com uma pessoa");
    assert.deepEqual(devem.map(motivoEsperado), ["fora_do_escopo", "cliente_pediu"]);
    assert.ok(cenarios.some((c) => c.grupo === "dado_que_falta"), "e há sempre um dado que costuma faltar");
  }
});

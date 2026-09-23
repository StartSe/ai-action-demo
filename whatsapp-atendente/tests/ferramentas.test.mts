// Ferramentas do atendente (0.3.0, US-009): os interruptores da seção Ferramentas do passo 1 valem por
// cima da conexão — uma agenda conectada e o interruptor desligado não podem virar ferramenta oferecida
// ao modelo. A IA é falsa (`globalThis.fetch` em `openrouter.ai`), e é por ela que dá para ver o que foi
// enviado: o `system` do prompt e a lista de `tools` da chamada. A agenda e os sistemas da empresa são
// servidores MCP falsos no mesmo `fetch`.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-ferramentas-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { migrarConfig } = await import("../lib/estado");
const { apagarConversa } = await import("../lib/conversas");
const { responder } = await import("../lib/atendente");
const { setConfig: setChave } = await import("../lib/store");
const { PUT: putConfig, GET: getConfigRota } = await import("../app/api/config/route");
const { FERRAMENTAS_PADRAO } = await import("../lib/types");

const originalFetch = globalThis.fetch;
after(async () => {
  // A janela da rajada (3 s) pode estar aberta; apagar o DATA_DIR antes dela fechar suja o log.
  await new Promise((r) => setTimeout(r, 3500));
  globalThis.fetch = originalFetch;
  rmSync(pasta, { recursive: true, force: true });
});

/** Cada chamada ao modelo: o `system` enviado e os nomes das ferramentas oferecidas. */
type ChamadaIA = { system: string; tools: string[] };
const chamadas: ChamadaIA[] = [];

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const endereco = String(url);
  const corpo = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  if (endereco.includes("agenda.exemplo") || endereco.includes("sistemas.exemplo")) {
    const nomes = endereco.includes("agenda.exemplo") ? ["consultar_horarios", "criar_evento"] : ["consultar_pedido"];
    if (corpo.method === "tools/list") {
      return Response.json({ result: { tools: nomes.map((name) => ({ name, inputSchema: { type: "object" } })) } });
    }
    return Response.json({ result: { content: [{ type: "text", text: "{}" }] } });
  }
  if (endereco.includes("openrouter.ai")) {
    const messages = (corpo.messages ?? []) as { role: string; content: string }[];
    const tools = (corpo.tools ?? []) as { function: { name: string } }[];
    chamadas.push({ system: messages.find((m) => m.role === "system")?.content ?? "", tools: tools.map((t) => t.function.name) });
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "Claro! Posso ajudar com isso." } }] });
  }
  throw new Error(`Chamada inesperada no teste: ${endereco}`);
}) as typeof fetch;

/** Conecta (ou desconecta) a agenda e os sistemas da empresa, como se alguém os tivesse configurado. */
function conectarServicos(ligados: boolean) {
  setChave("MCP_AGENDA_URL", ligados ? "https://agenda.exemplo/mcp" : null);
  setChave("MCP_AGENDA_CODIGO", ligados ? "codigo-de-teste" : null);
  setChave("MCP_AGENDA_FERRAMENTAS", ligados ? "consultar_horarios,criar_evento" : null);
  setChave("MCP_EMPRESA_URL", ligados ? "https://sistemas.exemplo/mcp" : null);
  setChave("MCP_EMPRESA_CODIGO", ligados ? "codigo-de-teste" : null);
}

/** Uma resposta de verdade do atendente, com a IA ligada, e a última chamada que ela fez ao modelo. */
async function responderCom(numero: string, ferramentas: Partial<typeof FERRAMENTAS_PADRAO>): Promise<ChamadaIA> {
  process.env.OPENROUTER_API_KEY = "chave-de-teste";
  chamadas.length = 0;
  try {
    await responder({
      numero,
      texto: "Tem horário amanhã de manhã?",
      origem: "whatsapp",
      config: migrarConfig({ negocio: "Clínica Teste", atendente: "Ana", baseConhecimento: "Atendemos de segunda a sexta.", ferramentas: { ...FERRAMENTAS_PADRAO, ...ferramentas } }),
    });
  } finally {
    delete process.env.OPENROUTER_API_KEY;
    apagarConversa(numero);
  }
  // A classificação de assunto entra no meio das chamadas; a que interessa é a da resposta ao cliente.
  const resposta = chamadas.find((c) => c.system.includes("atendente virtual"));
  assert.ok(resposta, "a IA precisa ter sido chamada para responder ao cliente");
  return resposta;
}

test("migrarConfig preenche as ferramentas de uma configuração antiga e completa a que veio pela metade", () => {
  assert.deepEqual(migrarConfig({}).ferramentas, FERRAMENTAS_PADRAO, "sem o campo, valem os padrões");
  assert.deepEqual(
    migrarConfig({ ferramentas: { coletarContato: true } as never }).ferramentas,
    { ...FERRAMENTAS_PADRAO, coletarContato: true },
    "o que veio é respeitado e o resto cai no padrão"
  );
  assert.deepEqual(migrarConfig({ ferramentas: "torto" as never }).ferramentas, FERRAMENTAS_PADRAO, "valor malformado não derruba a configuração");
});

test("PUT /api/config grava os interruptores e o GET os devolve", async () => {
  const corpo = {
    negocio: "Padaria do Bairro",
    atendente: "Duda",
    objetivo: "atendimento",
    tom: "profissional",
    baseConhecimento: "Pão francês: R$ 0,90 a unidade.",
    naoSei: "humano",
    ferramentas: { coletarContato: true, agenda: false, sistemas: false },
  };
  const r = await putConfig(new Request("http://x/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).ferramentas, { coletarContato: true, agenda: false, sistemas: false });
  assert.deepEqual((await (await getConfigRota()).json()).ferramentas, { coletarContato: true, agenda: false, sistemas: false });

  // Corpo sem o campo (uma tela antiga, ou a persona gerada) continua salvando: vale o padrão.
  const semCampo = await putConfig(new Request("http://x/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corpo, ferramentas: undefined }) }));
  assert.deepEqual((await semCampo.json()).ferramentas, FERRAMENTAS_PADRAO);
  setChave("ATENDENTE_CONFIG", null);
});

test("agenda desligada não vira ferramenta oferecida ao modelo, mesmo conectada", async () => {
  conectarServicos(true);
  const desligada = await responderCom("55110000001", { agenda: false, sistemas: false });
  assert.deepEqual(desligada.tools, [], "nenhuma ferramenta é oferecida com os dois interruptores desligados");
  assert.match(desligada.system, /agenda não está disponível/, "e o prompt diz ao modelo que a agenda não está lá");

  const ligada = await responderCom("55110000002", { agenda: true, sistemas: false });
  assert.deepEqual(ligada.tools, ["agenda_0", "agenda_1"], "com o interruptor ligado, as duas ferramentas da agenda chegam ao modelo");
  assert.match(ligada.system, /Há ferramentas de agenda disponíveis/);
});

test("sistemas da empresa desligados não viram ferramenta oferecida ao modelo, mesmo conectados", async () => {
  conectarServicos(true);
  const desligados = await responderCom("55110000003", { agenda: false, sistemas: false });
  assert.ok(!desligados.tools.includes("consultar_pedido"));

  const ligados = await responderCom("55110000004", { agenda: false, sistemas: true });
  assert.deepEqual(ligados.tools, ["consultar_pedido"]);
  conectarServicos(false);
});

test("coletar contato soma a instrução ao prompt, e só quando está ligado", async () => {
  const ligado = await responderCom("55110000005", { coletarContato: true, agenda: false, sistemas: false });
  assert.match(ligado.system, /pergunte o nome dele de forma natural/);
  assert.match(ligado.system, /peça um e-mail ou telefone para retorno/);

  const desligado = await responderCom("55110000006", { coletarContato: false, agenda: false, sistemas: false });
  assert.doesNotMatch(desligado.system, /pergunte o nome dele/);
});

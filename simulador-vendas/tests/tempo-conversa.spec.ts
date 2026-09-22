import { test, expect } from "./fixtures";
import { tempoConversa, INSTRUCAO_AVISO_TEMPO, INSTRUCAO_APOS_AVISO } from "../lib/tempo-conversa";
import { build } from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("tempo distingue aproximação, limite e excedente sem reiniciar a contagem", () => {
  const inicio = "2026-09-22T12:00:00.000Z";
  const agora = Date.parse(inicio);
  expect(tempoConversa(inicio, 5, agora + 239000)).toMatchObject({ restante: 61, perto: false, excedido: 0 });
  expect(tempoConversa(inicio, 5, agora + 240000)).toMatchObject({ restante: 60, perto: true });
  expect(tempoConversa(inicio, 5, agora + 300000)).toMatchObject({ restante: 0, excedido: 0 });
  expect(tempoConversa(inicio, 5, agora + 375000)).toMatchObject({ restante: 0, excedido: 75 });
});

test("aviso usa o relógio do servidor, persiste uma vez e deixa o vendedor responder", async () => {
  const { semearDemonstracao } = await import("../lib/semear-demo");
  const { listar } = await import("../lib/simulacoes");
  const { criar } = await import("../lib/participantes");
  const { abrir, iniciar, obter, transcricao } = await import("../lib/sessoes");
  const { cookieSessaoVendedor } = await import("../lib/sessao-vendedor");
  const { banco } = await import("../lib/banco");
  const { POST } = await import("../app/api/salas/[token]/conversar/route");
  semearDemonstracao();
  const sim = listar()[0];
  const participante = criar({ nome: "Tempo" });
  const sessao = abrir({ simulacaoCodigo: sim.codigo, participanteId: participante.id, modo: "texto" });
  iniciar(sessao.id);
  const cookie = cookieSessaoVendedor({ participanteId: participante.id, sessaoId: sessao.id, seguro: false });
  const pedir = (corpo: object) => POST(new Request(`http://localhost/api/salas/${sim.codigo}/conversar`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(corpo) }), { params: Promise.resolve({ token: sim.codigo }) });
  expect((await (await pedir({ avisoTempo: true })).json()).avisoTempo).toBe(false);
  expect(transcricao(sessao.id)).toHaveLength(0);
  await pedir({ fala: "Olá, como posso ajudar seu time?" });
  expect(obter(sessao.id)?.avisoTempoEm).toBeUndefined();
  banco().prepare("UPDATE sessoes_treino SET iniciadaEm = ? WHERE id = ?").run(new Date(Date.now() - sim.duracaoMin * 60000 - 1000).toISOString(), sessao.id);
  const pendente = pedir({ avisoTempo: true });
  expect((await pedir({ avisoTempo: true })).status).toBe(409);
  const aviso = await (await pendente).json();
  expect(aviso).toMatchObject({ encerrada: false, avisoTempo: true });
  expect(aviso.texto).toContain("retomarmos em outra conversa");
  const registrada = obter(sessao.id)?.avisoTempoEm;
  expect(registrada).toBeTruthy();
  const quantidade = transcricao(sessao.id).length;
  expect((await (await pedir({ avisoTempo: true })).json()).texto).toBeUndefined();
  expect(transcricao(sessao.id)).toHaveLength(quantidade);
  const resposta = await (await pedir({ fala: "Podemos retomar os detalhes na terça-feira?" })).json();
  expect(resposta.encerrada).toBe(false);
  expect(resposta.texto).not.toContain("Tem mais algum ponto");
  expect(obter(sessao.id)).toMatchObject({ status: "em_andamento", avisoTempoEm: registrada });
  expect(transcricao(sessao.id).at(-2)?.texto).toContain("terça-feira");
});

test("IA recebe instrução de perguntar pelos pontos futuros e depois concluir sem repetir", async () => {
  const { falaDoCliente } = await import("../lib/conversa-sessao");
  const { setConfig } = await import("../lib/store");
  const original = globalThis.fetch;
  const pedidos: string[] = [];
  setConfig("OPENROUTER_API_KEY", "teste");
  try {
    globalThis.fetch = async (_url, init) => {
      const pedido = JSON.parse(String(init?.body));
      pedidos.push(pedido.messages[0].content);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: "Preciso encerrar. Há pontos para retomarmos depois?" } }] });
    };
    await falaDoCliente({ instrucoes: "Cliente", historico: [], faseTempo: "avisar" });
    await falaDoCliente({ instrucoes: "Cliente", historico: [], faseTempo: "concluir" });
    expect(pedidos[0]).toContain(INSTRUCAO_AVISO_TEMPO);
    expect(pedidos[1]).toContain(INSTRUCAO_APOS_AVISO);
  } finally { globalThis.fetch = original; setConfig("OPENROUTER_API_KEY", null); }
});

test("agente LiveKit espera a fala terminar, orienta uma vez e mantém a ligação aberta", async () => {
  const { semearDemonstracao } = await import("../lib/semear-demo");
  const { listar } = await import("../lib/simulacoes");
  const { criar } = await import("../lib/participantes");
  const { abrir, iniciar, obter, registrarMensagem } = await import("../lib/sessoes");
  const { banco } = await import("../lib/banco");
  const { nomeSala } = await import("../lib/livekit");
  semearDemonstracao();
  const sim = listar().find(s => s.permiteVoz)!;
  const p = criar({ nome: "Tempo por voz" });
  const s = abrir({ simulacaoCodigo: sim.codigo, participanteId: p.id, modo: "voz-agente" });
  iniciar(s.id);
  registrarMensagem({ sessaoId: s.id, papel: "vendedor", texto: "Podemos conversar sobre seu time?" });
  banco().prepare("UPDATE sessoes_treino SET iniciadaEm = ? WHERE id = ?").run(new Date(Date.now() - sim.duracaoMin * 60000 - 1000).toISOString(), s.id);
  const arquivo = path.resolve(`.teste-agente-tempo-${process.pid}.mjs`);
  let finalizar: (() => Promise<void>) | undefined;
  const participantes = new Map([[`vendedor-${s.id}`, {}]]);
  try {
    await build({
      stdin: { contents: 'export { default } from "./agent/main"; export { estado } from "./tests/support/agents-tempo.mjs";', resolveDir: process.cwd(), loader: "ts" },
      outfile: arquivo, bundle: true, platform: "node", format: "esm", packages: "external",
      alias: { "@livekit/agents": path.resolve("tests/support/agents-tempo.mjs") },
      plugins: [{ name: "voz-sem-rede", setup(b) {
        b.onResolve({ filter: /^@livekit\/agents-plugin-/ }, args => ({ path: args.path, namespace: "voz-teste" }));
        b.onLoad({ filter: /.*/, namespace: "voz-teste" }, () => ({ contents: "export class STT {} export class TTS {} export class LLM {}" }));
      } }],
    });
    const mod = await import(pathToFileURL(arquivo).href);
    await mod.default.entry({
      job: { metadata: JSON.stringify({ sessaoId: s.id }), room: { name: nomeSala(s.id) } },
      connect: async () => {}, waitForParticipant: async () => {}, shutdown: () => {},
      room: { remoteParticipants: participantes, localParticipant: { registerRpcMethod: () => {} } },
      addShutdownCallback: (callback: () => Promise<void>) => { finalizar = callback; },
    });
    const session = mod.estado.session;
    await new Promise(resolve => setTimeout(resolve, 2100));
    expect(session.respostas).toBe(0);
    expect(session.fechada).toBe(false);
    session.userState = "listening";
    await expect.poll(() => session.respostas).toBe(1);
    expect(session.agent.ultimaInstrucao).toBe(INSTRUCAO_AVISO_TEMPO);
    expect(obter(s.id)?.avisoTempoEm).toBeTruthy();
    await session.agent.llmNode({ items: [] as unknown[], addMessage(message: unknown) { this.items.push(message); } });
    expect(session.agent.ultimaInstrucao).toBe(INSTRUCAO_APOS_AVISO);
    expect(session.fechada).toBe(false);
    participantes.clear();
    await new Promise(resolve => setTimeout(resolve, 2100));
    expect(session.fechada).toBe(false);
    const relogioOriginal = Date.now;
    try {
      Date.now = () => relogioOriginal() + 61000;
      await expect.poll(() => session.fechada).toBe(true);
    } finally { Date.now = relogioOriginal; }
  } finally { await finalizar?.(); await rm(arquivo, { force: true }); }
});

import { test, expect } from "./fixtures";
import { TokenVerifier } from "livekit-server-sdk";

test("roteiro é preparado antes do relógio e permanece estável quando o treino muda", async () => {
  const { semearDemonstracao } = await import("../lib/semear-demo");
  const { listar } = await import("../lib/simulacoes");
  const { garantir } = await import("../lib/participantes");
  const { abrir, obter } = await import("../lib/sessoes");
  const { prepararRoteiro } = await import("../lib/roteiro");
  semearDemonstracao();
  const simulacao = listar()[0];
  const pessoa = garantir({ nome: "Roteiro", email: "roteiro@example.com" });
  const sessao = abrir({ simulacaoCodigo: simulacao.codigo, participanteId: pessoa.id, modo: "voz-agente" });
  const roteiro = prepararRoteiro(sessao, simulacao);
  expect(roteiro.etapas).toHaveLength(5);
  expect(roteiro.instrucoes).toContain(roteiro.etapas[2]);
  expect(obter(sessao.id)?.iniciadaEm).toBeUndefined();
  expect(prepararRoteiro(sessao, { ...simulacao, objetivo: "Outro objetivo", dificuldade: "dificil" })).toEqual(roteiro);
});

test("token permite somente a sala e o microfone da sessão; dispatch não duplica", async () => {
  const { setConfig } = await import("../lib/store");
  const { conectarLivekit } = await import("../lib/livekit");
  const { listar } = await import("../lib/simulacoes");
  const { garantir } = await import("../lib/participantes");
  const { abrir } = await import("../lib/sessoes");
  const secret = "segredo-exclusivo-para-teste-de-token-123456";
  setConfig("LIVEKIT_URL", "wss://livekit.example.com"); setConfig("LIVEKIT_API_KEY", "teste"); setConfig("LIVEKIT_API_SECRET", secret);
  const original = globalThis.fetch;
  let criacoes = 0;
  globalThis.fetch = async (url) => {
    const caminho = String(url);
    if (caminho.endsWith("ListDispatch")) return Response.json({ agent_dispatches: criacoes ? [{ id: "dispatch-1", agent_name: "simulador-vendas" }] : [] });
    if (caminho.endsWith("CreateDispatch")) { criacoes++; return Response.json({ id: "dispatch-1", agent_name: "simulador-vendas" }); }
    return Response.json({ name: "sala" });
  };
  try {
    const pessoa = garantir({ nome: "Voz", email: "livekit@example.com" });
    const sessao = abrir({ simulacaoCodigo: listar()[0].codigo, participanteId: pessoa.id, modo: "voz-agente" });
    const [a, b] = await Promise.all([conectarLivekit(sessao), conectarLivekit(sessao)]);
    expect(criacoes).toBe(1);
    expect(b.url).toBe(a.url);
    const claims = await new TokenVerifier("teste", secret).verify(a.token);
    expect(claims.sub).toBe(`vendedor-${sessao.id}`);
    expect(claims.video?.room).toBe(`treino-${sessao.id}`);
    expect(claims.video?.canPublishSources).toEqual(["microphone"]);
    expect(claims.video?.canUpdateOwnMetadata).toBe(false);
    expect(claims.exp! - claims.nbf!).toBeLessThanOrEqual(300);
    expect(claims.metadata).toBeUndefined();
  } finally {
    globalThis.fetch = original;
    for (const chave of ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]) setConfig(chave, null);
  }
});

test("preparação pública entrega roteiro sem persona nem instruções e protege a conexão", async ({ page }) => {
  const sims = await (await page.request.get("/api/simulacoes")).json();
  const codigo = sims.itens.find((s: { status: string }) => s.status === "ativa").codigo;
  expect((await page.request.post(`/api/salas/${codigo}/livekit`)).status()).toBe(401);
  await page.request.post(`/api/salas/${codigo}/identificar`, { data: { nome: "Preparação", email: "preparacao@example.com" } });
  const preparo = await (await page.request.post(`/api/salas/${codigo}/sessao`)).json();
  expect(preparo.roteiro).toHaveLength(5);
  expect(preparo.comecou).toBe(false);
  expect(JSON.stringify(preparo)).not.toMatch(/instrucoes|personaId/);
  await page.goto(`/simular/${codigo}?pronto=1`);
  await expect(page.getByRole("heading", { name: "Seu roteiro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Começar conversa" })).toBeEnabled();
  expect((await page.request.post(`/api/salas/${codigo}/livekit`)).status()).toBe(409);
});

test("configuração oferece Gemini e OpenAI na simulação e avaliação", async ({ page }) => {
  const setup = await (await page.request.get("/api/setup")).json();
  const ia = setup.integracoes.find((i: { id: string }) => i.id === "openrouter");
  for (const chave of ["OPENROUTER_MODEL", "OPENROUTER_MODEL_AVALIACAO"]) {
    const campo = ia.campos.find((c: { chave: string }) => c.chave === chave);
    expect(campo.opcoes.some((o: { valor: string }) => o.valor.startsWith("google/gemini-"))).toBe(true);
    expect(campo.opcoes.some((o: { valor: string }) => o.valor.startsWith("openai/"))).toBe(true);
  }
});

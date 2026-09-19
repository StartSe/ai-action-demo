import { test, expect } from "./fixtures";
import { planoBase, pontosFracos, validarPlano } from "../lib/coaching-comum";
import type { AvaliacaoSessao } from "../lib/avaliacao";

const avaliacao: AvaliacaoSessao = {
  notaGeral: 6, grupos: [], pontosFortes: ["Confirmou o cenário atual."], resumo: "Investigue o impacto antes da proposta.", oportunidade: null,
  contexto: { simulacao: "Treino", produto: "Produto", metodologia: "SPIN", dificuldade: "realista", vendedor: "Pessoa" },
  criterios: [
    { id: "situacao", nome: "Situação", grupo: "Descoberta", nota: 9, evidencia: '"Como funciona hoje?"', comoMelhorar: "Mantenha a pergunta de abertura.", semEvidencia: false },
    { id: "impacto", nome: "Impacto", grupo: "Descoberta", nota: 3, evidencia: "", comoMelhorar: "Pergunte quanto tempo o problema custa por semana.", semEvidencia: true },
  ],
};

test("plano prioriza lacunas e rejeita ações sem critério ou sem medida", async () => {
  expect(pontosFracos(avaliacao).map(c => c.id)).toEqual(["impacto"]);
  expect(planoBase(avaliacao).acoes[0].criterioId).toBe("impacto");
  expect(validarPlano({ acoes: [{ criterioId: "inventado", acao: "Ação", comoMedir: "Medida" }, { criterioId: "impacto", acao: "Ação" }] }, avaliacao)).toEqual([]);
});

test("planejador consulta a avaliação e preserva as notas; falha não perde o plano", async () => {
  const { setConfig } = await import("../lib/store");
  const { planejarTreino } = await import("../lib/coaching");
  setConfig("OPENROUTER_API_KEY", "teste");
  const original = globalThis.fetch;
  let chamadas = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      chamadas++;
      const pedido = JSON.parse(String(init?.body));
      expect(init?.signal).toBeTruthy();
      if (chamadas === 1) return Response.json({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "consulta", type: "function", function: { name: "consultar_avaliacao", arguments: "{}" } }] } }] });
      const ferramenta = pedido.messages.find((m: { role: string }) => m.role === "tool");
      expect(JSON.parse(ferramenta.content).avaliacao.criterios[1].nota).toBe(3);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ acoes: [{ criterioId: "impacto", acao: "Pergunte quantas horas são perdidas por semana.", comoMedir: "Registre a estimativa do cliente antes de apresentar a solução." }] }) } }] });
    };
    const plano = await planejarTreino(avaliacao, [], false);
    expect(plano.origem).toBe("ia");
    expect(chamadas).toBe(2);
    expect(avaliacao.notaGeral).toBe(6);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    expect((await planejarTreino(avaliacao, [], false)).origem).toBe("orientacao");
  } finally { globalThis.fetch = original; setConfig("OPENROUTER_API_KEY", null); }
});

test("orientador consulta treino, mantém dica fora da transcrição e reutiliza o resultado", async () => {
  const { semearDemonstracao } = await import("../lib/semear-demo");
  semearDemonstracao();
  const { listar } = await import("../lib/simulacoes");
  const { garantir } = await import("../lib/participantes");
  const { abrir, registrarMensagem, transcricao } = await import("../lib/sessoes");
  const { setConfig } = await import("../lib/store");
  const { orientarTurno } = await import("../lib/coaching");
  const simulacao = listar()[0];
  const participante = garantir({ nome: "Teste", email: "coach@example.com" });
  const sessao = abrir({ simulacaoCodigo: simulacao.codigo, participanteId: participante.id, modo: "texto" });
  registrarMensagem({ sessaoId: sessao.id, papel: "vendedor", texto: "Posso apresentar nossa solução?" });
  const mensagem = registrarMensagem({ sessaoId: sessao.id, papel: "cliente", texto: "Quanto custa?" });
  const contexto = { simulacao, participante, sessao };
  setConfig("OPENROUTER_API_KEY", "teste");
  const original = globalThis.fetch;
  let chamadas = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      chamadas++;
      const pedido = JSON.parse(String(init?.body));
      if (chamadas === 1) return Response.json({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "treino", type: "function", function: { name: "consultar_treino", arguments: "{}" } }] } }] });
      const contextoFerramenta = JSON.parse(pedido.messages.find((m: { role: string }) => m.role === "tool").content);
      expect(contextoFerramenta.criterios.length).toBeGreaterThan(0);
      expect(contextoFerramenta.personaId).toBeUndefined();
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ texto: "Pergunte qual resultado justificaria o investimento." }) } }] });
    };
    const dica = await orientarTurno(contexto, mensagem.id);
    expect(dica.origem).toBe("ia");
    expect(dica.texto.length).toBeLessThanOrEqual(160);
    expect(await orientarTurno(contexto, mensagem.id)).toEqual(dica);
    expect(chamadas).toBe(2);
    expect(transcricao(sessao.id)).toHaveLength(2);
    await expect(orientarTurno(contexto, "mensagem-de-outra-pessoa")).rejects.toThrow();
  } finally { globalThis.fetch = original; setConfig("OPENROUTER_API_KEY", null); }
});

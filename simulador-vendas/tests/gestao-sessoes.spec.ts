import { test, expect } from "./fixtures";

test("silêncio, fala vazia e registros antigos ficam fora de todas as contagens e avaliações", async () => {
  const { semearDemonstracao } = await import("../lib/semear-demo");
  const simulacoes = await import("../lib/simulacoes");
  const pessoas = await import("../lib/participantes");
  const sessoes = await import("../lib/sessoes");
  const { banco } = await import("../lib/banco");
  const historico = await import("../lib/historico");
  const { avaliarSessao } = await import("../lib/avaliacao");
  semearDemonstracao();
  const modelo = simulacoes.listar()[0];
  const sim = simulacoes.criar({ ...modelo, nome: "Regressão silêncio", exemplo: false });
  const p = pessoas.criar({ nome: "Microfone indisponível" });
  const abrir = () => { const s = sessoes.abrir({ simulacaoCodigo: sim.codigo, participanteId: p.id, modo: "texto" }); sessoes.iniciar(s.id); return s; };
  const silenciosa = abrir();
  sessoes.registrarMensagem({ sessaoId: silenciosa.id, papel: "cliente", texto: "Olá, pode falar." });
  expect(sessoes.encerrar(silenciosa.id)?.status).toBe("abandonada");
  expect(sessoes.tentativasDe(sim.codigo, p.id)).toBe(0);
  expect(await avaliarSessao(silenciosa.id)).toBeNull();
  expect(sessoes.resumoPorSimulacao()[sim.codigo]).toBeUndefined();

  // Representa uma sessão criada antes da correção e uma nota incorreta já gravada.
  const antiga = abrir();
  banco().prepare("INSERT INTO mensagens_sessao (id, sessaoId, papel, texto, criadoEm) VALUES (?, ?, 'vendedor', ?, ?)").run("fala-em-branco", antiga.id, " \t\n\r\u00a0 ", new Date().toISOString());
  const invalido = historico.salvar({ tipo: "sessao", titulo: "Silêncio", entrada: {}, saida: { notaGeral: 10 }, meta: {} });
  sessoes.registrarResultado(antiga.id, invalido);
  expect(await avaliarSessao(antiga.id)).toBeNull();
  const pendenteVazia = abrir();
  banco().prepare("UPDATE sessoes_treino SET status = 'encerrada', modo = 'voz-agente', envioEmail = 'falhou' WHERE id = ?").run(pendenteVazia.id);
  const real = abrir();
  sessoes.registrarMensagem({ sessaoId: real.id, papel: "vendedor", texto: "Qual problema vocês precisam resolver?" });
  sessoes.encerrar(real.id);
  expect(sessoes.pendentesDeAvaliacao().filter(s => s.simulacaoCodigo === sim.codigo).map(s => s.id)).toEqual([real.id]);
  const valido = historico.salvar({ tipo: "sessao", titulo: "Conversa", entrada: {}, saida: { notaGeral: 8 }, meta: {} });
  sessoes.registrarResultado(real.id, valido);
  const preparacao = sessoes.abrir({ simulacaoCodigo: sim.codigo, participanteId: p.id, modo: "texto" });

  expect(sessoes.resumoPorSimulacao()[sim.codigo]).toMatchObject({ sessoes: 1, participantes: 1, reais: 1 });
  expect(sessoes.notaMediaPorSimulacao()[sim.codigo]).toEqual({ nota: 8, avaliadas: 1 });
  expect(sessoes.resumoPorParticipante()[p.id]).toMatchObject({ sessoes: 1, nota: 8, avaliadas: 1 });
  expect(sessoes.treinosPorParticipante()[p.id]).toBe(1);
  expect(sessoes.listarPorSimulacao(sim.codigo).map(s => s.id)).toEqual([real.id]);
  expect(sessoes.listarPorParticipante(p.id).map(s => s.id)).toEqual([real.id]);
  expect(sessoes.historicoDe(sim.codigo, p.id).map(s => s.id)).toEqual([real.id]);
  expect(sessoes.sessoesComNotaDe(p.id).map(s => s.id)).toEqual([real.id]);
  expect(sessoes.melhorSessaoDe(sim.codigo, p.id)?.nota).toBe(8);
  expect(sessoes.avaliacoesDaSimulacao(sim.codigo).map(s => s.sessao.id)).toEqual([real.id]);
  expect(sessoes.avaliacoesDosParticipantes([p.id], "2000-01-01")).toHaveLength(1);
  expect(sessoes.sessoesDesde("2000-01-01").filter(s => s.sessao.simulacaoCodigo === sim.codigo).map(s => s.sessao.id)).toEqual([real.id]);
  expect(sessoes.movimentoEntre("2000-01-01", "2100-01-01")).toMatchObject({ sessoes: 1, avaliadas: 1, notaMedia: 8 });
  expect(sessoes.falhasDeEnvioEmail().some(s => s.id === pendenteVazia.id)).toBe(false);
  expect(sessoes.conversasSemAvaliacao()).toBe(0);
  expect(sessoes.tentativasDe(sim.codigo, p.id)).toBe(2); // A preparação reserva a próxima tentativa.
  expect(sessoes.emPreparacao(sim.codigo, p.id)?.id).toBe(preparacao.id);
  simulacoes.apagar(sim.codigo); pessoas.apagar(p.id); historico.apagar(invalido); historico.apagar(valido);
});

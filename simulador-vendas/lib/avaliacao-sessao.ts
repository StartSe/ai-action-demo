// A avaliação de uma sessão de treino, num lugar só.
//
// Duas portas levam até aqui e as duas têm de produzir o mesmo resultado: a conversa que termina na
// própria tela (US-015, nível 2) e a que chega de fora pelo aviso de pós-conversa do agente
// conversacional (US-016, nível 1) — nesta o vendedor já saiu da ligação quando a transcrição chega.
//
// Os critérios são sempre os da metodologia que o gestor escolheu (US-010), nunca a lista fixa: é o
// que faz a avaliação cobrir o que ele ensina. A avaliação por rubrica é a US-018; quando ela chegar,
// é esta função que muda, e as duas portas mudam junto.
import crypto from "node:crypto";
import { salvarConversaAnalisada } from "./analise";
import { criteriosDe } from "./metodologias";
import { registrarResultado, transcricao, type Sessao } from "./sessoes";
import { obter as obterSimulacao } from "./simulacoes";
import type { Analise, Conversa } from "./types";
import type { Meta } from "./ai";

export type SessaoAvaliada = { demo: boolean; conversa: Conversa; analise: Analise; meta: Meta; id?: string; titulo: string };

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/**
 * Avalia a conversa gravada da sessão e liga o resultado a ela (o link /r/<id> do vendedor e do
 * gestor). Devolve `null` quando não há o que avaliar — conversa sem nenhuma fala do vendedor, ou
 * simulação que já não existe —, porque dar nota a um silêncio seria inventar um resultado.
 */
export async function avaliarSessao(sessao: Sessao): Promise<SessaoAvaliada | null> {
  const simulacao = obterSimulacao(sessao.simulacaoCodigo);
  if (!simulacao) return null;

  const falas = transcricao(sessao.id);
  if (!falas.some((f) => f.papel === "vendedor")) return null;

  const conversa: Conversa = {
    id: gerarId(),
    vendedorId: sessao.participanteId,
    origem: sessao.modo === "texto" ? "texto" : "voz",
    transcricao: falas.map((f) => ({ papel: f.papel, texto: f.texto, segundo: f.segundo })),
    duracaoSeg: sessao.duracaoSeg,
    criadoEm: sessao.iniciadaEm ?? sessao.criadoEm,
  };

  const resultado = await salvarConversaAnalisada(
    conversa,
    criteriosDe(simulacao).map((c) => c.nome),
  );
  if (resultado.id) registrarResultado(sessao.id, resultado.id);
  return { ...resultado, conversa };
}

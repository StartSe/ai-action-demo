// Comparar os candidatos de uma vaga (US-024): a mesma pergunta feita a todo mundo, nas mesmas linhas.
//
// **Calculada na leitura, nunca salva.** É o que substituiu o `gerarRanking()` antigo, que chamava
// `meta()` e gravava um registro `ranking` no histórico. Comparar não produz informação nova — é a
// releitura dos pareceres que já existem — e um registro salvo envelheceria no instante seguinte,
// quando o gestor registrasse uma decisão ou mais um candidato terminasse a conversa.
//
// **As linhas são as do CADASTRO da vaga, não as que cada parecer trouxe.** Uma comparação em que o
// candidato A tem cinco requisitos e o B tem três não compara nada: o que falta em B some da tela em
// vez de aparecer como "não abordado". Por isso a aderência e a cultura de cada um são alinhadas
// contra `vaga.requisitos` e `vaga.competenciasCulturais`, casadas pelo texto normalizado.
//
// Mora acima das entidades, como `lib/painel.ts`: junta vaga, entrevista, candidato e parecer, e
// nenhum módulo de entidade pode importá-la de volta.
import { chaveDoItem } from "./avaliacao";
import { obter as obterCandidato } from "./candidatos";
import { listar as listarEntrevistas, type Decisao } from "./entrevistas";
import { obter as obterResultado } from "./historico";
import { obter as obterVaga } from "./vagas";
import type { AderenciaRequisito, CriterioCultural, ItemConsistencia, Parecer, Recomendacao } from "./types";

/** Um candidato já avaliado, do jeito que a comparação o mostra: os números da tabela e o material do
 * "Lado a lado", tudo tirado do parecer que já estava salvo. */
export type CandidatoComparado = {
  entrevistaId: string;
  candidatoId: string;
  candidatoNome: string;
  resultadoId?: string;
  exemplo: boolean;
  concluidaEm?: string;
  decisao?: Decisao;
  notaGeral: number;
  recomendacao: Recomendacao;
  resumo: string;
  /** Quantos requisitos da vaga a conversa mostrou que ele atende, entre todos os do cadastro. */
  aderencia: { atendidos: number; total: number; itens: AderenciaRequisito[] };
  /** A média das competências que receberam nota; `null` quando nenhuma foi abordada. */
  cultura: { media: number | null; itens: CriterioCultural[] };
  /** Quantas afirmações da conversa não batem com o currículo ou com o perfil público. */
  consistencia: { divergencias: number; itens: ItemConsistencia[] };
  pontosFortes: string[];
  pontosAtencao: string[];
  proximaEtapa: { perguntas: string[]; foco: string };
};

export type Comparacao = {
  vaga: { id: string; cargo: string; status: "aberta" | "encerrada"; requisitos: string[]; competencias: string[] };
  /** Ordenados por nota, maior primeiro. */
  candidatos: CandidatoComparado[];
  /** Quantos candidatos desta vaga ainda não têm parecer — é o que explica uma comparação com menos
   * gente do que a tabela da vaga mostra. */
  semParecer: number;
};

/**
 * Alinha o que o parecer trouxe com a lista do cadastro, item a item.
 *
 * O casamento é pelo texto normalizado. A posição só vale como reserva quando as duas listas têm o
 * mesmo tamanho — aí é quase certo que são a mesma lista na mesma ordem (um parecer antigo cujo
 * requisito foi reescrito depois). Com tamanhos diferentes, chutar pela posição rotularia um
 * requisito com a evidência de outro, que é pior do que dizer "não abordado".
 */
function alinhar<T>(cadastro: string[], doParecer: T[], nomeDe: (item: T) => string, ausente: (nome: string) => T): T[] {
  if (!cadastro.length) return doParecer;
  const porChave = new Map(doParecer.map((item) => [chaveDoItem(nomeDe(item)), item]));
  const mesmoTamanho = doParecer.length === cadastro.length;
  return cadastro.map((nome, i) => porChave.get(chaveDoItem(nome)) ?? (mesmoTamanho ? doParecer[i] : ausente(nome)));
}

function requisitoAusente(requisito: string): AderenciaRequisito {
  return { requisito, situacao: "nao_abordado", evidencia: "A conversa não chegou a este ponto." };
}

function competenciaAusente(competencia: string): CriterioCultural {
  return { competencia, nota: null, evidencia: "A conversa não trouxe uma situação concreta sobre isto." };
}

/** A média das competências com nota, com uma casa. `null` quando nenhuma foi abordada — e `null` não
 * é zero: ninguém é mal avaliado por uma pergunta que a entrevista não chegou a fazer. */
function mediaCultural(itens: CriterioCultural[]): number | null {
  const notas = itens.map((c) => c.nota).filter((n): n is number => typeof n === "number");
  if (!notas.length) return null;
  return Math.round((notas.reduce((soma, n) => soma + n, 0) / notas.length) * 10) / 10;
}

/**
 * Os candidatos avaliados desta vaga, lado a lado. `null` quando a vaga não existe mais.
 *
 * Quem ainda não tem parecer não entra na comparação (não há o que comparar), mas é contado em
 * `semParecer`: a diferença entre "só dois candidatos" e "dois de sete já conversaram" muda o que o
 * gestor faz com a tela.
 */
export function compararCandidatos(vagaId: string): Comparacao | null {
  const vaga = obterVaga(vagaId);
  if (!vaga) return null;

  const requisitos = vaga.requisitos.split("\n").map((r) => r.trim()).filter(Boolean);
  const competencias = vaga.competenciasCulturais.map((c) => c.nome);
  const entrevistas = listarEntrevistas({ vagaId, limite: 500 });

  const candidatos: CandidatoComparado[] = [];
  for (const entrevista of entrevistas) {
    const parecer = entrevista.resultadoId ? obterResultado<unknown, Parecer>(entrevista.resultadoId)?.saida : undefined;
    if (!parecer || typeof parecer.notaGeral !== "number") continue;

    const itensAderencia = alinhar(requisitos, parecer.aderencia, (a) => a.requisito, requisitoAusente);
    const itensCultura = alinhar(competencias, parecer.cultura, (c) => c.competencia, competenciaAusente);

    candidatos.push({
      entrevistaId: entrevista.id,
      candidatoId: entrevista.candidatoId,
      candidatoNome: obterCandidato(entrevista.candidatoId)?.nome ?? "Candidato removido",
      resultadoId: entrevista.resultadoId,
      exemplo: entrevista.exemplo,
      concluidaEm: entrevista.concluidaEm,
      decisao: entrevista.decisao,
      notaGeral: parecer.notaGeral,
      recomendacao: parecer.recomendacao,
      resumo: parecer.resumo,
      aderencia: {
        atendidos: itensAderencia.filter((a) => a.situacao === "atende").length,
        total: itensAderencia.length,
        itens: itensAderencia,
      },
      cultura: { media: mediaCultural(itensCultura), itens: itensCultura },
      consistencia: {
        divergencias: parecer.consistencia.filter((c) => c.situacao === "divergente").length,
        itens: parecer.consistencia,
      },
      pontosFortes: parecer.pontosFortes,
      pontosAtencao: parecer.pontosAtencao,
      proximaEtapa: parecer.proximaEtapa,
    });
  }

  // Empate na nota é desempatado pelo nome: sem isso a ordem das colunas mudaria a cada leitura, e
  // duas pessoas com a mesma nota trocariam de lugar entre um F5 e outro.
  candidatos.sort((a, b) => b.notaGeral - a.notaGeral || a.candidatoNome.localeCompare(b.candidatoNome, "pt-BR"));

  const avaliados = new Set(candidatos.map((c) => c.entrevistaId));
  const semParecer = entrevistas.filter(
    (e) => !avaliados.has(e.id) && e.status !== "cancelada" && e.status !== "expirada",
  ).length;

  return {
    vaga: { id: vaga.id, cargo: vaga.cargo, status: vaga.status, requisitos, competencias },
    candidatos,
    semParecer,
  };
}

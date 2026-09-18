// A junção de leitura que as telas do painel pedem: uma entrevista nunca aparece sozinha numa tela —
// vem sempre com o nome do candidato, o cargo da vaga e, quando já foi avaliada, a nota e a
// recomendação do parecer (US-007, e depois US-013 e US-015).
//
// Por que um módulo próprio, e não mais uma função em `lib/entrevistas.ts`: aquele arquivo guarda
// estado e só depende de `lib/banco.ts`. Se ele passasse a importar vaga, candidato e histórico, o
// primeiro módulo de entidade que precisasse de entrevista fecharia ciclo. Aqui em cima ninguém
// importa de volta.
import { listar as listarCandidatos, obter as obterCandidato, resumoDaFicha, type Candidato, type ResumoFicha } from "./candidatos";
import { contarPorCandidato, contarEntrevistas, listar as listarEntrevistas, type Entrevista, type FiltroEntrevistas } from "./entrevistas";
import { obter as obterResultado } from "./historico";
import { obter as obterVaga } from "./vagas";
import type { Parecer, Recomendacao } from "./types";

/** Uma entrevista com o contexto que a tela mostra na mesma linha. */
export type EntrevistaNoPainel = Entrevista & {
  candidatoNome: string;
  vagaCargo: string;
  /** Do parecer em `lib/historico.ts`, só quando a entrevista já foi avaliada. */
  notaGeral?: number;
  recomendacao?: Recomendacao;
};

/** O que a lista precisa saber do parecer. Ler o resultado inteiro para mostrar dois valores é o
 * preço de uma linha; ler trinta pareceres para montar uma tabela seria o de uma tela lenta — por
 * isso só as entrevistas com `resultadoId` passam por aqui. */
function resumoDoParecer(resultadoId?: string): { notaGeral?: number; recomendacao?: Recomendacao } {
  if (!resultadoId) return {};
  const resultado = obterResultado<unknown, Parecer>(resultadoId);
  const parecer = resultado?.saida;
  if (!parecer || typeof parecer.notaGeral !== "number") return {};
  return { notaGeral: parecer.notaGeral, recomendacao: parecer.recomendacao };
}

/**
 * As entrevistas do filtro, cada uma com candidato, vaga e parecer.
 *
 * Vaga e candidato são lidos por um cache de id dentro da própria chamada: uma vaga com trinta
 * candidatos faria trinta leituras da MESMA vaga sem ele.
 */
export function listarEntrevistasNoPainel(filtro: FiltroEntrevistas = {}): EntrevistaNoPainel[] {
  const nomes = new Map<string, string>();
  const cargos = new Map<string, string>();

  return listarEntrevistas(filtro).map((entrevista) => {
    if (!nomes.has(entrevista.candidatoId)) {
      nomes.set(entrevista.candidatoId, obterCandidato(entrevista.candidatoId)?.nome ?? "Candidato removido");
    }
    if (!cargos.has(entrevista.vagaId)) {
      cargos.set(entrevista.vagaId, obterVaga(entrevista.vagaId)?.cargo ?? "Vaga removida");
    }
    return {
      ...entrevista,
      candidatoNome: nomes.get(entrevista.candidatoId) as string,
      vagaCargo: cargos.get(entrevista.vagaId) as string,
      ...resumoDoParecer(entrevista.resultadoId),
    };
  });
}

/** Um candidato como a lista dele o mostra: a ficha já resumida e o processo em que ele está. */
export type CandidatoNoPainel = Candidato & {
  /** Da ficha (US-009): o cargo atual e de onde cada parte dela veio ("CV", "Web"). */
  cargoAtual?: string;
  origens: ResumoFicha["origens"];
  entrevistas: number;
  ultimaVaga?: string;
};

/**
 * A lista de candidatos com o contexto que a tela mostra na mesma linha (US-008).
 *
 * Mesma razão de `listarEntrevistasNoPainel` para estar aqui e não em `lib/candidatos.ts`: aquele
 * módulo guarda estado e não pode importar entrevista nem vaga. A contagem vem de UMA consulta
 * agregada (`contarPorCandidato`), e o cargo de cada vaga de um cache de id — trinta candidatos da
 * mesma vaga não podem virar trinta leituras dela.
 */
export function listarCandidatosNoPainel({ busca }: { busca?: string } = {}): CandidatoNoPainel[] {
  const contagens = contarPorCandidato();
  const cargos = new Map<string, string | undefined>();

  return listarCandidatos({ busca }).map((candidato) => {
    const contagem = contagens[candidato.id];
    if (contagem && !cargos.has(contagem.ultimaVagaId)) {
      cargos.set(contagem.ultimaVagaId, obterVaga(contagem.ultimaVagaId)?.cargo);
    }
    const { cargoAtual, origens } = resumoDaFicha(candidato.ficha);
    return {
      ...candidato,
      cargoAtual,
      origens,
      entrevistas: contagem?.total ?? 0,
      ultimaVaga: contagem ? cargos.get(contagem.ultimaVagaId) : undefined,
    };
  });
}

/**
 * As cinco abas da tela Entrevistas (US-015). Não são os sete status do banco: quem acompanha o
 * processo pergunta "quem ainda não respondeu", "o que falta decidir" — e `concluida` e `avaliada`
 * são a mesma espera para quem olha (o parecer chega sozinho), enquanto uma entrevista já decidida
 * sai da fila mesmo estando `avaliada`.
 */
export type FaixaEntrevista = "aguardando" | "andamento" | "concluidas" | "decididas" | "encerradas";

export const FAIXAS: FaixaEntrevista[] = ["aguardando", "andamento", "concluidas", "decididas", "encerradas"];

export function faixaDaEntrevista(e: { status: Entrevista["status"]; decisao?: Entrevista["decisao"] }): FaixaEntrevista {
  switch (e.status) {
    case "convidada":
    case "aberta":
      return "aguardando";
    case "em_andamento":
      return "andamento";
    case "concluida":
    case "avaliada":
      return e.decisao ? "decididas" : "concluidas";
    default:
      return "encerradas";
  }
}

export type PainelEntrevistas = {
  itens: EntrevistaNoPainel[];
  /** Quantas entrevistas cada aba tem **com os filtros atuais** — o número ao lado do nome da aba. */
  contagens: Record<FaixaEntrevista, number>;
  /** Quantas entrevistas existem no total, sem filtro nenhum: é o que separa "nada aqui ainda" de
   * "nada com esses filtros", que pedem telas diferentes. */
  total: number;
};

/**
 * A tela Entrevistas: uma aba, os filtros de vaga, nome e período, e a contagem de todas as abas.
 *
 * A contagem vem da MESMA leitura que a lista: as abas mostram o efeito dos filtros escolhidos, e
 * cinco consultas para escrever cinco números seria a tela inteira lida cinco vezes. O nome do
 * candidato só existe depois da junção, então a busca por nome é filtrada aqui e não em SQL.
 */
export function painelDeEntrevistas({
  faixa,
  vagaId,
  busca,
  dias,
}: { faixa?: FaixaEntrevista; vagaId?: string; busca?: string; dias?: number } = {}): PainelEntrevistas {
  const periodo = dias ? { de: new Date(Date.now() - dias * 86_400_000).toISOString() } : undefined;
  const termo = busca?.trim().toLowerCase();

  const todas = listarEntrevistasNoPainel({ vagaId, periodo, limite: 500 }).filter(
    (e) => !termo || e.candidatoNome.toLowerCase().includes(termo),
  );

  const contagens = Object.fromEntries(FAIXAS.map((f) => [f, 0])) as Record<FaixaEntrevista, number>;
  for (const entrevista of todas) contagens[faixaDaEntrevista(entrevista)] += 1;

  return {
    itens: faixa ? todas.filter((e) => faixaDaEntrevista(e) === faixa) : todas,
    contagens,
    total: contarEntrevistas(),
  };
}

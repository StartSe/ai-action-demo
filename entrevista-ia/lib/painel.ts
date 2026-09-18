// A junção de leitura que as telas do painel pedem: uma entrevista nunca aparece sozinha numa tela —
// vem sempre com o nome do candidato, o cargo da vaga e, quando já foi avaliada, a nota e a
// recomendação do parecer (US-007, e depois US-013 e US-015).
//
// Por que um módulo próprio, e não mais uma função em `lib/entrevistas.ts`: aquele arquivo guarda
// estado e só depende de `lib/banco.ts`. Se ele passasse a importar vaga, candidato e histórico, o
// primeiro módulo de entidade que precisasse de entrevista fecharia ciclo. Aqui em cima ninguém
// importa de volta.
import { obter as obterCandidato } from "./candidatos";
import { listar as listarEntrevistas, type Entrevista, type FiltroEntrevistas } from "./entrevistas";
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

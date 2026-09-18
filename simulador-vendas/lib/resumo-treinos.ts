// O que o time treinou num período — o insumo da rotina "Resumo dos treinos" (US-029).
//
// É cálculo puro sobre o que já está gravado: quem treinou, quanto tirou e onde o time trava. Nenhuma
// chamada de IA nasce aqui, pela mesma razão do painel (US-022): a rotina roda sozinha, às vezes toda
// semana, e duas execuções sobre os mesmos dados têm de dizer a mesma coisa.
import type { AvaliacaoSessao } from "./avaliacao";
import { obter as obterParticipante } from "./participantes";
import { sessoesDesde } from "./sessoes";
import { obter as obterSimulacao } from "./simulacoes";

export type QuemTreinou = { nome: string; sessoes: number; notaMedia: number | null };

export type TreinoDoPeriodo = { codigo: string; nome: string; sessoes: number };

export type ResumoTreinos = {
  /** Início do período considerado, em ISO — o que a rotina chama de "desde a última execução". */
  desde: string;
  sessoes: number;
  avaliadas: number;
  participantes: number;
  notaMedia: number | null;
  /** Quem treinou, de quem mais treinou para quem menos. */
  quemTreinou: QuemTreinou[];
  /** A competência com a menor média do período — a maior dificuldade do time. `null` sem avaliação. */
  dificuldade: { nome: string; nota: number } | null;
  /** O treino que mais rodou no período; é o painel para o qual a notificação aponta. */
  treinoMaisMovimentado: TreinoDoPeriodo | null;
};

function media(notas: number[]): number | null {
  if (!notas.length) return null;
  return Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10;
}

/** A avaliação gravada, ou `null` quando o JSON está torto — um registro ilegível sai da conta em vez
 * de derrubar a rotina inteira (mesma decisão de `lerAvaliacao` em lib/painel-simulacao.ts). */
function lerAvaliacao(saida: string): AvaliacaoSessao | null {
  try {
    const lido = JSON.parse(saida) as AvaliacaoSessao | null;
    return lido && typeof lido === "object" && Number.isFinite(Number(lido.notaGeral)) ? lido : null;
  } catch (err) {
    console.error("Avaliação com saída mal formada; fora do resumo dos treinos.", err);
    return null;
  }
}

/** Texto sem acento e sem maiúscula, para "Escuta ativa" e "escuta ATIVA" contarem como um critério só. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

export function resumoDeTreinos(desde: string): ResumoTreinos {
  const linhas = sessoesDesde(desde);

  const porParticipante = new Map<string, { sessoes: number; notas: number[] }>();
  const porTreino = new Map<string, number>();
  const porCriterio = new Map<string, { nome: string; notas: number[] }>();
  const notas: number[] = [];

  for (const { sessao, saida } of linhas) {
    const doParticipante = porParticipante.get(sessao.participanteId) ?? { sessoes: 0, notas: [] };
    doParticipante.sessoes += 1;
    porTreino.set(sessao.simulacaoCodigo, (porTreino.get(sessao.simulacaoCodigo) ?? 0) + 1);

    const avaliacao = saida ? lerAvaliacao(saida) : null;
    if (avaliacao) {
      notas.push(avaliacao.notaGeral);
      doParticipante.notas.push(avaliacao.notaGeral);
      for (const c of avaliacao.criterios ?? []) {
        const chave = normalizar(c.nome);
        const doCriterio = porCriterio.get(chave) ?? { nome: c.nome, notas: [] };
        doCriterio.notas.push(c.nota);
        porCriterio.set(chave, doCriterio);
      }
    }
    porParticipante.set(sessao.participanteId, doParticipante);
  }

  const quemTreinou: QuemTreinou[] = [...porParticipante.entries()]
    .map(([id, d]) => ({ nome: obterParticipante(id)?.nome || "Sem nome", sessoes: d.sessoes, notaMedia: media(d.notas) }))
    .sort((a, b) => b.sessoes - a.sessoes || a.nome.localeCompare(b.nome, "pt-BR"));

  const dificuldade = [...porCriterio.values()]
    .map((c) => ({ nome: c.nome, nota: media(c.notas) as number }))
    .sort((a, b) => a.nota - b.nota)[0] ?? null;

  const maisMovimentado = [...porTreino.entries()].sort((a, b) => b[1] - a[1])[0];
  const treinoMaisMovimentado: TreinoDoPeriodo | null = maisMovimentado
    ? { codigo: maisMovimentado[0], nome: obterSimulacao(maisMovimentado[0])?.nome || "Treino apagado", sessoes: maisMovimentado[1] }
    : null;

  return {
    desde,
    sessoes: linhas.length,
    avaliadas: notas.length,
    participantes: porParticipante.size,
    notaMedia: media(notas),
    quemTreinou,
    dificuldade,
    treinoMaisMovimentado,
  };
}

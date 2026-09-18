// O parecer em texto puro: o que sai no "Copiar texto" e no corpo do e-mail (US-023).
//
// Mora em `lib/` e não no componente da tela pela mesma razão de `faixaSalarial` (lib/formato.ts): é
// a MESMA informação dita de outro jeito, e uma segunda cópia da ordem das seções viraria um parecer
// colado no e-mail que não bate com o parecer aberto no app. Não toca o banco nem tem `"use client"`,
// então a tela do gestor, a página de impressão e qualquer rotina futura podem chamá-lo.
import { data, moeda, numero } from "./formato";
import type { Parecer, SituacaoConsistencia, SituacaoRequisito } from "./types";

export const ROTULO_REQUISITO: Record<SituacaoRequisito, string> = {
  atende: "Atende",
  parcial: "Parcial",
  nao_atende: "Não atende",
  nao_abordado: "Não abordado",
};

export const ROTULO_CONSISTENCIA: Record<SituacaoConsistencia, string> = {
  confirmado: "Confirmado",
  divergente: "Divergente",
  nao_verificavel: "Não verificável",
};

/** Com o que a afirmação foi comparada. */
export const ROTULO_FONTE_CONSISTENCIA = { cv: "currículo", web: "perfil público" } as const;

export const AVISO_PARCIAL = "Entrevista encerrada antes do fim: o parecer cobre só o que foi conversado.";

/** O cabeçalho do texto: quem, para qual vaga e quando. Os três vêm da entrevista, não do parecer. */
export type ContextoDoParecer = { candidato: string; cargo: string; quando?: string; comoFoi?: string };

export function parecerParaTexto(parecer: Parecer, ctx: ContextoDoParecer): string {
  const linhas: string[] = [`Parecer de ${ctx.candidato} — ${ctx.cargo}`];
  if (ctx.quando) linhas.push(data(ctx.quando, { comAno: true }));
  if (ctx.comoFoi) linhas.push(ctx.comoFoi);
  linhas.push("");

  if (parecer.parcial) linhas.push(AVISO_PARCIAL, "");

  linhas.push(`Nota geral: ${numero(parecer.notaGeral, 1)}/10`, `Recomendação: ${parecer.recomendacao}`, "", parecer.resumo, "");

  linhas.push("Aderência à vaga:");
  parecer.aderencia.forEach((a) => linhas.push(`- ${a.requisito}: ${ROTULO_REQUISITO[a.situacao]} — ${a.evidencia}`));

  linhas.push("", "Avaliação técnica:");
  parecer.tecnico.forEach((c) => linhas.push(`- ${c.criterio}: ${numero(c.nota, 1)}/10 — ${c.evidencia}`));

  linhas.push("", "Cultura:");
  parecer.cultura.forEach((c) =>
    linhas.push(`- ${c.competencia}: ${c.nota === null ? "não abordado" : `${numero(c.nota, 1)}/10`} — ${c.evidencia}`),
  );

  if (parecer.consistencia.length) {
    linhas.push("", "O que bate e o que não bate:");
    parecer.consistencia.forEach((c) =>
      linhas.push(`- ${c.afirmacao}: ${ROTULO_CONSISTENCIA[c.situacao]} (${ROTULO_FONTE_CONSISTENCIA[c.fonte]}) — ${c.detalhe}`),
    );
  }

  linhas.push("", "Pontos fortes:");
  parecer.pontosFortes.forEach((p) => linhas.push(`- ${p}`));

  linhas.push("", "Pontos de atenção:");
  parecer.pontosAtencao.forEach((p) => linhas.push(`- ${p}`));

  linhas.push("", "Para a próxima etapa:");
  parecer.proximaEtapa.perguntas.forEach((p) => linhas.push(`- ${p}`));
  if (parecer.proximaEtapa.foco) linhas.push(parecer.proximaEtapa.foco);

  if (parecer.pretensao.valor !== undefined) {
    const faixa =
      parecer.pretensao.dentroDaFaixa === undefined ? "" : parecer.pretensao.dentroDaFaixa ? " (dentro da faixa da vaga)" : " (fora da faixa da vaga)";
    linhas.push("", `Pretensão salarial: ${moeda(parecer.pretensao.valor)}${faixa}`);
  }

  return linhas.join("\n");
}

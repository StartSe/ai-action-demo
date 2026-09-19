// A comparação em texto puro: o que sai no "Copiar texto" e no e-mail (US-024).
//
// Mora fora de `lib/comparacao.ts` pelo mesmo motivo de `lib/parecer-texto.ts`: a tela é um client
// component, e um import de valor de um módulo que toca o banco arrastaria o `node:sqlite` para o
// pacote do navegador. Daqui só sai texto — o tipo vem por `import type`, que a compilação apaga.
import { ROTULO_DECISAO, data, numero } from "./formato";
import { ROTULO_REQUISITO } from "./parecer-texto";
import type { CandidatoComparado, Comparacao } from "./comparacao";

/** A linha de números de um candidato — a mesma da tabela, em uma frase. */
export function resumoNumerico(c: CandidatoComparado): string {
  const partes = [
    `${numero(c.notaGeral, 1)}/10`,
    c.recomendacao,
    `aderência ${c.aderencia.atendidos} de ${c.aderencia.total}`,
    `cultura ${c.cultura.media === null ? "não abordada" : `${numero(c.cultura.media, 1)}/10`}`,
    c.consistencia.divergencias === 1 ? "1 divergência" : `${c.consistencia.divergencias} divergências`,
  ];
  if (c.decisao) partes.push(`decisão: ${ROTULO_DECISAO[c.decisao]}`);
  return partes.join(" · ");
}

/**
 * A comparação inteira em texto, na mesma ordem da tela.
 *
 * `escolhidos` são os candidatos que estão no "Lado a lado": quem copia o texto está copiando o que
 * está vendo, e uma cópia com os oito candidatos da vaga não é o que a pessoa pediu.
 */
export function comparacaoParaTexto(comparacao: Comparacao, escolhidos: string[] = []): string {
  const linhas: string[] = [`Comparação de candidatos — ${comparacao.vaga.cargo}`, data(new Date(), { comAno: true }), ""];

  comparacao.candidatos.forEach((c, i) => {
    linhas.push(`${i + 1}. ${c.candidatoNome} — ${resumoNumerico(c)}`);
  });

  if (comparacao.semParecer) {
    linhas.push(
      "",
      comparacao.semParecer === 1
        ? "1 candidato desta vaga ainda não tem parecer."
        : `${comparacao.semParecer} candidatos desta vaga ainda não têm parecer.`,
    );
  }

  const lado = comparacao.candidatos.filter((c) => escolhidos.includes(c.entrevistaId));
  for (const c of lado) {
    linhas.push("", "---", "", `${c.candidatoNome} — ${resumoNumerico(c)}`, "", c.resumo, "", "Requisitos:");
    c.aderencia.itens.forEach((a) => linhas.push(`- ${a.requisito}: ${ROTULO_REQUISITO[a.situacao]}`));

    if (c.cultura.itens.length) {
      linhas.push("", "Competências culturais:");
      c.cultura.itens.forEach((k) =>
        linhas.push(`- ${k.competencia}: ${k.nota === null ? "não abordado" : `${numero(k.nota, 1)}/10`}`),
      );
    }

    linhas.push("", "Pontos fortes:");
    c.pontosFortes.forEach((p) => linhas.push(`- ${p}`));

    linhas.push("", "Pontos de atenção:");
    c.pontosAtencao.forEach((p) => linhas.push(`- ${p}`));

    if (c.proximaEtapa.perguntas.length || c.proximaEtapa.foco) {
      linhas.push("", "Para a próxima etapa:");
      c.proximaEtapa.perguntas.forEach((p) => linhas.push(`- ${p}`));
      if (c.proximaEtapa.foco) linhas.push(c.proximaEtapa.foco);
    }
  }

  return linhas.join("\n");
}

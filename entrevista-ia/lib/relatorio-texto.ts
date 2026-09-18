// O relatório em palavras: o título, o período por extenso e o texto puro que sai no "Copiar texto"
// e no e-mail (US-026).
//
// Mora fora de `lib/relatorios.ts` pelo mesmo motivo de `lib/parecer-texto.ts` e
// `lib/comparacao-texto.ts`: a tela é um client component, e um import de valor de um módulo que
// toca o banco arrastaria o `node:sqlite` para o pacote do navegador. Daqui só sai texto — o tipo
// vem por `import type`, que a compilação apaga.
import { ROTULO_DECISAO, data, numero } from "./formato";
import type { Relatorio } from "./relatorios";

/** "Últimos 30 dias" ou "01/09/2026 a 18/09/2026": a mesma frase no cabeçalho, na impressão e no
 * registro salvo, para dois relatórios guardados nunca parecerem o mesmo recorte. */
export function periodoEmPalavras(r: Relatorio): string {
  if (r.periodo.dias) return `Últimos ${numero(r.periodo.dias)} dias`;
  return `${data(r.periodo.de, { comAno: true })} a ${data(r.periodo.ate, { comAno: true })}`;
}

/** O título do relatório, com a vaga quando há uma escolhida. */
export function tituloDoRelatorio(r: Relatorio): string {
  return r.vaga ? `Relatório · ${r.vaga.cargo}` : "Relatório do processo seletivo";
}

/** A linha de resumo do Histórico: os dois números que dizem se o processo andou. */
export function resumoDoRelatorio(r: Relatorio): string {
  const convidados = r.funil[0]?.valor ?? 0;
  const concluidas = r.funil[2]?.valor ?? 0;
  return `${periodoEmPalavras(r)} · ${numero(convidados)} convidados, ${numero(concluidas)} concluíram`;
}

/** "68%" — a taxa de conclusão, sempre inteira: uma casa decimal numa razão de sete convites é
 * precisão que o número não tem. */
export function porcentagem(fracao: number): string {
  return `${numero(Math.round(fracao * 100))}%`;
}

/** "18 h", "2 h 30 min", "40 min", "—": quanto tempo do convite até a conversa terminar. Os minutos
 * aparecem escritos porque "24 h 12" sozinho é lido como um horário, não como uma duração. */
export function horas(valor: number | null): string {
  if (valor === null) return "—";
  if (valor < 1) return `${numero(Math.round(valor * 60))} min`;
  const inteiras = Math.floor(valor);
  const minutos = Math.round((valor - inteiras) * 60);
  return minutos ? `${numero(inteiras)} h ${numero(minutos)} min` : `${numero(inteiras)} h`;
}

/** O relatório inteiro em texto puro, na mesma ordem da tela. */
export function relatorioParaTexto(r: Relatorio): string {
  const linhas: string[] = [tituloDoRelatorio(r), periodoEmPalavras(r), "", "Funil:"];

  for (const etapa of r.funil) linhas.push(`- ${etapa.rotulo}: ${numero(etapa.valor)}`);

  linhas.push(
    "",
    `Taxa de conclusão: ${r.taxaConclusao === null ? "—" : porcentagem(r.taxaConclusao)}`,
    `Tempo do convite à conclusão: ${horas(r.tempoMedioHoras)} em média, ${horas(r.tempoMedianoHoras)} na mediana`,
    `Nota média: ${r.notaMedia === null ? "—" : `${numero(r.notaMedia, 1)}/10`}`,
  );

  linhas.push("", "Recomendação da entrevistadora:");
  for (const fatia of r.recomendacoes) linhas.push(`- ${fatia.rotulo}: ${numero(fatia.valor)}`);

  linhas.push("", "Decisão do gestor:");
  for (const fatia of r.decisoes) linhas.push(`- ${fatia.rotulo}: ${numero(fatia.valor)}`);

  if (r.comoFoi.some((f) => f.valor > 0)) {
    linhas.push("", "Como as conversas aconteceram:");
    for (const fatia of r.comoFoi) linhas.push(`- ${fatia.rotulo}: ${numero(fatia.valor)}`);
  }

  if (r.itens.length) {
    linhas.push("", "Entrevistas do período:");
    for (const item of r.itens) {
      const partes = [item.candidatoNome, item.vagaCargo, item.situacao];
      if (typeof item.notaGeral === "number") partes.push(`${numero(item.notaGeral, 1)}/10`);
      if (item.decisao) partes.push(ROTULO_DECISAO[item.decisao]);
      linhas.push(`- ${partes.join(" · ")}`);
    }
  }

  return linhas.join("\n");
}

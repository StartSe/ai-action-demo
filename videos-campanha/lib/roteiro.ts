// Formatação do roteiro em texto puro (arquivo sem imports de node:*, usado pela tela e pelas páginas de servidor).
import { rotuloFormato, rotuloObjetivo, type Campanha, type Conceito } from "./types";

/** Um conceito como texto: título, efeito, cenas, chamada e legendas. */
export function conceitoEmTexto(c: Conceito, indice: number): string {
  const linhas = [`Conceito ${indice + 1}: ${c.titulo}`, `Efeito sugerido: ${c.efeitoSugerido}`, ""];
  c.roteiro.forEach((cena, i) => {
    linhas.push(`Cena ${i + 1} (${cena.segundos} s): ${cena.cena}`);
    linhas.push(`  Texto na tela: ${cena.textoNaTela}`);
  });
  linhas.push("", `Chamada: ${c.chamada}`, "", "Legenda para Instagram:", c.legenda.instagram, "", "Legenda para LinkedIn:", c.legenda.linkedin, "", "Legenda para TikTok:", c.legenda.tiktok);
  return linhas.join("\n");
}

/** A campanha inteira como texto, para copiar ou baixar. */
export function roteiroEmTexto(campanha: Campanha): string {
  const b = campanha.briefing;
  const cabecalho = [
    campanha.titulo,
    `Público: ${b.publico || "não informado"}`,
    `Objetivo: ${rotuloObjetivo(b.objetivo)} · Tom: ${b.tom || "não informado"}`,
    `Formato: ${rotuloFormato(b.formato)} · Duração: ${b.duracaoSeg} s`,
  ].join("\n");
  return [cabecalho, ...campanha.conceitos.map(conceitoEmTexto)].join("\n\n----------\n\n");
}

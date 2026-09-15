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

/** Redes para as quais existe legenda pronta em cada conceito. */
export type Rede = keyof Conceito["legenda"];

export const REDES: { rede: Rede; rotulo: string }[] = [
  { rede: "instagram", rotulo: "Instagram" },
  { rede: "linkedin", rotulo: "LinkedIn" },
  { rede: "tiktok", rotulo: "TikTok" },
];

/**
 * A legenda de uma rede para colar direto na publicação. Com um conceito escolhido (o que tem vídeo pronto), só a
 * legenda dele; sem escolha ainda, as legendas dos três conceitos, uma por bloco, para comparar.
 */
export function legendaEmTexto(campanha: Campanha, rede: Rede, escolhido?: Conceito): string {
  if (escolhido) return escolhido.legenda[rede];
  return campanha.conceitos.map((c, i) => `Conceito ${i + 1}: ${c.titulo}\n${c.legenda[rede]}`).join("\n\n");
}

/** Nome de arquivo seguro a partir do título ("Lançamento do Fone X" → "lancamento-do-fone-x"). */
export function nomeDeArquivo(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "campanha";
}

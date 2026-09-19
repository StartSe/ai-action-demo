// Nomes e descrição das fontes de busca, sem imports node:* (usado por app/page.tsx e por lib/radar.ts).
import type { EstadoFonte, IdFonteBusca } from "./types";

export const NOMES_FONTE: Record<IdFonteBusca, string> = {
  hackernews: "Hacker News",
  reddit: "Reddit",
  github: "GitHub",
  googlenews: "Google Notícias",
  exa: "Exa",
  grok: "Grok · X Search",
  tavily: "Tavily",
  brightdata: "Bright Data Search Engine",
  "brightdata-markdown": "Bright Data Markdown",
};

/** Fontes que trazem notícias em português (com chave): sem nenhuma delas, o radar convida a conectar uma. */
export const FONTES_COM_CHAVE: IdFonteBusca[] = ["exa", "tavily", "brightdata"];

/** "Hacker News, GitHub; Reddit indisponível" — as que respondem primeiro, depois as que falharam. Fontes sem chave ficam de fora. */
export function descreverFontes(fontes: EstadoFonte[]): string {
  const ok = fontes.filter((f) => f.estado === "ok").map((f) => f.nome);
  const fora = fontes.filter((f) => f.estado === "indisponivel").map((f) => f.nome);
  const recusadas = fontes.filter((f) => f.estado === "chave_recusada").map((f) => f.nome);
  const partes: string[] = [];
  if (ok.length > 0) partes.push(ok.join(", "));
  if (fora.length > 0) partes.push(`${fora.join(", ")} ${fora.length === 1 ? "indisponível" : "indisponíveis"}`);
  if (recusadas.length > 0) partes.push(`${recusadas.join(", ")} com chave recusada`);
  return partes.join("; ");
}

/** Lista curta em prosa: "Hacker News e GitHub", "Hacker News, GitHub e Exa". */
export function listarEmProsa(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

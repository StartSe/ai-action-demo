// Qualificação por evidências (US-017): compara os critérios pedidos numa busca com o texto lido da
// página institucional de uma empresa e devolve evidências + aderência (Fit) — primeira história a
// preencher isso de verdade (antes, todo Conta/LeadProspeccao nascia com fit:null/evidencias:[], ver
// fronteira documentada em lib/execucao-prospeccao.ts). "Critério sem dado NUNCA conta como atendido"
// (prd.json > regras): um termo não encontrado no texto vira "nao_verificavel", nunca "nao_atende" —
// não dá para afirmar com segurança que uma página institucional NÃO atende um critério só porque o
// termo não apareceu nela.
import type { Evidencia, Fit, SinalProspeccao } from "./types";

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function contemTermo(conteudo: string, termo: string): boolean {
  const t = termo.trim();
  if (!t) return false;
  return normalizar(conteudo).includes(normalizar(t));
}

/** Uma Evidencia por critério que tinha valor para checar (campo vazio não vira evidência nenhuma). */
export function avaliarCriterios(conteudo: string, criterios: { criterio: string; valor: string }[]): Evidencia[] {
  return criterios
    .filter((c) => c.valor.trim())
    .map((c): Evidencia => ({ criterio: c.criterio, valor: c.valor, resultado: contemTermo(conteudo, c.valor) ? "atende" : "nao_verificavel" }));
}

/** Nenhum critério verificável → "media" (não há base para julgar); todos atendem → "alta"; nenhum atende → "baixa"; caso misto → "media". */
export function calcularFit(evidencias: Evidencia[]): Fit {
  if (evidencias.length === 0) return "media";
  const atende = evidencias.filter((e) => e.resultado === "atende").length;
  if (atende === 0) return "baixa";
  if (atende === evidencias.length) return "alta";
  return "media";
}

/** Sinal sem fonte é descartado: só entra aqui quem já tem origem (a página lida) e data (a consulta de agora). */
export function sinaisEncontrados(conteudo: string, sinaisAlvo: string[], origem: string, consultadoEm: string): SinalProspeccao[] {
  return sinaisAlvo.filter((s) => contemTermo(conteudo, s)).map((s) => ({ descricao: s, data: consultadoEm, tipo: "sinal", origem }));
}

/** Resumo de até ~2 linhas a partir do markdown lido: primeira linha "de conteúdo" (sem título/marcação, com um tamanho mínimo para não pegar um item de menu). */
export function resumoDaPagina(conteudo: string): string {
  const linhas = conteudo
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").trim())
    .filter((l) => l.length > 25);
  const texto = linhas[0] || conteudo.replace(/\s+/g, " ").trim();
  return texto.length > 160 ? `${texto.slice(0, 157)}…` : texto;
}

/** Domínio (sem "www.") para unificar empresas repetidas entre consultas pelo site. */
export function dominioDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

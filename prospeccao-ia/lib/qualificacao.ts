// Qualificação por evidências (US-017): compara os critérios pedidos numa busca com o texto lido da
// página institucional de uma empresa e devolve evidências + aderência (Fit) — primeira história a
// preencher isso de verdade (antes, todo Conta/LeadProspeccao nascia com fit:null/evidencias:[], ver
// fronteira documentada em lib/execucao-prospeccao.ts). "Critério sem dado NUNCA conta como atendido"
// (prd.json > regras): um termo não encontrado no texto vira "nao_verificavel", nunca "nao_atende" —
// não dá para afirmar com segurança que uma página institucional NÃO atende um critério só porque o
// termo não apareceu nela.
import type { Evidencia, Fit, Papel, SinalProspeccao } from "./types";

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

const DATA_BR = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;

/** Data de um sinal (US-020): procura uma data no formato brasileiro perto do termo encontrado no
 * conteúdo (ex.: "Vaga publicada em 12/05/2026") — sem nenhuma data reconhecível ali perto, ou com uma
 * data no futuro (não confiável, provavelmente outra coisa no texto), cai na data da própria consulta. */
function dataDoSinal(conteudo: string, termo: string, consultadoEm: string): string {
  const idx = normalizar(conteudo).indexOf(normalizar(termo));
  if (idx === -1) return consultadoEm;
  const janela = conteudo.slice(Math.max(0, idx - 120), idx + termo.length + 120);
  const m = janela.match(DATA_BR);
  if (!m) return consultadoEm;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const encontrada = new Date(ano, Number(m[2]) - 1, Number(m[1]));
  if (Number.isNaN(encontrada.getTime()) || encontrada.getTime() > Date.now()) return consultadoEm;
  return encontrada.toISOString();
}

/** Sinal sem fonte é descartado: só entra aqui quem já tem origem (a página lida) e data (a data do
 * próprio sinal no texto quando existe; senão, a da consulta de agora, ver dataDoSinal). */
export function sinaisEncontrados(conteudo: string, sinaisAlvo: string[], origem: string, consultadoEm: string): SinalProspeccao[] {
  return sinaisAlvo.filter((s) => contemTermo(conteudo, s)).map((s) => ({ descricao: s, data: dataDoSinal(conteudo, s, consultadoEm), tipo: "sinal", origem }));
}

// Sinal com mais de 90 dias é "antigo" (US-020, prd.json > regras: "sinal com mais de 90 dias é marcado
// como antigo"). Calculado na LEITURA, nunca gravado (mesmo padrão de todo status derivado do tempo).
export const DIAS_SINAL_ANTIGO = 90;

export function sinalAntigo(sinal: SinalProspeccao): boolean {
  const dias = (Date.now() - new Date(sinal.data).getTime()) / (24 * 60 * 60 * 1000);
  return dias > DIAS_SINAL_ANTIGO;
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

const PALAVRAS_DECISOR = /diretor|presidente|\bceo\b|\bcoo\b|\bcto\b|vice-presidente|\bvp\b|s[oó]cio|fundador/i;
const PALAVRAS_INFLUENCIADOR = /gerente|coordenador|\bhead\b|supervisor/i;

/** Papel de uma pessoa no processo de decisão, a partir só do cargo (US-018, modo "Explorar uma
 * empresa"): heurística por palavra-chave, primeira implementação. "Champion" não é inferido daqui —
 * exige um sinal de proximidade com o produto que o cargo sozinho não dá. Derivação completa cruzando
 * as personas do ICP, e a edição manual preservada entre execuções, são da US-026 (ainda não existe). */
export function inferirPapel(cargo: string | null): Papel {
  if (!cargo) return "desconhecido";
  if (PALAVRAS_DECISOR.test(cargo)) return "decisor";
  if (PALAVRAS_INFLUENCIADOR.test(cargo)) return "influenciador";
  return "desconhecido";
}

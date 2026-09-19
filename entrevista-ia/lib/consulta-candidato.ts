import type { Candidato } from "./candidatos";
import type { CampoFicha, Ficha } from "./types";
export const LIMITE_CONSULTA = 200;
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
/** Campo da ficha que NÃO veio da web. O que a pesquisa anterior afirmou não pode guiar a busca
 * seguinte: seria o app confirmando a si mesmo, inclusive quando errou de pessoa. */
function doCurriculo(ficha: Ficha | undefined, nome: "empresaAtual" | "cargoAtual" | "cidade"): string {
  const campo = ficha?.[nome] as CampoFicha<string> | undefined;
  if (!campo || campo.origem === "web") return "";
  return typeof campo.valor === "string" ? campo.valor : "";
}

/**
 * A consulta da busca, na ordem de prioridade da PRD: nome completo, termo de busca do gestor,
 * empresa atual, cargo atual, cidade.
 *
 * Cada pedaço só entra se ainda não estiver dito: quem escreveu "Órbita Software" no termo de busca
 * não precisa da empresa do currículo repetida na mesma frase, e consulta comprida devolve menos
 * resultado, não mais.
 */
export function montarConsulta(candidato: Pick<Candidato, "nome" | "termoBusca" | "ficha" | "cidade">): string {
  if (candidato.termoBusca && normalizar(candidato.termoBusca).includes(normalizar(candidato.nome))) return candidato.termoBusca.trim().slice(0, LIMITE_CONSULTA);
  const partes: string[] = [];
  const somar = (valor?: string) => {
    const limpo = (valor ?? "").replace(/\s+/g, " ").trim();
    if (!limpo) return;
    if (normalizar(partes.join(" ")).includes(normalizar(limpo))) return;
    partes.push(limpo);
  };
  somar(candidato.nome);
  somar(candidato.termoBusca);
  somar(doCurriculo(candidato.ficha, "empresaAtual"));
  somar(doCurriculo(candidato.ficha, "cargoAtual"));
  somar(doCurriculo(candidato.ficha, "cidade") || candidato.cidade);
  return partes.join(" ").slice(0, LIMITE_CONSULTA).trim();
}


export type TermoPesquisa = { tipo: "nome" | "linkedin" | "cidade" | "empresa" | "chave"; valor: string };
export function sugerirTermos(c: Pick<Candidato, "nome" | "linkedinUrl" | "cidade" | "ficha" | "termoBusca">): TermoPesquisa[] {
  const termos: TermoPesquisa[] = [
    { tipo: "nome", valor: c.nome },
    { tipo: "linkedin", valor: c.linkedinUrl ?? "" },
    { tipo: "cidade", valor: doCurriculo(c.ficha, "cidade") || c.cidade || "" },
    { tipo: "empresa", valor: doCurriculo(c.ficha, "empresaAtual") },
    { tipo: "chave", valor: c.termoBusca ?? "" },
  ];
  return termos.filter((t, i) => t.valor.trim() && termos.findIndex((outro) => normalizar(outro.valor) === normalizar(t.valor)) === i);
}
export function validarTermos(valor: unknown): valor is TermoPesquisa[] {
  return Array.isArray(valor) && valor.length > 0 && valor.length <= 12 && valor.every((t) => {
    if (!t || typeof t !== "object" || !["nome", "linkedin", "cidade", "empresa", "chave"].includes(t.tipo) || typeof t.valor !== "string" || !t.valor.trim() || t.valor.length > 300) return false;
    if (t.tipo !== "linkedin") return true;
    try { const u = new URL(t.valor); return u.protocol === "https:" && /^(www\.)?linkedin\.com$/.test(u.hostname) && u.pathname.startsWith("/in/"); } catch { return false; }
  });
}
/** Começa com contexto completo e relaxa restrições quando faltam resultados. Nunca repõe tags removidas. */
export function combinarTermos(termos: TermoPesquisa[]): string[] {
  const nome = termos.filter((t) => t.tipo === "nome");
  const contexto = termos.filter((t) => t.tipo !== "nome" && t.tipo !== "linkedin");
  const grupos = [ [...nome, ...contexto], ...contexto.map((t) => [...nome, t]) ];
  const consultas = grupos.map((g) => g.map((t) => t.valor.replace(/["\r\n]/g, " ").trim()).join(" ").slice(0, LIMITE_CONSULTA)).filter(Boolean);
  return [...new Set(consultas)].slice(0, 3);
}

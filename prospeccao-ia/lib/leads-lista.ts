import type { Fit, LeadProspeccao } from "./types";
import { ordenarLeadsPorPrioridade } from "./qualificacao";

export type LeadDaLista = LeadProspeccao & { prospeccaoNome: string; site: string | null; temAbordagem?: boolean };
export type AbaLeads = "todos" | "novos" | "abordados" | "responderam";
export type OrdemLeads = "prioridade" | "atualizados" | "nome";
export const ABAS_LEADS = [{ chave: "todos", rotulo: "Todos" }, { chave: "novos", rotulo: "Novos" }, { chave: "abordados", rotulo: "Abordados" }, { chave: "responderam", rotulo: "Responderam" }] as const;
export const lerAba = (v: string | null): AbaLeads => ABAS_LEADS.some(a => a.chave === v) ? v as AbaLeads : "todos";
export const lerFit = (v: string | null): Fit | "" => v === "alta" || v === "media" || v === "baixa" ? v : "";
export const lerOrdem = (v: string | null): OrdemLeads => v === "atualizados" || v === "nome" ? v : "prioridade";
export const textoBusca = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function naAba(l: LeadProspeccao, aba: AbaLeads) {
  return aba === "todos" || (aba === "novos" ? l.status === "novo" : aba === "responderam" ? l.status === "respondeu" : ["abordado", "respondeu"].includes(l.status));
}
export function filtrarLeads(leads: LeadDaLista[], f: { aba: AbaLeads; prospeccaoId: string; fit: Fit | ""; busca: string; ordem: OrdemLeads }) {
  const termos = textoBusca(f.busca).split(/\s+/).filter(Boolean);
  const lista = leads.filter(l => naAba(l, f.aba) && (!f.prospeccaoId || l.prospeccaoId === f.prospeccaoId) && (!f.fit || l.fit === f.fit)
    && termos.every(t => textoBusca([l.nome, l.cargo, l.empresa, l.cidade, l.prospeccaoNome].filter(Boolean).join(" ")).includes(t)));
  if (f.ordem === "nome") return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (f.ordem === "atualizados") return lista.sort((a, b) => Date.parse(b.pesquisadoEm || b.atualizadoEm) - Date.parse(a.pesquisadoEm || a.atualizadoEm));
  return ordenarLeadsPorPrioridade(lista) as LeadDaLista[];
}
export function nomeCurto(texto: string, tamanho = 76) { return texto.length <= tamanho ? texto : `${texto.slice(0, tamanho - 1).trim()}…`; }

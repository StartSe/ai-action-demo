import type { IdFonteBusca } from "./types";

export const COLETORES: { id: IdFonteBusca; nome: string; descricao: string; chave?: string }[] = [
  { id: "startse", nome: "StartSe · Artigos", descricao: "Artigos sobre negócios, inovação e tecnologia" },
  { id: "googlenews", nome: "Google Notícias", descricao: "Notícias recentes em português" },
  { id: "hackernews", nome: "Hacker News", descricao: "Discussões e adoção entre desenvolvedores" },
  { id: "reddit", nome: "Reddit", descricao: "Dores, opiniões e comunidades" },
  { id: "github", nome: "GitHub", descricao: "Projetos novos e sinais de adoção" },
  { id: "searchapi", nome: "SearchAPI", descricao: "Pesquisa Google com recorte por período e site", chave: "SEARCHAPI_API_KEY" },
  { id: "exa", nome: "Exa", descricao: "Busca semântica e conteúdo da web", chave: "EXA_API_KEY" },
  { id: "tavily", nome: "Tavily", descricao: "Notícias com trechos para análise", chave: "TAVILY_API_KEY" },
  { id: "brightdata", nome: "Bright Data", descricao: "Busca e leitura aprofundada de páginas", chave: "BRIGHTDATA_API_TOKEN" },
  { id: "grok", nome: "Grok · X Search", descricao: "Conversas recentes no X, com citações", chave: "XAI_API_KEY" },
];
export type TermoPesquisa = { termo: string; categoria: string; ativo: boolean };
export type FontePesquisa = { url: string; nome: string; ativa: boolean };
export type PaginaMonitorada = { url: string; nome: string; ativa: boolean; provedor: "brightdata" | "firecrawl" };
export type Pesquisa = { acompanhamento?: boolean; paginas?: PaginaMonitorada[]; termos: TermoPesquisa[]; fontes: FontePesquisa[]; provedores: IdFonteBusca[]; periodoDias: number; setor: string };
export const PESQUISA_PADRAO: Pesquisa = { acompanhamento: true, termos: [], paginas: [], fontes: [{ url: "https://www.startse.com/artigos", nome: "StartSe · Artigos", ativa: true }], provedores: COLETORES.map(p => p.id), periodoDias: 30, setor: "" };

export function normalizarSite(valor: string): string {
  const u = new URL(/^https?:\/\//i.test(valor) ? valor : `https://${valor}`);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port || !u.hostname.includes(".") || /[\s"'()]/.test(valor) || /^(\d|localhost)/.test(u.hostname) || /\.(local|internal|test)$/.test(u.hostname)) throw new Error("Informe um site público, como empresa.com/blog.");
  u.search = ""; u.hash = "";
  return u.toString().replace(/\/$/, "");
}
export function normalizarPagina(valor: string): string {
  const url = new URL(/^https?:\/\//i.test(valor) ? valor : `https://${valor}`);
  normalizarSite(valor);
  url.hash = "";
  return url.toString();
}
export function pertenceAoSite(url: string, site: string): boolean {
  try {
    const a = new URL(url), b = new URL(site);
    const host = (s: string) => s.toLowerCase().replace(/^www\./, "");
    const caminho = b.pathname.replace(/\/$/, "");
    return (host(a.hostname) === host(b.hostname) || host(a.hostname).endsWith(`.${host(b.hostname)}`)) && (!caminho || a.pathname === caminho || a.pathname.startsWith(`${caminho}/`));
  } catch { return false; }
}
export function validarPesquisa(valor: unknown): Pesquisa {
  if (!valor || typeof valor !== "object") throw new Error("Configuração inválida.");
  const v = valor as Pesquisa;
  if (!Array.isArray(v.termos) || v.termos.length > 12 || v.termos.some(t => !t || typeof t.termo !== "string" || !t.termo.trim() || t.termo.length > 200 || typeof t.categoria !== "string" || t.categoria.length > 60 || typeof t.ativo !== "boolean")) throw new Error("Cadastre até 12 termos de até 200 caracteres.");
  if (!Array.isArray(v.fontes) || v.fontes.length > 6 || v.fontes.some(f => !f || typeof f.url !== "string" || f.url.length > 500 || typeof f.nome !== "string" || f.nome.length > 100 || typeof f.ativa !== "boolean")) throw new Error("Cadastre até 6 sites de referência.");
  if (!Array.isArray(v.provedores) || !v.provedores.length || v.provedores.some(p => !COLETORES.some(c => c.id === p))) throw new Error("Selecione ao menos um buscador.");
  if (![7, 30, 90].includes(v.periodoDias) || typeof v.setor !== "string" || v.setor.length > 200) throw new Error("Período ou setor inválido.");
  if (v.acompanhamento !== undefined && typeof v.acompanhamento !== "boolean") throw new Error("Acompanhamento inválido.");
  const paginas = v.paginas ?? [];
  if (!Array.isArray(paginas) || paginas.length > 8 || paginas.some(f => !f || typeof f.url !== "string" || f.url.length > 1500 || typeof f.nome !== "string" || f.nome.length > 100 || typeof f.ativa !== "boolean" || !["brightdata", "firecrawl"].includes(f.provedor))) throw new Error("Cadastre até 8 páginas com Bright Data ou Firecrawl.");
  return { acompanhamento: v.acompanhamento ?? true, paginas: [...new Map(paginas.map(f => { const url = normalizarPagina(f.url); return [url, { ...f, url, nome: f.nome.trim() || new URL(url).hostname }] as const; })).values()], termos: [...new Map(v.termos.map(t => [t.termo.trim().toLowerCase(), { ...t, termo: t.termo.trim(), categoria: t.categoria.trim() }])).values()], fontes: [...new Map(v.fontes.map(f => { const url = normalizarSite(f.url); return [url, { ...f, url, nome: f.nome.trim() || new URL(url).hostname }] as const; })).values()], provedores: [...new Set(v.provedores)], periodoDias: v.periodoDias, setor: v.setor.trim() };
}

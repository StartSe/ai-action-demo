import { getConfig } from "./store";
import { normalizarPagina, type PaginaMonitorada } from "./pesquisa";
import { scrapeBrightData } from "./brightdata";
import type { Achado } from "./busca";
import type { EstadoFonte } from "./types";

export async function scrapeFirecrawl(url: string, chave = getConfig("FIRECRAWL_API_KEY")): Promise<string> {
  if (!chave) throw new Error("Conecte o Firecrawl em Configurações.");
  const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: normalizarPagina(url), formats: ["markdown"], onlyMainContent: true, maxAge: 0 }), signal: AbortSignal.timeout(65000),
  });
  if (!r.ok) throw new Error("Firecrawl não conseguiu ler a página. Confira a chave e a cota.");
  const v = await r.json();
  if (!v.success || typeof v.data?.markdown !== "string" || !v.data.markdown.trim() || Number(v.data?.metadata?.statusCode || 200) >= 400) throw new Error("O Firecrawl não retornou conteúdo para esta página.");
  return v.data.markdown.slice(0, 12000);
}
export async function coletarPaginas(paginas: PaginaMonitorada[], aoResponder?: (nome: string) => void) {
  const achados: Achado[] = [], fontes: EstadoFonte[] = [], avisos: string[] = [];
  const ativas = paginas.filter(p => p.ativa);
  // Sem cache: cada rodada consulta o estado atual das páginas cadastradas.
  for (let i = 0; i < ativas.length; i += 3) await Promise.all(ativas.slice(i, i + 3).map(async pagina => {
    const id = pagina.provedor === "firecrawl" ? "firecrawl" : "brightdata-markdown";
    const nome = pagina.provedor === "firecrawl" ? "Firecrawl" : "Bright Data Markdown";
    const chave = getConfig(pagina.provedor === "firecrawl" ? "FIRECRAWL_API_KEY" : "BRIGHTDATA_API_TOKEN");
    if (!chave) { fontes.push({ id, nome, estado: "sem_chave" }); avisos.push(`Conecte ${nome} para monitorar ${pagina.url}.`); return; }
    try {
      const url = normalizarPagina(pagina.url);
      const markdown = pagina.provedor === "firecrawl" ? await scrapeFirecrawl(url) : await scrapeBrightData(url);
      achados.push({ titulo: pagina.nome || url, url, veiculo: new URL(url).hostname, publicadoEm: "", trecho: markdown.slice(0, 12000), pontuacao: 100, fonte: id });
      fontes.push({ id, nome, estado: "ok", coletadoEm: new Date().toISOString() }); aoResponder?.(nome);
    } catch { fontes.push({ id, nome, estado: "indisponivel" }); avisos.push(`Não foi possível ler ${pagina.url} com ${nome}. Confira a página e a conexão.`); }
  }));
  return { achados, fontes, avisos };
}

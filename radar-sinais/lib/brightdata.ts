import { chamar, conectar, listarFerramentas, type ConexaoMCP } from "./mcp-cliente";
import { normalizarPagina } from "./pesquisa";
import { getConfig } from "./store";
import type { Achado } from "./busca";

export function urlBrightData(token: string): string {
  const url = new URL("https://mcp.brightdata.com/mcp");
  url.searchParams.set("token", token);
  url.searchParams.set("pro", "1");
  return url.toString();
}
let atual: ConexaoMCP | undefined;
function cliente(token: string): ConexaoMCP {
  const url = urlBrightData(token);
  if (atual?.url !== url) atual = conectar(url);
  return atual;
}
export function brightDataConectada(): boolean { return Boolean(getConfig("BRIGHTDATA_API_TOKEN")); }

export async function testarBrightData(config: Record<string, string | undefined>) {
  const token = config.BRIGHTDATA_API_TOKEN;
  if (!token) return { ok: false, mensagem: "Cole o token da Bright Data." };
  try {
    const nomes = (await listarFerramentas(cliente(token))).map(f => f.nome);
    const faltam = ["search_engine", "scrape_as_markdown"].filter(n => !nomes.includes(n));
    return { ok: !faltam.length, mensagem: faltam.length ? `Ferramentas indisponíveis: ${faltam.join(", ")}. Confira as permissões da conta.` : "Search Engine e Scraper as Markdown conectados (MCP HTTP, pro=1)." };
  } catch { return { ok: false, mensagem: "Não foi possível conectar à Bright Data. Confira o token, a cota e as permissões." }; }
}

/** Só URLs públicas HTTP(S) retornadas pela busca podem seguir para o scraper. */
export function urlPublica(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  try { normalizarPagina(valor); return true; } catch { return false; }
}

export async function buscarBrightData(consulta: string, dias: number): Promise<Achado[]> {
  const token = getConfig("BRIGHTDATA_API_TOKEN");
  if (!token) return [];
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  // Falhas são traduzidas antes de chegarem ao log: a URL MCP contém o token.
  try {
    const resultado = await chamar(cliente(token), "search_engine", { query: `${consulta} after:${desde}`, engine: "google" }) as { organic?: { title?: string; link?: string; url?: string; description?: string; snippet?: string }[] };
    if (!Array.isArray(resultado?.organic)) throw new Error("Formato de busca inesperado");
    return resultado.organic.slice(0, 12).flatMap(r => {
      const url = r.link ?? r.url;
      if (!urlPublica(url)) return [];
      return [{ titulo: r.title || url, url, trecho: (r.description || r.snippet || "").slice(0, 1000), veiculo: new URL(url).hostname, publicadoEm: "", pontuacao: 4, fonte: "brightdata" as const }];
    });
  } catch { throw new Error("Bright Data Search Engine indisponível. Confira token, cota e permissões em Configurações."); }
}

export async function scrapeBrightData(url: string): Promise<string> {
  const token = getConfig("BRIGHTDATA_API_TOKEN");
  if (!token) throw new Error("Conecte a Bright Data.");
  try {
    const markdown = await chamar(cliente(token), "scrape_as_markdown", { url: normalizarPagina(url) });
    if (typeof markdown !== "string" || !markdown.trim()) throw new Error("Página vazia");
    return markdown.slice(0, 12000);
  } catch { throw new Error("A Bright Data não conseguiu ler esta página."); }
}

/** Enriquece no máximo quatro achados por radar, inclusive de Exa/Tavily; falhas não descartam a busca. */
export async function enriquecerMarkdown(achados: Achado[]): Promise<{ achados: Achado[]; falhou: boolean }> {
  const token = getConfig("BRIGHTDATA_API_TOKEN");
  if (!token || !achados.length) return { achados, falhou: false };
  const escolhidos = achados.filter(a => urlPublica(a.url) && a.fonte !== "firecrawl" && a.fonte !== "brightdata-markdown").slice(0, 4);
  let falhou = false;
  const trechos = new Map<string, string>();
  await Promise.all(escolhidos.map(async a => {
    try {
      const markdown = await chamar(cliente(token), "scrape_as_markdown", { url: a.url });
      if (typeof markdown !== "string" || !markdown.trim()) throw new Error("Página vazia");
      trechos.set(a.url, markdown.slice(0, 6000));
    } catch { falhou = true; }
  }));
  return { achados: achados.map(a => ({ ...a, trecho: trechos.get(a.url) || a.trecho })), falhou };
}

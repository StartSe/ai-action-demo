// Adaptadores das fontes opcionais. Nunca devolvem conteúdo de erro nem credenciais do provedor.
import { getConfig } from "./store";
export type FonteOpcional = "exa" | "tavily" | "searchapi";
export type ItemPesquisa = { titulo: string; url: string; resumo: string };
export const FONTES = { exa: "Exa", tavily: "Tavily", searchapi: "SearchAPI" } as const;
export const CHAVES = { exa: "EXA_API_KEY", tavily: "TAVILY_API_KEY", searchapi: "SEARCHAPI_API_KEY" } as const;
export class ErroFonte extends Error {
  constructor(public fonte: string, public codigo: "chave_recusada" | "limite_do_plano" | "servico_fora" | "resposta_invalida", mensagem: string) { super(mensagem); }
}
export function fontesOpcionais(): FonteOpcional[] {
  return (Object.keys(FONTES) as FonteOpcional[]).filter(f => getConfig(CHAVES[f])?.trim());
}
async function requisitar(fonte: FonteOpcional, url: string, body?: Record<string, unknown>, chave = getConfig(CHAVES[fonte])): Promise<Record<string, unknown>> {
  const nome = FONTES[fonte];
  if (!chave?.trim()) throw new ErroFonte(nome, "chave_recusada", `Conecte ${nome} em Configurações.`);
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(fonte === "exa" ? 90_000 : 45_000),
      headers: { "Content-Type": "application/json", ...(fonte === "exa" ? { "x-api-key": chave.trim() } : { Authorization: `Bearer ${chave.trim()}` }) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new ErroFonte(nome, "servico_fora", `${nome} não respondeu a tempo. Tente novamente ou confira a conexão.`); }
  if ([401, 403].includes(resposta.status)) throw new ErroFonte(nome, "chave_recusada", `${nome} recusou a chave. Confira a conexão em Configurações.`);
  if ([402, 429, 432, 433].includes(resposta.status)) throw new ErroFonte(nome, "limite_do_plano", `${nome} atingiu o limite de uso ou saldo da conta.`);
  if (!resposta.ok) throw new ErroFonte(nome, "servico_fora", `${nome} não conseguiu concluir a consulta. Confira a conexão e tente novamente.`);
  try {
    const json = await resposta.json();
    if (!json || typeof json !== "object" || Array.isArray(json) || json.error) throw new Error();
    return json;
  } catch { throw new ErroFonte(nome, "resposta_invalida", `${nome} devolveu uma resposta que não foi possível ler.`); }
}
function itensDe(fonte: FonteOpcional, dados: Record<string, unknown>): ItemPesquisa[] {
  const lista = fonte === "searchapi" ? dados.organic_results : dados.results;
  if (!Array.isArray(lista)) {
    // SearchAPI representa uma SERP válida sem resultados sem organic_results.
    if (fonte === "searchapi" && dados.search_information && dados.search_metadata) return [];
    throw new ErroFonte(FONTES[fonte], "resposta_invalida", `${FONTES[fonte]} devolveu resultados em formato inesperado.`);
  }
  const vistos = new Set<string>();
  const itens = lista.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const link = fonte === "searchapi" ? item.link : item.url;
    if (typeof link !== "string") return [];
    let url: URL;
    try { url = new URL(link); } catch { return []; }
    if (!["https:", "http:"].includes(url.protocol)) return [];
    url.hash = "";
    if (vistos.has(url.href)) return [];
    vistos.add(url.href);
    const resumo = item.text || item.raw_content || item.content || item.snippet || (Array.isArray(item.highlights) ? item.highlights.join("\n") : "");
    return [{ titulo: typeof item.title === "string" ? item.title : url.hostname, url: url.href, resumo: typeof resumo === "string" ? resumo.slice(0, 8000) : "" }];
  });
  if (lista.length && !itens.length) throw new ErroFonte(FONTES[fonte], "resposta_invalida", `${FONTES[fonte]} não trouxe endereços válidos nos resultados.`);
  return itens;
}
export async function buscarFonte(fonte: FonteOpcional, consulta: string, pagina = 0, config?: Record<string, string | undefined>): Promise<ItemPesquisa[]> {
  const chave = config?.[CHAVES[fonte]] ?? getConfig(CHAVES[fonte]);
  if (fonte === "searchapi") {
    const url = new URL("https://www.searchapi.io/api/v1/search");
    url.search = new URLSearchParams({ engine: "google", q: consulta, page: String(pagina + 1) }).toString();
    return itensDe(fonte, await requisitar(fonte, url.href, undefined, chave));
  }
  // Exa/Tavily não têm cursor equivalente ao Google; pedimos um lote limitado e recortamos páginas.
  if ((fonte === "tavily" && pagina >= 2) || pagina >= 5) return [];
  const dominio = /site:([^\s]+)/i.exec(consulta)?.[1];
  const query = consulta.replace(/site:[^\s]+/gi, "").trim();
  if (fonte === "exa") {
    const tipo = config?.EXA_TIPO_BUSCA ?? getConfig("EXA_TIPO_BUSCA") ?? "deep";
    const body = { query, type: ["auto", "deep-lite", "deep", "deep-reasoning"].includes(tipo) ? tipo : "deep", numResults: Math.min(50, (pagina + 1) * 10), contents: { text: { maxCharacters: 8000 } }, ...(dominio ? { includeDomains: [dominio] } : {}) };
    return itensDe(fonte, await requisitar(fonte, "https://api.exa.ai/search", body, chave)).slice(pagina * 10, (pagina + 1) * 10);
  }
  const profundidade = config?.TAVILY_PROFUNDIDADE ?? getConfig("TAVILY_PROFUNDIDADE");
  return itensDe(fonte, await requisitar(fonte, "https://api.tavily.com/search", {
    query, search_depth: profundidade === "basic" ? "basic" : "advanced", max_results: 20, include_answer: false, include_raw_content: "markdown",
    ...(dominio ? { include_domains: [dominio.split("/")[0]] } : {}),
  }, chave)).slice(pagina * 10, (pagina + 1) * 10);
}
export async function lerFonte(fonte: "exa" | "tavily", url: string): Promise<string> {
  const dados = fonte === "exa"
    ? await requisitar(fonte, "https://api.exa.ai/contents", { urls: [url], text: { maxCharacters: 8000 } })
    : await requisitar(fonte, "https://api.tavily.com/extract", { urls: [url], extract_depth: "advanced", format: "markdown" });
  const texto = itensDe(fonte, dados)[0]?.resumo;
  if (!texto) throw new ErroFonte(FONTES[fonte], "resposta_invalida", `${FONTES[fonte]} não conseguiu ler essa página.`);
  return texto;
}
export async function testarFonte(fonte: FonteOpcional, config: Record<string, string | undefined>) {
  try {
    await buscarFonte(fonte, "StartSe educação executiva", 0, config);
    return { ok: true, mensagem: `${FONTES[fonte]} conectado. A consulta de teste foi concluída.` };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof ErroFonte ? erro.message : `Não foi possível testar ${FONTES[fonte]}.` };
  }
}

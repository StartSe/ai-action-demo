import { consultarSearchAPI, ChaveSearchAPIRecusada } from "./searchapi";
import { buscarComCache } from "./cache-busca";
import { COLETORES } from "./pesquisa";
import { buscarGrok } from "./grok";
import { pertenceAoSite } from "./pesquisa";
import { brightDataConectada, buscarBrightData } from "./brightdata";
// Motor de busca em fontes reais para o radar de sinais. Sem chave: Hacker News, Reddit, GitHub e Google Notícias
// (consulta em português do Brasil). Com chave: Exa ou Tavily (notícias em português e web em geral, com trechos).
// Reaproveitado por lib/radar.ts, que substitui o "melhor esforço" da IA por achados reais.
import { NOMES_FONTE } from "./fontes";
import { getConfig } from "./store";
import type { EstadoFonte, IdFonteBusca } from "./types";

export interface Achado {
  titulo: string;
  url: string;
  trecho: string;
  veiculo: string;
  /** Data de publicação (ISO 8601). */
  publicadoEm: string;
  /** Combina engajamento (pontos, comentários, estrelas...) e recência; maior é mais relevante. */
  pontuacao: number;
  fonte: IdFonteBusca;
}

/** Lançado quando nenhum provedor conseguiu responder, para a rota HTTP que chamar buscar() devolver 502 em vez de 500. A mensagem já é a frase da tela. */
export class ErroBusca extends Error {}

/** Um provedor com chave recusou a chave (401/403): vira aviso na tela, nunca falha silenciosa. */
class ChaveRecusada extends Error {}

/** Bloqueio conhecido: mantém a fonte indisponível sem repetir erros no console. */
class RedditBloqueado extends Error {}

interface Provedor {
  id: IdFonteBusca;
  /** Precisa de uma chave em /setup (Exa, Tavily). */
  comChave: boolean;
  disponivel(): boolean;
  buscar(consulta: string, dias: number): Promise<Achado[]>;
}

const USER_AGENT = "radar-sinais/1.0 (app interno de radar de mercado)";
const TEMPO_LIMITE_MS = 12_000;

/** Pontuação simples: engajamento normalizado (log para não deixar um outlier dominar) menos uma penalidade por idade. */
function pontuar(engajamento: number, publicadoEm: string, diasDoPeriodo: number): number {
  if (!publicadoEm || !Number.isFinite(Date.parse(publicadoEm))) return Math.log10(Math.max(0, engajamento) + 1) * 10;
  const idadeDias = Math.max(0, (Date.now() - new Date(publicadoEm).getTime()) / 86_400_000);
  const recencia = Math.max(0, 1 - idadeDias / Math.max(1, diasDoPeriodo));
  return Math.log10(engajamento + 1) * 10 + recencia * 5;
}

function cortarTrecho(texto: string | undefined | null, tamanho = 280): string {
  if (!texto) return "";
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > tamanho ? `${limpo.slice(0, tamanho)}…` : limpo;
}

/** Erro interno de um provedor: só vai ao console.error (a tela nunca vê status HTTP cru). */
function falhaHttp(provedor: IdFonteBusca, r: Response): Error {
  return new Error(`${NOMES_FONTE[provedor]} não respondeu (status ${r.status})`);
}

const HACKERNEWS: Provedor = {
  id: "hackernews",
  comChave: false,
  disponivel: () => true,
  async buscar(consulta, dias) {
    const desde = Math.floor((Date.now() - dias * 86_400_000) / 1000);
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(consulta)}&tags=story&numericFilters=created_at_i%3E${desde}&hitsPerPage=30`;
    const r = await fetch(url, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!r.ok) throw falhaHttp("hackernews", r);
    const data = (await r.json()) as { hits?: { title?: string; url?: string; story_text?: string; points?: number; num_comments?: number; created_at?: string; objectID: string }[] };
    return (data.hits || [])
      .filter((h) => h.title)
      .map((h) => {
        const publicadoEm = dataPublicacao(h.created_at);
        const engajamento = (h.points ?? 0) + (h.num_comments ?? 0);
        return {
          titulo: h.title!,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          trecho: cortarTrecho(h.story_text),
          veiculo: "Hacker News",
          publicadoEm,
          pontuacao: pontuar(engajamento, publicadoEm, dias),
          fonte: "hackernews" as const,
        };
      });
  },
};

let ultimaChamadaReddit = 0;
let redditBloqueadoAte = 0;
const PAUSA_REDDIT_MS = 15 * 60_000;

/** Espaça as consultas ao Reddit, inclusive quando várias buscas começam juntas. */
async function respeitarLimiteReddit(): Promise<void> {
  const agora = Date.now();
  ultimaChamadaReddit = Math.max(ultimaChamadaReddit + 1000, agora);
  const espera = ultimaChamadaReddit - agora;
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}

const REDDIT: Provedor = {
  id: "reddit",
  comChave: false,
  disponivel: () => true,
  async buscar(consulta, dias) {
    if (Date.now() < redditBloqueadoAte) throw new RedditBloqueado();
    await respeitarLimiteReddit();
    if (Date.now() < redditBloqueadoAte) throw new RedditBloqueado();
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(consulta)}&sort=new&limit=30&t=${dias <= 7 ? "week" : dias <= 30 ? "month" : "year"}`;
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (r.status === 403) {
      if (Date.now() >= redditBloqueadoAte) {
        console.warn("Reddit recusou o acesso público (HTTP 403). Fonte indisponível; nova tentativa em 15 minutos. As demais fontes continuam funcionando.");
      }
      redditBloqueadoAte = Date.now() + PAUSA_REDDIT_MS;
      throw new RedditBloqueado();
    }
    if (!r.ok) throw falhaHttp("reddit", r);
    const data = (await r.json()) as { data?: { children?: { data: { title: string; selftext?: string; url?: string; permalink: string; subreddit: string; created_utc: number; score?: number; num_comments?: number } }[] } };
    const corte = Date.now() - dias * 86_400_000;
    return (data.data?.children || [])
      .map((c) => c.data)
      .filter((d) => d.created_utc * 1000 >= corte)
      .map((d) => {
        const publicadoEm = new Date(d.created_utc * 1000).toISOString();
        const engajamento = (d.score ?? 0) + (d.num_comments ?? 0);
        return {
          titulo: d.title,
          url: `https://www.reddit.com${d.permalink}`,
          trecho: cortarTrecho(d.selftext),
          veiculo: `r/${d.subreddit}`,
          publicadoEm,
          pontuacao: pontuar(engajamento, publicadoEm, dias),
          fonte: "reddit" as const,
        };
      });
  },
};

const GITHUB: Provedor = {
  id: "github",
  comChave: false,
  disponivel: () => true,
  async buscar(consulta, dias) {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(consulta)}+created:>=${desde}&sort=stars&order=desc&per_page=30`;
    const r = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!r.ok) throw falhaHttp("github", r);
    const data = (await r.json()) as { items?: { full_name: string; html_url: string; description?: string; created_at: string; stargazers_count?: number }[] };
    return (data.items || []).map((i) => ({
      titulo: i.full_name,
      url: i.html_url,
      trecho: cortarTrecho(i.description),
      veiculo: "GitHub",
      publicadoEm: i.created_at,
      pontuacao: pontuar(i.stargazers_count ?? 0, i.created_at, dias),
      fonte: "github" as const,
    }));
  },
};

/** Lê um campo simples de um <item> de RSS (com ou sem CDATA), sem biblioteca de XML. */
function campoRss(item: string, nome: string): string {
  const m = item.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i"));
  if (!m) return "";
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
}

function decodificarHtml(texto: string): string {
  return texto
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Google Notícias (RSS público, consulta em português do Brasil): a fonte de notícias em português que funciona sem chave. */
const GOOGLENEWS: Provedor = {
  id: "googlenews",
  comChave: false,
  disponivel: () => true,
  async buscar(consulta, dias) {
    const q = encodeURIComponent(`${consulta} when:${dias}d`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    if (!r.ok) throw falhaHttp("googlenews", r);
    const xml = await r.text();
    const itens = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const corte = Date.now() - dias * 86_400_000;
    return itens
      .map((item) => {
        const veiculo = decodificarHtml(campoRss(item, "source")) || "Google Notícias";
        const tituloBruto = decodificarHtml(campoRss(item, "title"));
        // O título do RSS vem como "Manchete - Veículo": tira o sufixo quando bate com a fonte.
        const titulo = tituloBruto.endsWith(` - ${veiculo}`) ? tituloBruto.slice(0, -(veiculo.length + 3)).trim() : tituloBruto;
        const link = campoRss(item, "link");
        const publicadoEm = dataPublicacao(campoRss(item, "pubDate"));
        return { titulo, link, veiculo, publicadoEm, descricao: decodificarHtml(campoRss(item, "description")) };
      })
      .filter((i) => i.titulo && i.link && new Date(i.publicadoEm).getTime() >= corte)
      .slice(0, 30)
      .map((i) => ({
        titulo: i.titulo,
        url: i.link,
        trecho: cortarTrecho(i.descricao === i.titulo ? "" : i.descricao),
        veiculo: i.veiculo,
        publicadoEm: i.publicadoEm,
        // O RSS não traz engajamento: uma base fixa deixa a recência decidir entre as notícias.
        pontuacao: pontuar(3, i.publicadoEm, dias),
        fonte: "googlenews" as const,
      }));
  },
};

function exaApiKey(): string | undefined {
  return getConfig("EXA_API_KEY");
}

function tavilyApiKey(): string | undefined {
  return getConfig("TAVILY_API_KEY");
}

/** Alguma fonte com chave (Exa ou Tavily) está conectada. */
export function buscaWebConectada(): boolean {
  return Boolean(exaApiKey() || tavilyApiKey() || brightDataConectada() || getConfig("SEARCHAPI_API_KEY"));
}

function veiculoDaUrl(url: string, padrao: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return padrao;
  }
}

const EXA: Provedor = {
  id: "exa",
  comChave: true,
  disponivel: () => Boolean(exaApiKey()),
  async buscar(consulta, dias) {
    const startPublishedDate = new Date(Date.now() - dias * 86_400_000).toISOString();
    const r = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": exaApiKey()! },
      body: JSON.stringify({ query: consulta, startPublishedDate, numResults: 20, contents: { highlights: {} } }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (r.status === 401 || r.status === 403) throw new ChaveRecusada("A Exa recusou a chave.");
    if (!r.ok) throw falhaHttp("exa", r);
    const data = (await r.json()) as { results?: { title?: string; url: string; publishedDate?: string; score?: number; highlights?: string[] }[] };
    return (data.results || []).map((res) => {
      const publicadoEm = dataPublicacao(res.publishedDate);
      return {
        titulo: res.title || res.url,
        url: res.url,
        trecho: cortarTrecho(res.highlights?.join(" ")),
        veiculo: veiculoDaUrl(res.url, "Exa"),
        publicadoEm,
        pontuacao: pontuar((res.score ?? 0) * 100, publicadoEm, dias),
        fonte: "exa" as const,
      };
    });
  },
};

/** Tavily: alternativa à Exa (mesmo cartão em /setup), busca de notícias com trecho por página. */
const TAVILY: Provedor = {
  id: "tavily",
  comChave: true,
  disponivel: () => Boolean(tavilyApiKey()),
  async buscar(consulta, dias) {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tavilyApiKey()!}` },
      body: JSON.stringify({ query: consulta, topic: "news", days: dias, max_results: 20, search_depth: "basic" }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (r.status === 401 || r.status === 403) throw new ChaveRecusada("A Tavily recusou a chave.");
    if (!r.ok) throw falhaHttp("tavily", r);
    const data = (await r.json()) as { results?: { title?: string; url: string; content?: string; score?: number; published_date?: string }[] };
    return (data.results || []).map((res) => {
      const publicadoEm = dataPublicacao(res.published_date);
      return {
        titulo: res.title || res.url,
        url: res.url,
        trecho: cortarTrecho(res.content),
        veiculo: veiculoDaUrl(res.url, "Tavily"),
        publicadoEm,
        pontuacao: pontuar((res.score ?? 0) * 100, publicadoEm, dias),
        fonte: "tavily" as const,
      };
    });
  },
};

/** Ordem de consulta e de exibição. Fontes sem chave primeiro; as com chave só entram quando conectadas. */
const STARTSE: Provedor = {
  id: "startse", comChave: false, disponivel: () => true,
  async buscar(consulta, dias) {
    const resultados = await GOOGLENEWS.buscar(`${consulta} site:startse.com/artigos`, dias);
    return resultados.filter(a => /startse/i.test(a.veiculo)).map(a => ({ ...a, fonte: "startse" as const }));
  },
};
const PROVEDORES: Provedor[] = [STARTSE, { id: "searchapi", comChave: true, disponivel: () => Boolean(getConfig("SEARCHAPI_API_KEY")), buscar: consultarSearchAPI }, { id: "grok", comChave: true, disponivel: () => Boolean(getConfig("XAI_API_KEY")), buscar: buscarGrok }, HACKERNEWS, REDDIT, GITHUB, GOOGLENEWS, EXA, TAVILY, { id: "brightdata", comChave: true, disponivel: brightDataConectada, buscar: buscarBrightData }];

/** Mantém parâmetros que identificam documentos; remove apenas rastreamento. */
export function normalizarUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const chave of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(chave)) u.searchParams.delete(chave);
    u.searchParams.sort();
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch { return url.trim(); }
}
export function dataPublicacao(valor?: string): string {
  if (!valor) return "";
  const instante = Date.parse(valor);
  return Number.isFinite(instante) ? new Date(instante).toISOString() : "";
}
export function filtrarPeriodo(achados: Achado[], dias: number, agora = Date.now()): Achado[] {
  return achados.filter(a => /^https?:\/\//i.test(a.url) && (!a.publicadoEm || (Date.parse(a.publicadoEm) >= agora - dias * 86400000 && Date.parse(a.publicadoEm) <= agora)));
}

function normalizarTitulo(titulo: string): string {
  return titulo.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Dedup por URL normalizada e por título quase igual (mesmo título normalizado, ou um prefixo do outro). */
function deduplicar(achados: Achado[]): Achado[] {
  const porUrl = new Map<string, Achado>();
  for (const a of achados) {
    const chave = normalizarUrl(a.url);
    const atual = porUrl.get(chave);
    if (!atual || a.pontuacao > atual.pontuacao) porUrl.set(chave, a);
  }
  const restantes = [...porUrl.values()].sort((a, b) => b.pontuacao - a.pontuacao);
  const finais: Achado[] = [];
  const titulosVistos: string[] = [];
  for (const a of restantes) {
    const titulo = normalizarTitulo(a.titulo);
    const quaseIgual = titulosVistos.some((t) => t === titulo || (titulo.length > 12 && (t.startsWith(titulo) || titulo.startsWith(t))));
    if (quaseIgual) continue;
    titulosVistos.push(titulo);
    finais.push(a);
  }
  return finais;
}

const MAXIMO_ACHADOS = 60;

/** Último resultado conhecido de cada provedor neste processo (alimenta a linha "Fontes desta rodada" antes da primeira busca). */
const ultimoEstado = new Map<IdFonteBusca, { estado: EstadoFonte["estado"]; em: number }>();
const VALIDADE_SONDAGEM_MS = 15 * 60_000;

function estadoDe(p: Provedor, estado: EstadoFonte["estado"]): EstadoFonte {
  return { id: p.id, nome: NOMES_FONTE[p.id], estado };
}

export type ResultadoBusca = { achados: Achado[]; fontes: EstadoFonte[] };

/**
 * Busca em todas as fontes disponíveis, deduplica e devolve até 60 achados ordenados por relevância, mais a
 * situação de cada fonte nesta consulta. `aoResponder` é chamado com o nome de cada fonte assim que ela responde
 * (a tela mostra "já responderam: ..." enquanto espera). Cada provedor roda isolado: uma falha só gera console.error.
 */
export async function buscarDetalhado({ consulta, dias, aoResponder, provedores, site }: { consulta: string; dias: number; aoResponder?: (fonte: string) => void; provedores?: IdFonteBusca[]; site?: string }): Promise<ResultadoBusca> {
  const selecionados = PROVEDORES.filter(p => (!provedores || provedores.includes(p.id)) && (!site || ["exa", "tavily", "brightdata", "searchapi"].includes(p.id) || (p.id === "startse" && pertenceAoSite(site, "https://startse.com/artigos"))));
  const disponiveis = selecionados.filter(p => p.disponivel());
  if (!disponiveis.length) throw new ErroBusca("Nenhum buscador selecionado está configurado. Revise as fontes em Configurações.");
  const resultados = await Promise.allSettled(
    disponiveis.map(async (p) => {
      const query = site ? `${consulta} site:${new URL(site).hostname}${new URL(site).pathname.replace(/\/$/, "")}` : consulta;
      const campo = COLETORES.find(c => c.id === p.id)?.chave;
      const resultado = await buscarComCache([p.id, query, dias, campo ? getConfig(campo) : "publico", p.id === "grok" ? getConfig("XAI_SEARCH_MODEL") : ""], () => p.buscar(query, dias));
      const achados = filtrarPeriodo(resultado.achados, dias).filter(a => !site || pertenceAoSite(a.url, site) || (p.id === "startse" && pertenceAoSite(site, "https://startse.com/artigos")));
      aoResponder?.(NOMES_FONTE[p.id]);
      return { ...resultado, achados };
    })
  );

  const achados: Achado[] = [];
  const fontes: EstadoFonte[] = resultados.map((res, i) => {
    const p = disponiveis[i];
    if (res.status === "fulfilled") {
      achados.push(...res.value.achados);
      ultimoEstado.set(p.id, { estado: "ok", em: Date.now() });
      return { ...estadoDe(p, "ok"), cache: res.value.cache, coletadoEm: res.value.coletadoEm };
    }
    if (!(res.reason instanceof RedditBloqueado)) console.error(`Provedor de busca "${p.id}" falhou:`, res.reason);
    const estado: EstadoFonte["estado"] = (res.reason instanceof ChaveRecusada || res.reason instanceof ChaveSearchAPIRecusada) ? "chave_recusada" : "indisponivel";
    ultimoEstado.set(p.id, { estado, em: Date.now() });
    return estadoDe(p, estado);
  });

  if (!fontes.some((f) => f.estado === "ok") && disponiveis.length > 0) {
    throw new ErroBusca("Nenhuma fonte de busca respondeu agora. Tente novamente em alguns minutos.");
  }

  return { achados: deduplicar(achados).slice(0, MAXIMO_ACHADOS), fontes: [...fontes, ...selecionados.filter(p => !p.disponivel()).map(p => estadoDe(p, "sem_chave"))] };
}

/** Só os achados (compatível com quem não precisa da situação das fontes). */
export async function buscar(args: { consulta: string; dias: number }): Promise<Achado[]> {
  return (await buscarDetalhado(args)).achados;
}

/**
 * Situação das fontes para a tela antes de montar um radar: fontes sem chave são sondadas com uma consulta curta
 * (uma vez a cada 15 minutos por processo) para a linha "Fontes desta rodada" já dizer, por exemplo, que o Reddit
 * está indisponível; fontes com chave só dizem se a chave existe (a recusa aparece na rodada de verdade).
 */
export async function estadoDasFontes(selecionadas?: IdFonteBusca[]): Promise<EstadoFonte[]> {
  const agora = Date.now();
  const habilitados = PROVEDORES.filter(p => !selecionadas || selecionadas.includes(p.id));
  const sondar = habilitados.filter((p) => !p.comChave && (!ultimoEstado.has(p.id) || agora - ultimoEstado.get(p.id)!.em > VALIDADE_SONDAGEM_MS));
  if (sondar.length > 0) {
    const resultados = await Promise.allSettled(sondar.map((p) => p.buscar("inteligência artificial", 7)));
    resultados.forEach((res, i) => {
      if (res.status === "rejected" && !(res.reason instanceof RedditBloqueado)) console.error(`Sondagem da fonte "${sondar[i].id}" falhou:`, res.reason);
      ultimoEstado.set(sondar[i].id, { estado: res.status === "fulfilled" ? "ok" : "indisponivel", em: Date.now() });
    });
  }
  return habilitados.map((p) => {
    if (p.comChave) return estadoDe(p, p.disponivel() ? (ultimoEstado.get(p.id)?.estado ?? "ok") : "sem_chave");
    return estadoDe(p, ultimoEstado.get(p.id)?.estado ?? "ok");
  });
}

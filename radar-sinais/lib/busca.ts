// Motor de busca em fontes reais para o radar de sinais: Hacker News, Reddit e GitHub (públicos,
// sem chave) e Exa (com chave, mais qualidade de conteúdo). Reaproveitado por lib/radar.ts (US-008)
// para substituir o "melhor esforço" da IA por achados reais.
import { getConfig } from "./store";

export interface Achado {
  titulo: string;
  url: string;
  trecho: string;
  veiculo: string;
  /** Data de publicação (ISO 8601). */
  publicadoEm: string;
  /** Combina engajamento (pontos, comentários, estrelas...) e recência; maior é mais relevante. */
  pontuacao: number;
  fonte: "hackernews" | "reddit" | "github" | "exa";
}

/** Lançado quando nenhum provedor conseguiu responder, para a rota HTTP que chamar buscar() devolver 502 em vez de 500. */
export class ErroBusca extends Error {}

interface Provedor {
  nome: Achado["fonte"];
  disponivel(): boolean;
  buscar(consulta: string, dias: number): Promise<Achado[]>;
}

const USER_AGENT = "radar-sinais/1.0 (app interno de radar de mercado)";

/** Pontuação simples: engajamento normalizado (log para não deixar um outlier dominar) menos uma penalidade por idade. */
function pontuar(engajamento: number, publicadoEm: string, diasDoPeriodo: number): number {
  const idadeDias = Math.max(0, (Date.now() - new Date(publicadoEm).getTime()) / 86_400_000);
  const recencia = Math.max(0, 1 - idadeDias / Math.max(1, diasDoPeriodo));
  return Math.log10(engajamento + 1) * 10 + recencia * 5;
}

function cortarTrecho(texto: string | undefined | null, tamanho = 280): string {
  if (!texto) return "";
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > tamanho ? `${limpo.slice(0, tamanho)}…` : limpo;
}

const HACKERNEWS: Provedor = {
  nome: "hackernews",
  disponivel: () => true,
  async buscar(consulta, dias) {
    const desde = Math.floor((Date.now() - dias * 86_400_000) / 1000);
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(consulta)}&tags=story&numericFilters=created_at_i%3E${desde}&hitsPerPage=30`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Hacker News respondeu HTTP ${r.status}`);
    const data = (await r.json()) as { hits?: { title?: string; url?: string; story_text?: string; points?: number; num_comments?: number; created_at?: string; objectID: string }[] };
    return (data.hits || [])
      .filter((h) => h.title)
      .map((h) => {
        const publicadoEm = h.created_at || new Date().toISOString();
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

/** Reddit pede no máximo 1 requisição por segundo por cliente; espera o intervalo faltante antes de buscar. */
async function respeitarLimiteReddit(): Promise<void> {
  const espera = ultimaChamadaReddit + 1000 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaChamadaReddit = Date.now();
}

const REDDIT: Provedor = {
  nome: "reddit",
  disponivel: () => true,
  async buscar(consulta, dias) {
    await respeitarLimiteReddit();
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(consulta)}&sort=new&limit=30&t=${dias <= 7 ? "week" : dias <= 30 ? "month" : "year"}`;
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!r.ok) throw new Error(`Reddit respondeu HTTP ${r.status}`);
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
  nome: "github",
  disponivel: () => true,
  async buscar(consulta, dias) {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(consulta)}+created:>=${desde}&sort=stars&order=desc&per_page=30`;
    const r = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT } });
    if (!r.ok) throw new Error(`GitHub respondeu HTTP ${r.status}`);
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

function exaApiKey(): string | undefined {
  return getConfig("EXA_API_KEY");
}

export function exaEnabled(): boolean {
  return Boolean(exaApiKey());
}

const EXA: Provedor = {
  nome: "exa",
  disponivel: exaEnabled,
  async buscar(consulta, dias) {
    const startPublishedDate = new Date(Date.now() - dias * 86_400_000).toISOString();
    const r = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": exaApiKey()! },
      body: JSON.stringify({ query: consulta, startPublishedDate, numResults: 20, contents: { highlights: {} } }),
    });
    if (!r.ok) throw new Error(`Exa respondeu HTTP ${r.status}`);
    const data = (await r.json()) as { results?: { title?: string; url: string; publishedDate?: string; score?: number; highlights?: string[] }[] };
    return (data.results || []).map((res) => {
      const publicadoEm = res.publishedDate || new Date().toISOString();
      let veiculo = "Exa";
      try {
        veiculo = new URL(res.url).hostname.replace(/^www\./, "");
      } catch {
        // mantém "Exa" quando a URL vier malformada
      }
      return {
        titulo: res.title || res.url,
        url: res.url,
        trecho: cortarTrecho(res.highlights?.join(" ")),
        veiculo,
        publicadoEm,
        pontuacao: pontuar((res.score ?? 0) * 100, publicadoEm, dias),
        fonte: "exa" as const,
      };
    });
  },
};

const PROVEDORES: Provedor[] = [HACKERNEWS, REDDIT, GITHUB, EXA];

/** URL "normalizada" para deduplicar: sem protocolo, sem www, sem barra final, sem querystring/hash. */
function normalizarUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
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

/** Busca em todas as fontes disponíveis, deduplica e devolve até 60 achados ordenados por relevância. */
export async function buscar({ consulta, dias }: { consulta: string; dias: number }): Promise<Achado[]> {
  const disponiveis = PROVEDORES.filter((p) => p.disponivel());
  const resultados = await Promise.allSettled(disponiveis.map((p) => p.buscar(consulta, dias)));

  let algumRespondeu = false;
  const achados: Achado[] = [];
  resultados.forEach((res, i) => {
    if (res.status === "fulfilled") {
      algumRespondeu = true;
      achados.push(...res.value);
    } else {
      console.error(`Provedor de busca "${disponiveis[i].nome}" falhou:`, res.reason);
    }
  });

  if (!algumRespondeu && disponiveis.length > 0) {
    throw new ErroBusca("Nenhuma fonte de busca respondeu agora. Tente novamente em alguns minutos.");
  }

  return deduplicar(achados).slice(0, MAXIMO_ACHADOS);
}

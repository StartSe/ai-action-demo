// Camada única de descoberta: busca na web, leitura de página, perfil de pessoa e descoberta em
// lote. Nenhuma rota ou outra lib deste app fala com api.brightdata.com diretamente — todas passam
// por aqui, que decide entre a chamada real e o fallback de demonstração (lib/demo.ts).
//
// Endereços e formatos CONFERIDOS na documentação oficial em 18/09/2026 (https://docs.brightdata.com):
//   POST https://api.brightdata.com/request, cabeçalho `Authorization: Bearer <chave>`, corpo
//   `{ zone, url, format: "raw" }` (scraping-automation/web-unlocker/send-your-first-request).
//   - Leitura de página: soma `data_format: "markdown"` ao corpo — o Web Unlocker converte o HTML em
//     markdown do próprio lado do serviço (scraping-automation/web-unlocker/features: "Web Unlocker is
//     able to live convert your pages from HTML to markdown"), então não é mais preciso limpar HTML na
//     mão como `lib/abordagem.ts`/`lib/produto-ia.ts` faziam antes desta história.
//   - Busca na web (zona SERP): a `url` é uma busca do Google (`https://www.google.com/search?q=<consulta>`)
//     com `&brd_json=1` na própria query string do alvo (não no corpo do POST) — é o que faz o serviço
//     devolver o resultado já em JSON estruturado (`{ organic: [{ title, link, description }] }`) em vez
//     do HTML da página de busca (scraping-automation/serp-api/parsed-json-results).
//   - Descoberta em lote (os conjuntos de dados prontos da Bright Data, com disparo assíncrono e
//     consulta de andamento por id) fica FORA da v1 por decisão da própria PRD (Open Question 4,
//     `naoFazer` do prd.json): `descobrirEmLote` tem a interface pronta, mas hoje é busca + leitura de
//     cada resultado encontrado, sem chamar a API de datasets.
import type { DatabaseSync } from "node:sqlite";
import { ACAO_PESQUISA_DE_MERCADO } from "./acoes";
import { conteudoPaginaDemo, perfilPessoaDemo, resultadosBuscaDemo } from "./demo";
import { abrirBanco, getConfig } from "./store";

/** Base do serviço. A variável só existe para os testes locais apontarem para um fornecedor falso. */
const BASE = process.env.BRIGHTDATA_BASE_URL || "https://api.brightdata.com";

export type CodigoErroDescoberta = "chave_recusada" | "limite_do_plano" | "servico_fora" | "sem_resultado";

// --- Teto de consultas por prospecção e cache de páginas (US-023) --------------------------------
//
// Duas tabelas PRÓPRIAS desta camada (mesmo app.sqlite de lib/store.ts, acessor abrirBanco() — mesmo
// padrão de "dona do esquema" já usado por lib/workspace.ts): `cache_paginas` (uma linha por URL já
// lida, reaproveitada por até 24h por QUALQUER chamador de lerPagina/perfilDePessoa, não só o
// pipeline) e `consultas_prospeccao` (contagem de chamadas reais — nunca demo, nunca cache — por
// prospecção, usada só por quem passa um prospeccaoId).
let criado = false;
function banco(): DatabaseSync {
  const d = abrirBanco();
  if (criado) return d;
  d.exec(`CREATE TABLE IF NOT EXISTS cache_paginas (
    url TEXT PRIMARY KEY,
    conteudo TEXT NOT NULL,
    lido_em TEXT NOT NULL
  )`);
  d.exec(`CREATE TABLE IF NOT EXISTS consultas_prospeccao (
    prospeccao_id TEXT PRIMARY KEY,
    quantidade INTEGER NOT NULL DEFAULT 0
  )`);
  criado = true;
  return d;
}

const VALIDADE_CACHE_MS = 24 * 60 * 60 * 1000;

/** Conteúdo já lido para essa URL há menos de 24h, ou null (nunca lido, ou lido há mais tempo). */
function lerCache(url: string): string | null {
  const linha = banco().prepare(`SELECT conteudo, lido_em FROM cache_paginas WHERE url = ?`).get(url) as
    | { conteudo: string; lido_em: string }
    | undefined;
  if (!linha) return null;
  const lidoEm = new Date(linha.lido_em).getTime();
  if (!Number.isFinite(lidoEm) || Date.now() - lidoEm >= VALIDADE_CACHE_MS) return null;
  return linha.conteudo;
}

function gravarCache(url: string, conteudo: string): void {
  banco()
    .prepare(
      `INSERT INTO cache_paginas (url, conteudo, lido_em) VALUES (?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET conteudo = excluded.conteudo, lido_em = excluded.lido_em`
    )
    .run(url, conteudo, new Date().toISOString());
}

const TETO_PADRAO_CONSULTAS = 60;

/** Lido de "Opções avançadas" do /setup (BRIGHTDATA_TETO_CONSULTAS); sem valor salvo (ou valor
 * inválido), cai no padrão — mesmo espírito de quantidadeAlvo() em lib/execucao-prospeccao.ts. */
function tetoConsultas(): number {
  const bruto = getConfig("BRIGHTDATA_TETO_CONSULTAS");
  const numero = bruto ? Number(bruto) : NaN;
  return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : TETO_PADRAO_CONSULTAS;
}

/** Lançada quando uma prospecção já fez `teto` chamadas reais à Bright Data: quem chama (o pipeline em
 * lib/execucao-prospeccao.ts) deve deixar propagar até o try/catch mais externo, que marca a
 * prospecção "pronta" com o aviso de orçamento — nunca "falhou" (não é uma falha do serviço). */
export class TetoConsultasAtingido extends Error {
  teto: number;
  constructor(teto: number) {
    super(`Teto de ${teto} consultas atingido para esta prospecção.`);
    this.name = "TetoConsultasAtingido";
    this.teto = teto;
  }
}

/** Conta uma chamada real (nunca demo, nunca reaproveitada do cache) para a prospecção informada;
 * lança TetoConsultasAtingido ANTES de reservar a chamada que estouraria o teto — sem prospeccaoId
 * (chamadas fora de uma execução de pipeline, ex.: lib/abordagem.ts), não conta e nunca lança. */
function reservarConsulta(prospeccaoId: string | undefined): void {
  if (!prospeccaoId) return;
  const teto = tetoConsultas();
  const linha = banco().prepare(`SELECT quantidade FROM consultas_prospeccao WHERE prospeccao_id = ?`).get(prospeccaoId) as
    | { quantidade: number }
    | undefined;
  if ((linha?.quantidade ?? 0) >= teto) throw new TetoConsultasAtingido(teto);
  banco()
    .prepare(
      `INSERT INTO consultas_prospeccao (prospeccao_id, quantidade) VALUES (?, 1)
       ON CONFLICT(prospeccao_id) DO UPDATE SET quantidade = quantidade + 1`
    )
    .run(prospeccaoId);
}

/**
 * Falha da pesquisa de mercado (Bright Data) já traduzida para a tela: mensagem em linguagem de
 * negócio, sem status HTTP nem corpo da resposta do fornecedor (isso vai só para o console). Mesmo
 * formato de ErroApollo (lib/leads.ts) e ErroIA (lib/ai.ts), para `responderErro` (app/api/erros.ts)
 * devolver `codigo`/`acao` sem caso especial.
 */
export class ErroDescoberta extends Error {
  codigo: CodigoErroDescoberta;
  status: number;
  acao?: { rotulo: string; url: string };

  constructor(codigo: CodigoErroDescoberta, mensagem: string, status: number, acao?: { rotulo: string; url: string }) {
    super(mensagem);
    this.name = "ErroDescoberta";
    this.codigo = codigo;
    this.status = status;
    this.acao = acao;
  }
}

/** Único ponto que traduz uma resposta não-ok da Bright Data em ErroDescoberta. */
function interpretarFalha(status: number, detalheBruto: string): ErroDescoberta {
  console.error("Bright Data recusou:", status, detalheBruto.slice(0, 200));
  if (status === 401 || status === 403) {
    return new ErroDescoberta(
      "chave_recusada",
      "A pesquisa de mercado recusou a chave. Confira em Configurações › Pesquisa de mercado e sinais.",
      401,
      ACAO_PESQUISA_DE_MERCADO
    );
  }
  if (status === 402 || status === 429) {
    return new ErroDescoberta("limite_do_plano", "A pesquisa de mercado atingiu o limite do plano.", 429, ACAO_PESQUISA_DE_MERCADO);
  }
  return new ErroDescoberta("servico_fora", "A pesquisa de mercado não respondeu; tente de novo em um minuto.", 502);
}

function chaveConfigurada(): boolean {
  return Boolean(getConfig("BRIGHTDATA_API_KEY"));
}

function zonaBusca(): string | undefined {
  return getConfig("BRIGHTDATA_ZONE_BUSCA");
}

// BRIGHTDATA_ZONE é o nome já usado por quem lia página antes desta camada existir (US-007, e o
// enriquecimento de abordagem de antes da US-001); continua valendo como zona de leitura enquanto a
// US-016 não separa os dois campos (busca/leitura) no /setup, para não mudar o comportamento de quem
// já configurou.
function zonaLeitura(): string | undefined {
  return getConfig("BRIGHTDATA_ZONE_LEITURA") || getConfig("BRIGHTDATA_ZONE");
}

/** Se pelo menos uma capacidade (busca ou leitura) tem chave e zona configuradas. */
export function descobertaAtiva(): boolean {
  return chaveConfigurada() && Boolean(zonaBusca() || zonaLeitura());
}

async function chamar(zone: string, corpo: Record<string, unknown>, prospeccaoId?: string): Promise<string> {
  reservarConsulta(prospeccaoId);
  let r: Response;
  try {
    r = await fetch(`${BASE}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getConfig("BRIGHTDATA_API_KEY")}` },
      body: JSON.stringify({ zone, ...corpo }),
    });
  } catch (err) {
    console.error("Erro de rede ao chamar a Bright Data:", err);
    throw new ErroDescoberta("servico_fora", "A pesquisa de mercado não respondeu; tente de novo em um minuto.", 502);
  }
  const texto = await r.text().catch(() => "");
  if (!r.ok) throw interpretarFalha(r.status, texto);
  return texto;
}

// --- Busca na web --------------------------------------------------------------------------------

export type ResultadoBuscaWeb = { titulo: string; url: string; resumo: string };
export type RespostaBusca = { itens: ResultadoBuscaWeb[]; origem: string; consultadoEm: string; demo: boolean };

interface OrganicoSerp {
  title?: string;
  link?: string;
  description?: string;
}

/** `pagina` (0-indexado) soma `&start=<pagina*10>` à busca do Google (paginação padrão de resultados
 * orgânicos, não específica da Bright Data) — usado por quem precisa de mais de uma página de
 * candidatos (ex.: lib/execucao-prospeccao.ts, "Quantidade alvo" de 25/50 empresas). */
export async function buscarNaWeb(consulta: string, pagina = 0, prospeccaoId?: string): Promise<RespostaBusca> {
  const origemBase = `https://www.google.com/search?q=${encodeURIComponent(consulta)}`;
  const origem = pagina > 0 ? `${origemBase}&start=${pagina * 10}` : origemBase;
  const consultadoEm = new Date().toISOString();
  const zona = zonaBusca();
  if (!chaveConfigurada() || !zona) {
    return { itens: resultadosBuscaDemo(consulta), origem, consultadoEm, demo: true };
  }
  const texto = await chamar(zona, { url: `${origem}&brd_json=1`, format: "raw" }, prospeccaoId);
  let dados: { organic?: OrganicoSerp[] } = {};
  try {
    dados = JSON.parse(texto);
  } catch (err) {
    console.error("Resposta da busca não veio em JSON:", err instanceof Error ? err.message : err);
  }
  const itens = (dados.organic || [])
    .map((o): ResultadoBuscaWeb => ({ titulo: o.title || "", url: o.link || "", resumo: o.description || "" }))
    .filter((item) => item.url);
  if (!itens.length) {
    throw new ErroDescoberta("sem_resultado", "A pesquisa não encontrou nada para esse critério.", 404);
  }
  return { itens, origem, consultadoEm, demo: false };
}

// --- Leitura de página e perfil de pessoa --------------------------------------------------------

export type RespostaLeitura = { conteudo: string; origem: string; consultadoEm: string; demo: boolean };

const LIMITE_CONTEUDO = 8000;

/** Reaproveita `cache_paginas` quando a URL já foi lida há menos de 24h (sem nova chamada à Bright
 * Data, sem contar consulta nenhuma); senão lê de verdade e grava o resultado no cache. */
async function lerComMarkdown(zona: string, url: string, prospeccaoId?: string): Promise<string> {
  const emCache = lerCache(url);
  if (emCache !== null) return emCache;
  const conteudo = await chamar(zona, { url, format: "raw", data_format: "markdown" }, prospeccaoId);
  if (!conteudo.trim()) throw new ErroDescoberta("sem_resultado", "Não foi possível ler o conteúdo dessa página.", 404);
  const limitado = conteudo.trim().slice(0, LIMITE_CONTEUDO);
  gravarCache(url, limitado);
  return limitado;
}

/** Texto limpo (markdown) de uma página pública. `prospeccaoId`, quando informado, conta a chamada
 * (se real) para o teto de consultas daquela prospecção (US-023). */
export async function lerPagina(url: string, prospeccaoId?: string): Promise<RespostaLeitura> {
  const consultadoEm = new Date().toISOString();
  const zona = zonaLeitura();
  if (!chaveConfigurada() || !zona) {
    return { conteudo: conteudoPaginaDemo(url), origem: url, consultadoEm, demo: true };
  }
  const conteudo = await lerComMarkdown(zona, url, prospeccaoId);
  return { conteudo, origem: url, consultadoEm, demo: false };
}

/**
 * Texto limpo (markdown) de um perfil público de pessoa. Hoje é a MESMA leitura de página de
 * `lerPagina` (mesma zona, mesmo formato) — uma capacidade própria é o que permite, mais adiante,
 * trocar por um provedor/endpoint dedicado a perfil profissional sem mexer em quem já chama `lerPagina`.
 */
export async function perfilDePessoa(url: string, prospeccaoId?: string): Promise<RespostaLeitura> {
  const consultadoEm = new Date().toISOString();
  const zona = zonaLeitura();
  if (!chaveConfigurada() || !zona) {
    return { conteudo: perfilPessoaDemo(url), origem: url, consultadoEm, demo: true };
  }
  const conteudo = await lerComMarkdown(zona, url, prospeccaoId);
  return { conteudo, origem: url, consultadoEm, demo: false };
}

// --- Descoberta em lote ---------------------------------------------------------------------------

export type ItemLote = { url: string; conteudo: string; origem: string; consultadoEm: string };
export type RespostaLote = { itens: ItemLote[]; demo: boolean };

// v1 sem o dataset assíncrono da Bright Data (Open Question 4 da PRD): um teto pequeno de páginas
// lidas por chamada, para uma etapa do pipeline não travar numa lista grande de resultados de busca.
const TETO_LOTE = 5;

// "Chamada assíncrona do fornecedor... faz no máximo N consultas espaçadas e, esgotado o tempo, segue
// com o que já tem, sem travar a etapa" (Technical Considerations da PRD): como a v1 não usa o dataset
// assíncrono de verdade (só busca + leitura sequencial), o orçamento de tempo é quem garante que uma
// leitura lenta não prenda a etapa além do razoável — o laço para e segue com o que já achou.
const TEMPO_MAXIMO_LOTE_MS = 20_000;

/** Descoberta em lote (interface definida pela PRD): hoje é busca na web + leitura de cada resultado. */
export async function descobrirEmLote(criterios: Record<string, unknown>, prospeccaoId?: string): Promise<RespostaLote> {
  const consulta = Object.values(criterios)
    .filter((v) => typeof v === "string" && v.trim())
    .join(" ");
  const busca = await buscarNaWeb(consulta, 0, prospeccaoId);
  if (busca.demo) {
    return {
      itens: busca.itens.slice(0, TETO_LOTE).map((item) => ({
        url: item.url,
        conteudo: conteudoPaginaDemo(item.url),
        origem: item.url,
        consultadoEm: busca.consultadoEm,
      })),
      demo: true,
    };
  }
  const inicio = Date.now();
  const itens: ItemLote[] = [];
  for (const resultado of busca.itens.slice(0, TETO_LOTE)) {
    if (Date.now() - inicio > TEMPO_MAXIMO_LOTE_MS) break; // esgotado o tempo: segue com o que já tem
    try {
      const pagina = await lerPagina(resultado.url, prospeccaoId);
      itens.push({ url: resultado.url, conteudo: pagina.conteudo, origem: pagina.origem, consultadoEm: pagina.consultadoEm });
    } catch (err) {
      if (err instanceof TetoConsultasAtingido) throw err;
      console.error("Falha ao ler página da descoberta em lote:", resultado.url, err instanceof Error ? err.message : err);
    }
  }
  return { itens, demo: false };
}

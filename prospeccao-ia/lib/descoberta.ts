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
import { ACAO_PESQUISA_DE_MERCADO } from "./acoes";
import { conteudoPaginaDemo, perfilPessoaDemo, resultadosBuscaDemo } from "./demo";
import { getConfig } from "./store";

/** Base do serviço. A variável só existe para os testes locais apontarem para um fornecedor falso. */
const BASE = process.env.BRIGHTDATA_BASE_URL || "https://api.brightdata.com";

export type CodigoErroDescoberta = "chave_recusada" | "limite_do_plano" | "servico_fora" | "sem_resultado";

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

async function chamar(zone: string, corpo: Record<string, unknown>): Promise<string> {
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
export async function buscarNaWeb(consulta: string, pagina = 0): Promise<RespostaBusca> {
  const origemBase = `https://www.google.com/search?q=${encodeURIComponent(consulta)}`;
  const origem = pagina > 0 ? `${origemBase}&start=${pagina * 10}` : origemBase;
  const consultadoEm = new Date().toISOString();
  const zona = zonaBusca();
  if (!chaveConfigurada() || !zona) {
    return { itens: resultadosBuscaDemo(consulta), origem, consultadoEm, demo: true };
  }
  const texto = await chamar(zona, { url: `${origem}&brd_json=1`, format: "raw" });
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

async function lerComMarkdown(zona: string, url: string): Promise<string> {
  const conteudo = await chamar(zona, { url, format: "raw", data_format: "markdown" });
  if (!conteudo.trim()) throw new ErroDescoberta("sem_resultado", "Não foi possível ler o conteúdo dessa página.", 404);
  return conteudo.trim().slice(0, LIMITE_CONTEUDO);
}

/** Texto limpo (markdown) de uma página pública. */
export async function lerPagina(url: string): Promise<RespostaLeitura> {
  const consultadoEm = new Date().toISOString();
  const zona = zonaLeitura();
  if (!chaveConfigurada() || !zona) {
    return { conteudo: conteudoPaginaDemo(url), origem: url, consultadoEm, demo: true };
  }
  const conteudo = await lerComMarkdown(zona, url);
  return { conteudo, origem: url, consultadoEm, demo: false };
}

/**
 * Texto limpo (markdown) de um perfil público de pessoa. Hoje é a MESMA leitura de página de
 * `lerPagina` (mesma zona, mesmo formato) — uma capacidade própria é o que permite, mais adiante,
 * trocar por um provedor/endpoint dedicado a perfil profissional sem mexer em quem já chama `lerPagina`.
 */
export async function perfilDePessoa(url: string): Promise<RespostaLeitura> {
  const consultadoEm = new Date().toISOString();
  const zona = zonaLeitura();
  if (!chaveConfigurada() || !zona) {
    return { conteudo: perfilPessoaDemo(url), origem: url, consultadoEm, demo: true };
  }
  const conteudo = await lerComMarkdown(zona, url);
  return { conteudo, origem: url, consultadoEm, demo: false };
}

// --- Descoberta em lote ---------------------------------------------------------------------------

export type ItemLote = { url: string; conteudo: string; origem: string; consultadoEm: string };
export type RespostaLote = { itens: ItemLote[]; demo: boolean };

// v1 sem o dataset assíncrono da Bright Data (Open Question 4 da PRD): um teto pequeno de páginas
// lidas por chamada, para uma etapa do pipeline não travar numa lista grande de resultados de busca.
const TETO_LOTE = 5;

/** Descoberta em lote (interface definida pela PRD): hoje é busca na web + leitura de cada resultado. */
export async function descobrirEmLote(criterios: Record<string, unknown>): Promise<RespostaLote> {
  const consulta = Object.values(criterios)
    .filter((v) => typeof v === "string" && v.trim())
    .join(" ");
  const busca = await buscarNaWeb(consulta);
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
  const itens: ItemLote[] = [];
  for (const resultado of busca.itens.slice(0, TETO_LOTE)) {
    try {
      const pagina = await lerPagina(resultado.url);
      itens.push({ url: resultado.url, conteudo: pagina.conteudo, origem: pagina.origem, consultadoEm: pagina.consultadoEm });
    } catch (err) {
      console.error("Falha ao ler página da descoberta em lote:", resultado.url, err instanceof Error ? err.message : err);
    }
  }
  return { itens, demo: false };
}

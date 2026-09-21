// Camada de descoberta via Bright Data MCP HTTP (pro=1). Busca, leitura e dados estruturados
// compartilham a chave salva, o teto de consultas e o cache; sem chave, usa demonstração.
// Referência: https://github.com/brightdata/brightdata-mcp (search_engine, scrape_as_markdown,
// search_dataset e web_data_*). Catálogo e schemas são descobertos por tools/list.
import { prospectHaloAtivo, listarAcoesProspectHalo, executarAcaoProspectHalo } from "./prospecthalo";
import { buscarFonte, lerFonte, fontesOpcionais, FONTES, ErroFonte, type FonteOpcional } from "./pesquisa-fontes";
import { registrarConsulta, concluirConsulta, limiteDaFonte } from "./pesquisa-registro";
import type { DatabaseSync } from "node:sqlite";
import { ACAO_PESQUISA_DE_MERCADO } from "./acoes";
import { conteudoPaginaDemo, perfilPessoaDemo, resultadosBuscaDemo } from "./demo";
import { abrirBanco, getConfig } from "./store";
import { acaoParaUrl, brightDataAtiva, chamarBrightData, listarAcoesBrightData, mensagemFalhaBrightData, resultadosOrganicos } from "./brightdata";
import { ErroMCP, type FerramentaMCP } from "./brightdata-http";

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
 * formato de ErroProspectHalo (lib/prospecthalo.ts) e ErroIA (lib/ai.ts), para `responderErro` (app/api/erros.ts)
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

/** Não propaga respostas externas nem URLs que possam conter o token. */
function interpretarFalha(erro: unknown): ErroDescoberta {
  const mensagem = mensagemFalhaBrightData(erro);
  if (erro instanceof ErroMCP) {
    if ([401, 403].includes(erro.status) || /unauthorized|invalid.*(?:token|key)|authentication/i.test(erro.detalhe)) {
      return new ErroDescoberta("chave_recusada", mensagem, 401, ACAO_PESQUISA_DE_MERCADO);
    }
    if ([402, 429].includes(erro.status) || /quota|credit|balance|rate.?limit|payment/i.test(erro.detalhe)) {
      return new ErroDescoberta("limite_do_plano", mensagem, 429, ACAO_PESQUISA_DE_MERCADO);
    }
  }
  return new ErroDescoberta("servico_fora", mensagem, 502, ACAO_PESQUISA_DE_MERCADO);
}

export function descobertaAtiva(): boolean {
  return brightDataAtiva() || fontesOpcionais().length > 0;
}

/** Ações públicas expostas também ao assistente, com os schemas atuais do servidor. */
export async function listarAcoesPesquisa(): Promise<FerramentaMCP[]> {
  const opcionais = fontesOpcionais();
  const acoes: FerramentaMCP[] = opcionais.flatMap(fonte => [
    { nome: `${fonte}_search`, descricao: `Pesquisa na web via ${FONTES[fonte]}.`, schema: { type: "object", properties: { consulta: { type: "string" }, pagina: { type: "integer", minimum: 0, maximum: 4 } }, required: ["consulta"] } },
    ...(fonte === "searchapi" ? [] : [{ nome: `${fonte}_read`, descricao: `Lê uma página pública via ${FONTES[fonte]}.`, schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } }]),
  ]);
  if (prospectHaloAtivo()) {
    try { acoes.push(...await listarAcoesProspectHalo()); }
    catch (erro) { if (!acoes.length && !brightDataAtiva()) throw erro; }
  }
  if (brightDataAtiva()) {
    try { acoes.push(...await listarAcoesBrightData()); }
    catch (erro) { if (!acoes.length) throw interpretarFalha(erro); }
  }
  return acoes;
}

export async function executarAcaoPesquisa(nome: string, argumentos: Record<string, unknown>, prospeccaoId?: string): Promise<unknown> {
  if (nome.startsWith("prospecthalo_")) return executarAcaoProspectHalo(nome, argumentos, prospeccaoId);
  const alternativa = /^(exa|tavily|searchapi)_(search|read)$/.exec(nome);
  if (alternativa) {
    const fonte = alternativa[1] as FonteOpcional;
    if (!fontesOpcionais().includes(fonte)) throw new ErroDescoberta("chave_recusada", `Conecte ${FONTES[fonte]} em Configurações.`, 400);
    if (alternativa[2] === "search") {
      const consulta = typeof argumentos.consulta === "string" ? argumentos.consulta.trim() : "";
      const pagina = argumentos.pagina ?? 0;
      if (!consulta || !Number.isInteger(pagina) || Number(pagina) < 0 || Number(pagina) > 4) throw new ErroDescoberta("servico_fora", "Informe uma consulta e uma página válida (0 a 4).", 400);
      return consultarOpcional(fonte, "busca", consulta, prospeccaoId, () => buscarFonte(fonte, consulta, Number(pagina)));
    }
    if (fonte === "searchapi") throw new ErroDescoberta("servico_fora", "SearchAPI oferece busca; use outra fonte para leitura.", 400);
    const url = typeof argumentos.url === "string" ? argumentos.url : "";
    if (!/^https?:\/\//i.test(url)) throw new ErroDescoberta("servico_fora", "Informe o endereço público da página.", 400);
    return consultarOpcional(fonte, "leitura", url, prospeccaoId, () => lerFonte(fonte, url));
  }
  if (!brightDataAtiva()) throw new ErroDescoberta("chave_recusada", "Conecte a pesquisa de mercado em Configurações.", 401, ACAO_PESQUISA_DE_MERCADO);
  reservarConsulta(prospeccaoId);
  const registro = registrarConsulta(prospeccaoId, "brightdata", nome, String(argumentos.query ?? argumentos.url ?? nome));
  try {
    const resultado = await chamarBrightData(nome, argumentos);
    const quantidade = nome === "search_engine" ? resultadosOrganicos(resultado).length : resultado ? 1 : 0;
    concluirConsulta(registro, quantidade ? "concluida" : "vazia", quantidade);
    return resultado;
  } catch (erro) {
    const falha = interpretarFalha(erro);
    concluirConsulta(registro, "falhou", 0, falha.message);
    throw falha;
  }
}

/** Limites e registro também cobrem leituras das fontes alternativas. */
async function consultarOpcional<T extends string | ResultadoBuscaWeb[]>(fonte: FonteOpcional, acao: string, consulta: string, prospeccaoId: string | undefined, executar: () => Promise<T>): Promise<T> {
  const limite = limiteDaFonte(prospeccaoId, fonte);
  const id = registrarConsulta(prospeccaoId, fonte, acao, consulta);
  if (limite) {
    const mensagem = `O limite de consultas de ${FONTES[fonte]} nesta prospecção foi atingido.`;
    concluirConsulta(id, "limite", 0, mensagem);
    throw new ErroDescoberta("limite_do_plano", mensagem, 429);
  }
  try {
    const resultado = await executar();
    const quantidade = typeof resultado === "string" ? Number(Boolean(resultado)) : resultado.length;
    concluirConsulta(id, quantidade ? "concluida" : "vazia", quantidade);
    return resultado;
  } catch (erro) {
    const mensagem = erro instanceof ErroFonte ? erro.message : `Não foi possível consultar ${FONTES[fonte]}.`;
    concluirConsulta(id, "falhou", 0, mensagem);
    throw new ErroDescoberta(erro instanceof ErroFonte && erro.codigo !== "resposta_invalida" ? erro.codigo : "servico_fora", mensagem, 502, { rotulo: `Conferir ${FONTES[fonte]}`, url: `/setup#${fonte}` });
  }
}

// --- Busca na web --------------------------------------------------------------------------------

export type ResultadoBuscaWeb = { titulo: string; url: string; resumo: string; fontes?: string[]; pessoa?: { nome: string; cargo: string; empresa: string; cidade: string; site: string } };

/** Intercala fornecedores para que o corte de candidatos não favoreça apenas a primeira fonte. */
export function combinarResultados(lotes: ResultadoBuscaWeb[][]): ResultadoBuscaWeb[] {
  const unicos = new Map<string, ResultadoBuscaWeb>();
  for (let i = 0; i < Math.max(0, ...lotes.map(l => l.length)); i++) {
    for (const lote of lotes) {
      const item = lote[i];
      if (!item) continue;
      let chave: string;
      try {
        const u = new URL(item.url);
        u.hash = ""; u.hostname = u.hostname.replace(/^www\./, "");
        for (const k of [...u.searchParams.keys()]) if (/^utm_|^(trk|trackingId|gclid|fbclid)$/.test(k)) u.searchParams.delete(k);
        chave = `${u.hostname}${u.pathname.replace(/\/$/, "")}${u.search}`;
      } catch { continue; }
      const anterior = unicos.get(chave);
      if (!anterior) unicos.set(chave, { ...item });
      else {
        anterior.fontes = [...new Set([...(anterior.fontes ?? []), ...(item.fontes ?? [])])];
        if (item.resumo && !anterior.resumo.includes(item.resumo)) anterior.resumo = [anterior.resumo, item.resumo].filter(Boolean).join("\n").slice(0, 12000);
      }
    }
  }
  return [...unicos.values()];
}
export type RespostaBusca = { itens: ResultadoBuscaWeb[]; origem: string; consultadoEm: string; demo: boolean };

/** `pagina` (0-indexado) soma `&start=<pagina*10>` à busca do Google (paginação padrão de resultados
 * orgânicos, não específica da Bright Data) — usado por quem precisa de mais de uma página de
 * candidatos (ex.: lib/execucao-prospeccao.ts, "Quantidade alvo" de 25/50 empresas). */
export async function buscarNaWeb(consulta: string, pagina = 0, prospeccaoId?: string): Promise<RespostaBusca> {
  const origemBase = `https://www.google.com/search?q=${encodeURIComponent(consulta)}`;
  const origem = pagina > 0 ? `${origemBase}&start=${pagina * 10}` : origemBase;
  const consultadoEm = new Date().toISOString();
  if (!descobertaAtiva() && !prospectHaloAtivo()) {
    return { itens: resultadosBuscaDemo(consulta), origem, consultadoEm, demo: true };
  }
  const opcionais = fontesOpcionais();
  const fontes = [...(opcionais.includes("exa") ? ["exa" as const] : []), ...(brightDataAtiva() ? ["brightdata" as const] : []), ...opcionais.filter(f => f !== "exa")];
  let ultimaFalha: unknown;
  const lotes: ResultadoBuscaWeb[][] = [];
  for (const fonte of fontes) {
    try {
      const itens = fonte === "brightdata"
        ? resultadosOrganicos(await executarAcaoPesquisa("search_engine", { query: consulta, engine: "google", ...(pagina > 0 ? { cursor: String(pagina) } : {}) }, prospeccaoId))
        : await consultarOpcional(fonte, "busca", consulta, prospeccaoId, () => buscarFonte(fonte, consulta, pagina));
      const site = /site:([^\s]+)/i.exec(consulta)?.[1];
      const filtrados = site ? itens.filter(item => {
        try {
          const alvo = new URL(`https://${site}`), url = new URL(item.url);
          return (url.hostname === alvo.hostname || url.hostname.endsWith(`.${alvo.hostname}`)) && url.pathname.startsWith(alvo.pathname);
        } catch { return false; }
      }) : itens;
      lotes.push(filtrados.map(item => ({ ...item, fontes: [fonte] })));
    } catch (erro) { ultimaFalha = erro; }
  }
  const itens = combinarResultados(lotes);
  if (itens.length) return { itens, origem, consultadoEm, demo: false };
  if (ultimaFalha) throw ultimaFalha;
  throw new ErroDescoberta("sem_resultado", "As fontes conectadas não encontraram resultados para esses critérios. Tente ampliar a busca.", 404);
}

// --- Leitura de página e perfil de pessoa --------------------------------------------------------

export type RespostaLeitura = { conteudo: string; origem: string; consultadoEm: string; demo: boolean };

const LIMITE_CONTEUDO = 8000;

/** Snapshots podem conter registros de erro mesmo sem isError no envelope MCP. */
export function conteudoEstruturado(resultado: unknown): string | undefined {
  const registros = Array.isArray(resultado) ? resultado : [resultado];
  const validos = registros.filter((r): r is Record<string, unknown> =>
    r !== null && typeof r === "object" && !Array.isArray(r)
    && !r.error && !r.error_code && Object.keys(r).length > 0);
  return validos.length ? JSON.stringify(validos) : undefined;
}

/** Reaproveita `cache_paginas` quando a URL já foi lida há menos de 24h (sem nova chamada à Bright
 * Data, sem contar consulta nenhuma); senão lê de verdade e grava o resultado no cache. */
async function lerConteudoBrightData(url: string, prospeccaoId?: string): Promise<string> {
  const emCache = lerCache(url);
  if (emCache !== null) return emCache;
  const acao = acaoParaUrl(url);
  let conteudo: string | undefined;
  if (acao !== "scrape_as_markdown") {
    const acoes = await listarAcoesPesquisa();
    if (acoes.some(f => f.nome === acao)) {
      try { conteudo = conteudoEstruturado(await executarAcaoPesquisa(acao, { url }, prospeccaoId)); }
      catch (erro) {
        if (erro instanceof TetoConsultasAtingido || (erro instanceof ErroDescoberta && ["chave_recusada", "limite_do_plano"].includes(erro.codigo))) throw erro;
        // Falha da extração específica: tenta a leitura pública da mesma página.
      }
    }
  }
  if (!conteudo) {
    const markdown = await executarAcaoPesquisa("scrape_as_markdown", { url }, prospeccaoId);
    // Um envelope vazio ou objeto de erro não é conteúdo de uma página.
    if (typeof markdown === "string") conteudo = markdown;
  }
  if (!conteudo?.trim()) throw new ErroDescoberta("sem_resultado", "Não foi possível ler o conteúdo dessa página.", 404);
  const limitado = conteudo.trim().slice(0, LIMITE_CONTEUDO);
  gravarCache(url, limitado);
  return limitado;
}

async function lerConteudo(url: string, prospeccaoId?: string, resumoAlternativo?: string): Promise<string> {
  const emCache = lerCache(url);
  if (emCache !== null) return emCache;
  let falha: unknown;
  if (brightDataAtiva()) {
    try { return await lerConteudoBrightData(url, prospeccaoId); }
    catch (erro) { falha = erro; }
  }
  for (const fonte of fontesOpcionais()) {
    if (fonte === "searchapi") continue;
    try {
      const conteudo = await consultarOpcional(fonte, "leitura", url, prospeccaoId, () => lerFonte(fonte, url));
      gravarCache(url, conteudo.slice(0, LIMITE_CONTEUDO));
      return conteudo.slice(0, LIMITE_CONTEUDO);
    } catch (erro) { falha = erro; }
  }
  // O trecho veio da busca real e pode sustentar evidências limitadas; nunca vira conteúdo fictício.
  if (resumoAlternativo?.trim()) return resumoAlternativo.slice(0, LIMITE_CONTEUDO);
  if (falha) throw falha;
  throw new ErroDescoberta("servico_fora", "Conecte uma fonte de leitura (Bright Data, Exa ou Tavily) para analisar páginas e perfis.", 400);
}

/** Texto limpo (markdown) de uma página pública. `prospeccaoId`, quando informado, conta a chamada
 * (se real) para o teto de consultas daquela prospecção (US-023). */
export async function lerPagina(url: string, prospeccaoId?: string, resumoAlternativo?: string): Promise<RespostaLeitura> {
  const consultadoEm = new Date().toISOString();
  if (!descobertaAtiva() && !prospectHaloAtivo()) {
    return { conteudo: conteudoPaginaDemo(url), origem: url, consultadoEm, demo: true };
  }
  const conteudo = await lerConteudo(url, prospeccaoId, resumoAlternativo);
  return { conteudo, origem: url, consultadoEm, demo: false };
}

/** Perfil público: dados estruturados da rede quando disponíveis, com fallback para Markdown. */
export async function perfilDePessoa(url: string, prospeccaoId?: string, resumoAlternativo?: string): Promise<RespostaLeitura> {
  const consultadoEm = new Date().toISOString();
  if (!descobertaAtiva() && !prospectHaloAtivo()) {
    return { conteudo: perfilPessoaDemo(url), origem: url, consultadoEm, demo: true };
  }
  const conteudo = await lerConteudo(url, prospeccaoId, resumoAlternativo);
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

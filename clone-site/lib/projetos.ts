// Site = projeto: nome, marca, origem (captura de referência, endereço de um site ou briefing), estado e a página gerada (que
// continua no histórico, lib/historico.ts, com as suas versões). Próprio do app (nunca comparado por
// scripts/verificar-padrao.sh). Tabela `projetos` no mesmo app.sqlite de lib/store.ts.
//
// Estados: rascunho → gerando → pronto | falhou; falhou → gerando ("Tentar de novo"). A geração corre em
// segundo plano (promessa sem await, mesmo desenho de videos-campanha/lib/videos.ts): a rota responde 202 e
// a tela consulta obter(id) a cada 5 s. A captura fica guardada na linha só até `pronto` (para gerar sem a
// aba aberta e para "Tentar de novo" sem reenviar) e é apagada em seguida.
import crypto from "node:crypto";
import { apagarReleases } from "./releases";
import { registrarPublicacao, apagarPublicacoes, listarPublicacoes } from "./publicacoes";
import { contextoEmpresa, normalizarMateriais, salvarMateriais, listarMateriais } from "./materiais";
import { ErroIA, type Meta } from "./ai";
import { apagarDoProjeto as apagarAssetsDoProjeto, listar as listarAssets, montarBlocoAssets } from "./assets";
import { apagarDoProjeto as apagarVisitasDoProjeto } from "./metricas";
import { ErroCaptura, enderecoPublico as validarEnderecoPublico, lerReferencia } from "./captura";
import { construirSite, type Insumo } from "./construtor";
import { ACAO_ESCOLHER_MODELO, ErroDePedido, normalizarMarca, normalizarStack, salvarPaginaConstruida, validarImagem, type OpcoesAssets } from "./gerador";
import { apagar as apagarResultado, obter as obterResultado } from "./historico";
import { abrirBanco } from "./store";
import type { EntradaPagina, ErroProjeto, EstadoProjeto, Marca, OrigemProjeto, Pagina, ProgressoGeracao, Projeto, PublicacaoExterna, Stack, Versao } from "./types";

const ESTADOS: EstadoProjeto[] = ["rascunho", "gerando", "pronto", "falhou"];
/** Depois disso em `gerando` sem nenhuma etapa concluída, o laço de 60 s (instrumentation.ts) encerra a geração como falha. */
export const LIMITE_GERACAO_MS = 15 * 60 * 1000;
export const LIMITE_BRIEFING = 4000;
/** Nome dado quando ninguém informou um (ex.: POST /api/pagina antigo): trocado pelo título da página ao ficar pronto. */
export const NOME_AUTOMATICO = "Novo site";
/** Slugs que se confundiriam com rotas do app ou com a pasta de assets (/s/<id>/a/...). */
const SLUGS_RESERVADOS = new Set(["a", "api", "s", "r", "f", "mcp", "setup", "entrar", "conta", "historico", "sites", "imprimir", "novo", "admin"]);
const SLUG_VALIDO = /^[a-z0-9-]{3,60}$/;

let tabelaPronta = false;
function db() {
  const d = abrirBanco();
  if (!tabelaPronta) {
    d.exec(`CREATE TABLE IF NOT EXISTS projetos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      estado TEXT NOT NULL,
      origem TEXT NOT NULL,
      stack TEXT NOT NULL,
      instrucoes TEXT NULL,
      briefing TEXT NULL,
      marca TEXT NULL,
      tamanhoImagem INTEGER NOT NULL DEFAULT 0,
      imagem TEXT NULL,
      paginaId TEXT NULL,
      versaoPublicada INTEGER NULL,
      dominio TEXT NULL,
      erro TEXT NULL,
      criadoEm TEXT NOT NULL,
      atualizadoEm TEXT NOT NULL,
      terminadoEm TEXT NULL,
      vistoEm TEXT NULL
    )`);
    d.exec(`CREATE INDEX IF NOT EXISTS projetos_estado ON projetos (estado, atualizadoEm)`);
    // Colunas que nasceram depois da tabela (21/09/2026): endereço de referência, andamento por etapas, prévia
    // parcial e publicação externa. `ALTER TABLE ... ADD COLUMN` só quando a coluna ainda não existe.
    const existentes = new Set((d.prepare("PRAGMA table_info(projetos)").all() as { name: string }[]).map((c) => c.name));
    for (const [coluna, tipo] of [["url", "TEXT NULL"], ["progresso", "TEXT NULL"], ["htmlParcial", "TEXT NULL"], ["netlify", "TEXT NULL"], ["render", "TEXT NULL"]] as const) {
      if (!existentes.has(coluna)) d.exec(`ALTER TABLE projetos ADD COLUMN ${coluna} ${tipo}`);
    }
    tabelaPronta = true;
  }
  return d;
}

type Linha = {
  id: string; nome: string; slug: string; estado: EstadoProjeto; origem: OrigemProjeto; stack: Stack;
  instrucoes: string | null; briefing: string | null; url: string | null; marca: string | null; tamanhoImagem: number;
  paginaId: string | null; versaoPublicada: number | null; dominio: string | null; progresso: string | null; netlify: string | null; render: string | null; erro: string | null;
  criadoEm: string; atualizadoEm: string; terminadoEm: string | null; vistoEm: string | null;
};

// Nunca `SELECT *`: a coluna `imagem` (até 5 MB em base64) só sai por imagemDe(); `htmlParcial` só por progressoDe().
const COLUNAS = "id, nome, slug, estado, origem, stack, instrucoes, briefing, url, marca, tamanhoImagem, paginaId, versaoPublicada, dominio, progresso, netlify, render, erro, criadoEm, atualizadoEm, terminadoEm, vistoEm";

function paraProjeto(l: Linha): Projeto {
  const p: Projeto = {
    id: l.id, nome: l.nome, slug: l.slug, estado: l.estado, origem: l.origem, stack: l.stack,
    tamanhoImagem: l.tamanhoImagem, criadoEm: l.criadoEm, atualizadoEm: l.atualizadoEm,
  };
  if (l.instrucoes) p.instrucoes = l.instrucoes;
  if (l.briefing) p.briefing = l.briefing;
  if (l.url) p.url = l.url;
  if (l.marca) { try { p.marca = JSON.parse(l.marca) as Marca; } catch { /* marca corrompida: segue sem */ } }
  if (l.paginaId) p.paginaId = l.paginaId;
  if (l.versaoPublicada) p.versaoPublicada = l.versaoPublicada;
  if (l.dominio) p.dominio = l.dominio;
  if (l.progresso) { try { p.progresso = JSON.parse(l.progresso) as ProgressoGeracao; } catch { /* andamento corrompido: segue sem */ } }
  if (l.netlify) { try { p.netlify = JSON.parse(l.netlify) as PublicacaoExterna; } catch { /* segue sem */ } }
  if (l.render) { try { p.render = JSON.parse(l.render) as PublicacaoExterna; } catch { /* segue sem */ } }
  if (l.erro) { try { p.erro = JSON.parse(l.erro) as ErroProjeto; } catch { p.erro = { mensagem: l.erro }; } }
  if (l.terminadoEm) p.terminadoEm = l.terminadoEm;
  if (l.vistoEm) p.vistoEm = l.vistoEm;
  return p;
}

function agora(): string {
  return new Date().toISOString();
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/** Projeto inexistente (vira 404 na rota HTTP). */
export class ProjetoNaoEncontrado extends Error {
  constructor() {
    super("Esse site não existe mais. Crie um novo.");
  }
}

// ---------------------------------------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------------------------------------

/** "Clínica São Lucas" → "clinica-sao-lucas". Sem acento, minúsculas, hifens; 3 a 60 caracteres. */
export function slugDe(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  const ajustado = base.length >= 3 ? base : `site-${base}`.replace(/-+$/g, "");
  return SLUGS_RESERVADOS.has(ajustado) ? `${ajustado}-site` : ajustado;
}

function slugLivre(slug: string, ignorarId?: string): boolean {
  const linha = db().prepare("SELECT id FROM projetos WHERE slug = ?").get(slug) as { id: string } | undefined;
  return !linha || linha.id === ignorarId;
}

/** Primeiro slug livre a partir do nome: "loja", "loja-2", "loja-3"... */
function slugUnico(nome: string, ignorarId?: string): string {
  const base = slugDe(nome);
  if (slugLivre(base, ignorarId)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidato = `${base.slice(0, 60 - String(n).length - 1)}-${n}`;
    if (slugLivre(candidato, ignorarId)) return candidato;
  }
  return `${base.slice(0, 48)}-${crypto.randomBytes(3).toString("hex")}`;
}

// ---------------------------------------------------------------------------------------------------------
// Criar, ler, listar, editar, apagar
// ---------------------------------------------------------------------------------------------------------

export type NovoProjeto = {
  nome?: unknown;
  origem?: unknown;
  stack?: unknown;
  instrucoes?: unknown;
  briefing?: unknown;
  url?: unknown;
  marca?: unknown;
  imagem?: unknown;
  materiais?: unknown;
};

function textoCurto(valor: unknown, limite: number): string | undefined {
  if (typeof valor !== "string") return undefined;
  const t = valor.trim();
  return t ? t.slice(0, limite) : undefined;
}

/**
 * Nome de site a partir do título de uma página: fica com a parte antes do separador ("Nimbus Finanças · Gestão
 * financeira" → "Nimbus Finanças") quando ela tem pelo menos 3 caracteres; senão corta em 60 numa fronteira de palavra.
 */
export function nomeCurto(titulo: string): string {
  const limpo = titulo.replace(/\s+/g, " ").trim();
  const parte = limpo.split(/\s+[·|–—-]\s+/)[0]?.trim() ?? "";
  const base = parte.length >= 3 ? parte : limpo;
  if (base.length <= 60) return base || NOME_AUTOMATICO;
  const corte = base.slice(0, 60);
  return (corte.lastIndexOf(" ") > 30 ? corte.slice(0, corte.lastIndexOf(" ")) : corte).trim();
}

/** Nome sugerido a partir do endereço de referência: "www.loja-aurora.com.br" → "loja-aurora.com.br". */
function nomeDoEndereco(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").slice(0, 80);
  } catch {
    return NOME_AUTOMATICO;
  }
}

/**
 * Valida e grava um projeto em `rascunho`. A origem define o insumo obrigatório: captura em "referencia", endereço
 * público em "endereco", texto (mínimo 20 caracteres) em "briefing". Tudo o mais é opcional: sem nome, o site nasce
 * "Novo site" (ou com o domínio da referência) e recebe o título da página ao ficar pronto; sem marca, a IA mantém as
 * cores da referência. Refinar (marca, logo, textos) acontece depois, no workspace, pelo agente.
 */
export function criar(dados: NovoProjeto): Projeto {
  const materiais = normalizarMateriais(dados.materiais);
  const origem: OrigemProjeto = dados.origem === "briefing" ? "briefing" : dados.origem === "endereco" ? "endereco" : "referencia";
  const marca = normalizarMarca(dados.marca);
  if (marca.erro) throw new ErroDePedido(marca.erro);
  const briefing = textoCurto(dados.briefing, LIMITE_BRIEFING);
  let imagem: string | null = null;
  let tamanhoImagem = 0;
  let url: string | null = null;
  if (origem === "referencia") {
    const v = validarImagem(dados.imagem);
    if (!v.ok) throw new ErroDePedido(v.erro);
    imagem = dados.imagem as string;
    tamanhoImagem = v.tamanho;
  } else if (origem === "endereco") {
    if (typeof dados.url !== "string" || !dados.url.trim()) throw new ErroDePedido("Cole o endereço do site de referência, começando com https://.");
    try {
      url = validarEnderecoPublico(dados.url).toString();
    } catch (err) {
      throw new ErroDePedido(err instanceof ErroCaptura ? err.message : "Informe um endereço completo, começando com https://.");
    }
  } else if ((!briefing || briefing.length < 20) && !materiais.length) {
    throw new ErroDePedido("Conte em pelo menos uma frase o que a empresa faz e o que o site precisa ter.");
  }
  const nome = textoCurto(dados.nome, 80) || marca.marca?.nome?.trim() || (url ? nomeDoEndereco(url) : NOME_AUTOMATICO);
  const id = gerarId();
  const t = agora();
  db().prepare(`INSERT INTO projetos (id, nome, slug, estado, origem, stack, instrucoes, briefing, url, marca, tamanhoImagem, imagem, criadoEm, atualizadoEm)
                VALUES (?, ?, ?, 'rascunho', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, nome, slugUnico(nome), origem, normalizarStack(dados.stack), textoCurto(dados.instrucoes, 4000) ?? null, briefing ?? null, url, marca.marca ? JSON.stringify(marca.marca) : null, tamanhoImagem, imagem, t, t);
  salvarMateriais(id, materiais);
  return obterOuFalhar(id);
}

/** Andamento da geração e a prévia parcial (só esta função lê `htmlParcial`, que pode ter dezenas de KB). */
export function progressoDe(id: string): { progresso: ProgressoGeracao | null; htmlParcial: string | null } {
  const linha = db().prepare("SELECT progresso, htmlParcial FROM projetos WHERE id = ?").get(id) as { progresso: string | null; htmlParcial: string | null } | undefined;
  let progresso: ProgressoGeracao | null = null;
  if (linha?.progresso) { try { progresso = JSON.parse(linha.progresso) as ProgressoGeracao; } catch { progresso = null; } }
  return { progresso, htmlParcial: linha?.htmlParcial ?? null };
}

function gravarProgresso(id: string, progresso: ProgressoGeracao, htmlParcial: string | null): void {
  db().prepare("UPDATE projetos SET progresso = ?, htmlParcial = COALESCE(?, htmlParcial), atualizadoEm = ? WHERE id = ? AND estado = 'gerando'")
    .run(JSON.stringify(progresso), htmlParcial, agora(), id);
}

/** Persiste o destino e seu histórico juntos; uma implantação pendente não altera a versão no ar. */
export function definirPublicacaoExterna(id: string, dados: PublicacaoExterna | null, destino: "netlify" | "render" = "netlify"): Projeto {
  const p = obterOuFalhar(id);
  const anterior = p[destino];
  const d = db();
  d.exec("SAVEPOINT publicar_externo");
  try {
    if (dados?.versao && (!dados.estado || dados.estado === "pronto") && (dados.deployId !== anterior?.deployId || dados.versao !== anterior?.versao || anterior?.estado === "publicando")) registrarPublicacao({ projetoId: id, destino, versao: dados.versao, anterior: anterior?.versao ?? null, tipo: dados.rollback || dados.versao < (anterior?.versao ?? 0) ? "rollback" : "publicacao", url: dados.url, deployId: dados.deployId ?? null });
    d.prepare(`UPDATE projetos SET ${destino} = ?, atualizadoEm = ? WHERE id = ?`).run(dados ? JSON.stringify(dados) : null, agora(), id);
    d.exec("RELEASE publicar_externo");
  } catch (err) { d.exec("ROLLBACK TO publicar_externo; RELEASE publicar_externo"); throw err; }
  return obterOuFalhar(id);
}

export function obter(id: string): Projeto | null {
  const linha = db().prepare(`SELECT ${COLUNAS} FROM projetos WHERE id = ?`).get(id) as Linha | undefined;
  return linha ? paraProjeto(linha) : null;
}

function obterOuFalhar(id: string): Projeto {
  const p = obter(id);
  if (!p) throw new ProjetoNaoEncontrado();
  return p;
}

/** O projeto dono de uma página do histórico (para /r/[id] apontar para o workspace), ou null para páginas antigas sem site. */
export function projetoDaPagina(paginaId: string): Projeto | null {
  const linha = db().prepare(`SELECT ${COLUNAS} FROM projetos WHERE paginaId = ?`).get(paginaId) as Linha | undefined;
  return linha ? paraProjeto(linha) : null;
}

/** Aceita o slug ou o id (os dois aparecem em links). */
export function obterPorSlug(slugOuId: string): Projeto | null {
  const linha = db().prepare(`SELECT ${COLUNAS} FROM projetos WHERE slug = ? OR id = ?`).get(slugOuId, slugOuId) as Linha | undefined;
  return linha ? paraProjeto(linha) : null;
}

export function listar({ estado, limite = 50 }: { estado?: string; limite?: number } = {}): Projeto[] {
  const filtro = estado && (ESTADOS as string[]).includes(estado) ? estado : undefined;
  const linhas = (filtro
    ? db().prepare(`SELECT ${COLUNAS} FROM projetos WHERE estado = ? ORDER BY criadoEm DESC LIMIT ?`).all(filtro, limite)
    : db().prepare(`SELECT ${COLUNAS} FROM projetos ORDER BY criadoEm DESC LIMIT ?`).all(limite)) as Linha[];
  return linhas.map(paraProjeto);
}

/** A captura guardada (data URL) — só para gerar em segundo plano e para "Tentar de novo". Nula depois de `pronto`. */
export function imagemDe(id: string): string | null {
  const linha = db().prepare("SELECT imagem FROM projetos WHERE id = ?").get(id) as { imagem: string | null } | undefined;
  return linha?.imagem ?? null;
}

export function renomear(id: string, nome: unknown): Projeto {
  const texto = textoCurto(nome, 80);
  if (!texto) throw new ErroDePedido("Dê um nome ao site.");
  obterOuFalhar(id);
  db().prepare("UPDATE projetos SET nome = ?, atualizadoEm = ? WHERE id = ?").run(texto, agora(), id);
  return obterOuFalhar(id);
}

/** Troca a parte legível do link. Minúsculas, números e hifens (3 a 60); precisa estar livre. */
export function definirSlug(id: string, slug: unknown): Projeto {
  const texto = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  if (!SLUG_VALIDO.test(texto)) throw new ErroDePedido("Use de 3 a 60 caracteres: letras minúsculas, números e hifens, como minha-empresa.");
  if (SLUGS_RESERVADOS.has(texto)) throw new ErroDePedido("Esse endereço é reservado. Escolha outro.");
  obterOuFalhar(id);
  if (!slugLivre(texto, id)) throw new ErroDePedido("Esse endereço já está em uso por outro site. Escolha outro.");
  db().prepare("UPDATE projetos SET slug = ?, atualizadoEm = ? WHERE id = ?").run(texto, agora(), id);
  return obterOuFalhar(id);
}

// ---------------------------------------------------------------------------------------------------------
// Domínio personalizado: quando o Host da requisição é o domínio de um projeto, proxy.ts serve a versão
// publicada dele na raiz. Cache de 60 s para não consultar o banco a cada asset.
// ---------------------------------------------------------------------------------------------------------

const DOMINIO_VALIDO = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
// Curto de propósito: o proxy (bundle do middleware) e as rotas são módulos separados no Next, então o cache de um não é
// invalidado pelo outro — 5 s é o atraso máximo entre salvar o domínio e ele responder, e ainda poupa o banco a cada asset.
const CACHE_DOMINIO_MS = 5_000;
let cacheDominios: { at: number; mapa: Map<string, string> } | null = null;

/** "https://WWW.Minha-Empresa.com.br/" → "www.minha-empresa.com.br"; lança ErroDePedido quando não é um domínio. */
export function normalizarDominio(bruto: unknown): string {
  let texto = typeof bruto === "string" ? bruto.trim().toLowerCase() : "";
  texto = texto.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (!DOMINIO_VALIDO.test(texto)) throw new ErroDePedido("Informe um domínio válido, como www.minhaempresa.com.br (sem https:// e sem barras).");
  return texto;
}

/** Grava (ou remove, com null) o domínio próprio do site; único entre os projetos. */
export function definirDominio(id: string, dominio: unknown): Projeto {
  obterOuFalhar(id);
  if (dominio === null || dominio === "" || dominio === undefined) {
    db().prepare("UPDATE projetos SET dominio = NULL, atualizadoEm = ? WHERE id = ?").run(agora(), id);
  } else {
    const limpo = normalizarDominio(dominio);
    const dono = db().prepare("SELECT id FROM projetos WHERE dominio = ? AND id != ?").get(limpo, id) as { id: string } | undefined;
    if (dono) throw new ErroDePedido("Esse domínio já está em uso por outro site desta instalação.");
    db().prepare("UPDATE projetos SET dominio = ?, atualizadoEm = ? WHERE id = ?").run(limpo, agora(), id);
  }
  cacheDominios = null;
  return obterOuFalhar(id);
}

/** O id do projeto dono do Host (sem porta; aceita com e sem "www."), ou null. Cache de 60 s em memória. */
export function projetoDoDominio(hostBruto: string | null | undefined): string | null {
  if (!hostBruto) return null;
  const host = hostBruto.toLowerCase().split(":")[0].replace(/\.$/, "");
  if (!host.includes(".") || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(host)) return null;
  if (!cacheDominios || Date.now() - cacheDominios.at > CACHE_DOMINIO_MS) {
    const linhas = db().prepare("SELECT id, dominio FROM projetos WHERE dominio IS NOT NULL").all() as { id: string; dominio: string }[];
    cacheDominios = { at: Date.now(), mapa: new Map(linhas.map((l) => [l.dominio, l.id])) };
  }
  const mapa = cacheDominios.mapa;
  const semWww = host.replace(/^www\./, "");
  return mapa.get(host) ?? mapa.get(semWww) ?? mapa.get(`www.${semWww}`) ?? null;
}

/**
 * Campos do pedido. A marca pode mudar a qualquer momento (o agente passa a conhecê-la e aplica no site a pedido);
 * insumo (briefing, endereço), instruções e formato só antes de gerar ou depois de uma falha.
 */
export function editarPedido(id: string, dados: { marca?: unknown; instrucoes?: unknown; briefing?: unknown; stack?: unknown; url?: unknown; origem?: unknown; imagem?: unknown }): Projeto {
  const p = obterOuFalhar(id);
  const soMarca = Object.entries(dados).every(([chave, valor]) => chave === "marca" || valor === undefined);
  if (!soMarca && p.estado !== "rascunho" && p.estado !== "falhou") throw new ErroDePedido("O pedido só pode ser alterado antes de gerar ou depois de uma falha. Para mudar o site pronto, peça ao agente.");
  const sets: string[] = [];
  const valores: (string | null)[] = [];
  const origem = dados.origem === undefined ? p.origem : dados.origem;
  if (!["referencia", "endereco", "briefing"].includes(String(origem))) throw new ErroDePedido("Escolha uma descrição, documentos ou uma referência para criar o site.");
  if (dados.origem !== undefined) { sets.push("origem = ?"); valores.push(String(origem)); }
  if (origem === "referencia" && (dados.imagem || p.origem !== "referencia")) {
    const validacao = validarImagem(dados.imagem);
    if (!validacao.ok) throw new ErroDePedido(validacao.erro);
    sets.push("imagem = ?", "tamanhoImagem = ?"); valores.push(String(dados.imagem), String(validacao.tamanho));
  }
  if (dados.marca !== undefined) {
    const marca = normalizarMarca(dados.marca);
    if (marca.erro) throw new ErroDePedido(marca.erro);
    sets.push("marca = ?");
    valores.push(marca.marca ? JSON.stringify(marca.marca) : null);
  }
  if (dados.instrucoes !== undefined) { sets.push("instrucoes = ?"); valores.push(textoCurto(dados.instrucoes, 4000) ?? null); }
  if (dados.briefing !== undefined) {
    const briefing = textoCurto(dados.briefing, LIMITE_BRIEFING);
    if (origem === "briefing" && (!briefing || briefing.length < 20) && !listarMateriais(id).length) throw new ErroDePedido("Conte em pelo menos uma frase o que a empresa faz e o que o site precisa ter.");
    sets.push("briefing = ?"); valores.push(briefing ?? null);
  }
  if (dados.stack !== undefined) { sets.push("stack = ?"); valores.push(normalizarStack(dados.stack)); }
  if (origem === "endereco" && (dados.url !== undefined || p.origem !== "endereco")) {
    if (typeof dados.url !== "string" || !dados.url.trim()) throw new ErroDePedido("Cole o endereço do site de referência, começando com https://.");
    try { sets.push("url = ?"); valores.push(validarEnderecoPublico(dados.url).toString()); } catch (err) { throw new ErroDePedido(err instanceof ErroCaptura ? err.message : "Informe um endereço completo, começando com https://."); }
  }
  if (!sets.length) return p;
  sets.push("atualizadoEm = ?");
  valores.push(agora());
  db().prepare(`UPDATE projetos SET ${sets.join(", ")} WHERE id = ?`).run(...valores, id);
  return obterOuFalhar(id);
}

/** Apaga o projeto, a página do histórico e as imagens (o link /s/<slug> passa a responder 404). */
export function apagar(id: string): void {
  const p = obter(id);
  if (!p) return;
  if (p.paginaId) apagarResultado(p.paginaId);
  apagarAssetsDoProjeto(id);
  salvarMateriais(id, []);
  apagarVisitasDoProjeto(id);
  apagarPublicacoes(id);
  apagarReleases(id);
  db().prepare("DELETE FROM projetos WHERE id = ?").run(id);
}

export function apagarTodos(): void {
  for (const p of listar({ limite: 10_000 })) apagar(p.id);
}

export function marcarVisto(id: string): void {
  db().prepare("UPDATE projetos SET vistoEm = ? WHERE id = ? AND vistoEm IS NULL").run(agora(), id);
}

// ---------------------------------------------------------------------------------------------------------
// Página e versões
// ---------------------------------------------------------------------------------------------------------

export type PaginaSalva = { pagina: Pagina; meta: Meta; entrada: EntradaPagina };

/** A página do histórico apontada pelo projeto (com as versões), ou null quando ainda não há. */
export function paginaDoProjeto(p: Projeto): PaginaSalva | null {
  if (!p.paginaId) return null;
  const registro = obterResultado<EntradaPagina, Pagina, Meta>(p.paginaId);
  if (!registro || registro.tipo !== "pagina" || !Array.isArray(registro.saida?.versoes) || registro.saida.versoes.length === 0) return null;
  return { pagina: { ...registro.saida, id: registro.id }, meta: registro.meta, entrada: registro.entrada };
}

/** A versão explicitamente publicada em /s/<slug>; null enquanto só houver rascunho. */
export function versaoPublicadaDe(p: Projeto): { titulo: string; versao: Versao } | null {
  if (!p.versaoPublicada) return null;
  const salva = paginaDoProjeto(p);
  if (!salva) return null;
  const versoes = salva.pagina.versoes;
  const alvo = versoes.find((v) => v.n === p.versaoPublicada) ?? versoes[versoes.length - 1];
  return { titulo: salva.pagina.titulo, versao: alvo };
}

/** Publica a versão n (padrão: a última). As edições continuam criando versões novas sem mexer no que está no ar. */
export function publicar(id: string, n?: unknown, rollback = false): { projeto: Projeto; versao: Versao } {
  const p = obterOuFalhar(id);
  const salva = paginaDoProjeto(p);
  if (p.estado !== "pronto" || !salva) throw new ErroDePedido("O site ainda não foi gerado. Publique depois de ficar pronto.");
  const versoes = salva.pagina.versoes;
  const alvo = n === undefined || n === null ? versoes[versoes.length - 1] : versoes.find((v) => v.n === Number(n));
  if (!alvo) throw new ErroDePedido("Essa versão não existe.");
  const historico = listarPublicacoes(id);
  if (rollback && !historico.some((h) => h.destino === "local" && h.versao === alvo.n)) throw new ErroDePedido("Escolha uma versão que já foi publicada neste endereço.");
  const d = db();
  d.exec("SAVEPOINT publicar_site");
  try {
    registrarPublicacao({ projetoId: id, destino: "local", versao: alvo.n, anterior: p.versaoPublicada ?? null, tipo: rollback || alvo.n < (p.versaoPublicada ?? 0) ? "rollback" : "publicacao", url: `/s/${p.slug}`, deployId: null });
    d.prepare("UPDATE projetos SET versaoPublicada = ?, atualizadoEm = ? WHERE id = ?").run(alvo.n, agora(), id);
    d.exec("RELEASE publicar_site");
  } catch (err) { d.exec("ROLLBACK TO publicar_site; RELEASE publicar_site"); throw err; }
  return { projeto: obterOuFalhar(id), versao: alvo };
}

// ---------------------------------------------------------------------------------------------------------
// Geração em segundo plano
// ---------------------------------------------------------------------------------------------------------

/** Logo e imagens do site, no formato que os geradores e o agente esperam (prompt + demonstração). */
export function opcoesAssetsDe(projetoId: string): OpcoesAssets {
  const assets = listarAssets(projetoId);
  if (!assets.length) return {};
  const logo = assets.find((a) => a.papel === "logo");
  return {
    blocoAssets: montarBlocoAssets(projetoId),
    demoAssets: { logoUrl: logo?.url, imagens: assets.filter((a) => a.papel === "imagem").map((a) => ({ url: a.url, descricao: a.descricao || a.nome })) },
  };
}

/** Traduz qualquer falha da geração para o formato gravado no projeto: nunca o corpo do provedor. */
function erroDe(err: unknown): ErroProjeto {
  if (err instanceof ErroIA) {
    const e: ErroProjeto = { mensagem: err.message, codigo: err.codigo };
    if (err.acao) e.acao = err.acao;
    return e;
  }
  if (err instanceof ErroCaptura) return err.acao ? { mensagem: err.message, acao: err.acao } : { mensagem: err.message };
  if (err instanceof Error && err.message) return { mensagem: err.message };
  return { mensagem: "Não foi possível gerar o site desta vez. Tente de novo." };
}

function gravarFalha(id: string, erro: ErroProjeto): void {
  const t = agora();
  db().prepare("UPDATE projetos SET estado = 'falhou', erro = ?, htmlParcial = NULL, terminadoEm = ?, atualizadoEm = ?, vistoEm = NULL WHERE id = ? AND estado = 'gerando'")
    .run(JSON.stringify(erro), t, t, id);
}

/**
 * Corre fora da requisição HTTP. Constrói a página por etapas (lib/construtor.ts) gravando o andamento e a prévia
 * parcial no projeto a cada passo; em sucesso grava `pronto`, `paginaId`, `versaoPublicada` vazio até publicar e APAGA a imagem
 * (a captura não fica guardada depois de servir); em falha grava `falhou` com o motivo e mantém a imagem para
 * "Tentar de novo" sem reenviar.
 */
async function executarGeracao(id: string): Promise<void> {
  const p = obter(id);
  if (!p || p.estado !== "gerando") return;
  try {
    const opcoes = opcoesAssetsDe(id);
    let insumo: Insumo;
    let tituloReferencia: string | null = null;
    if (p.origem === "briefing") {
      insumo = { tipo: "briefing", briefing: p.briefing ?? "" };
    } else if (p.origem === "endereco") {
      if (!p.url) throw new ErroDePedido("O endereço de referência deste site não foi guardado. Crie o site de novo.");
      const referencia = await lerReferencia(p.url);
      tituloReferencia = referencia.titulo;
      insumo = { tipo: "endereco", referencia };
    } else {
      const imagem = imagemDe(id);
      if (!imagem) throw new ErroDePedido("A captura deste site não está mais guardada. Crie o site de novo.");
      insumo = { tipo: "referencia", imagem };
    }
    const construido = await construirSite({ insumo, stack: p.stack, marca: p.marca, contexto: contextoEmpresa(id, p.briefing), instrucoes: p.instrucoes, assets: opcoes }, (progresso, htmlParcial) => gravarProgresso(id, progresso, htmlParcial));
    const entrada: EntradaPagina = { stack: p.stack, tamanhoImagem: p.tamanhoImagem, ...(p.instrucoes ? { instrucoes: p.instrucoes } : {}), ...(p.marca ? { marca: p.marca } : {}), ...(p.briefing ? { briefing: p.briefing } : {}), ...(p.url ? { url: p.url } : {}) };
    const rotulo = p.origem === "briefing" ? "Site criado a partir do briefing" : p.origem === "endereco" ? "Site criado a partir do endereço de referência" : "Página gerada a partir da captura";
    const pagina: Pagina = salvarPaginaConstruida(entrada, construido.html, construido.meta, rotulo, p.marca);
    const t = agora();
    // Quem deu nome ao site mantém o nome (e o slug). Sem nome: a marca, o título do site de referência ou o título da página, encurtados.
    const nomeAutomatico = p.nome === NOME_AUTOMATICO || (p.url && p.nome === nomeDoEndereco(p.url));
    const nomeFinal = nomeAutomatico ? nomeCurto(p.marca?.nome?.trim() || tituloReferencia || pagina.titulo) : p.nome;
    const slugFinal = nomeFinal !== p.nome ? slugUnico(nomeFinal, id) : p.slug;
    db().prepare(`UPDATE projetos SET estado = 'pronto', paginaId = ?, versaoPublicada = NULL, imagem = NULL, htmlParcial = NULL, erro = NULL, progresso = ?,
                  nome = ?, slug = ?, terminadoEm = ?, atualizadoEm = ?, vistoEm = NULL WHERE id = ? AND estado = 'gerando'`)
      .run(pagina.id, JSON.stringify(construido.progresso), nomeFinal, slugFinal, t, t, id);
  } catch (err) {
    if (!(err instanceof ErroIA) && !(err instanceof ErroDePedido) && !(err instanceof ErroCaptura)) console.error("Falha ao gerar o site", id, err);
    gravarFalha(id, erroDe(err));
  }
}

/** Dispara a geração e devolve na hora (o projeto já em `gerando`). Só de `rascunho` ou `falhou`. */
export function iniciarGeracao(id: string): Projeto {
  const p = obterOuFalhar(id);
  if (p.estado === "gerando") throw new ErroDePedido("Este site já está sendo gerado.");
  if (p.estado === "pronto") throw new ErroDePedido("Este site já está pronto. Para mudar algo, peça ao agente.");
  const t = agora();
  db().prepare("UPDATE projetos SET estado = 'gerando', erro = NULL, progresso = NULL, htmlParcial = NULL, terminadoEm = NULL, atualizadoEm = ? WHERE id = ?").run(t, id);
  void executarGeracao(id);
  return obterOuFalhar(id);
}

/** Espera a geração terminar (para as portas antigas, POST /api/pagina e a ferramenta MCP, que respondem só no fim). */
export async function aguardarGeracao(id: string, limiteMs = LIMITE_GERACAO_MS): Promise<Projeto> {
  const inicio = Date.now();
  for (;;) {
    const p = obterOuFalhar(id);
    if (p.estado !== "gerando") return p;
    if (Date.now() - inicio > limiteMs) throw new ErroIA("provedor_fora", "A geração está demorando mais do que o esperado. Acompanhe o site na tela inicial.", 504);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Encerra o que ficou preso em `gerando`: na subida do processo (`naSubida: true`) tudo o que estava
 * gerando morreu com o processo anterior; no laço de 60 s, só o que está há mais de LIMITE_GERACAO_MS SEM
 * PROGRESSO (cada etapa concluída renova `atualizadoEm`, então uma construção longa mas viva não é encerrada).
 */
export function encerrarAbandonados({ naSubida = false }: { naSubida?: boolean } = {}): number {
  const presos = naSubida
    ? (db().prepare(`SELECT ${COLUNAS} FROM projetos WHERE estado = 'gerando'`).all() as Linha[])
    : (db().prepare(`SELECT ${COLUNAS} FROM projetos WHERE estado = 'gerando' AND atualizadoEm < ?`).all(new Date(Date.now() - LIMITE_GERACAO_MS).toISOString()) as Linha[]);
  for (const l of presos) {
    gravarFalha(
      l.id,
      naSubida
        ? { mensagem: "O servidor reiniciou durante a geração. Tente de novo." }
        : { mensagem: "A geração passou de 15 minutos e foi encerrada. Tente de novo ou escolha um modelo mais rápido.", acao: ACAO_ESCOLHER_MODELO }
    );
  }
  return presos.length;
}

// ---------------------------------------------------------------------------------------------------------
// Avisos (sino do cabeçalho)
// ---------------------------------------------------------------------------------------------------------

export type Aviso = { id: string; texto: string; url: string };

/** Projetos que terminaram (pronto ou falhou) e ainda não foram abertos, mais recentes primeiro, até 10. */
export function avisos(): Aviso[] {
  const linhas = db()
    .prepare(`SELECT ${COLUNAS} FROM projetos WHERE estado IN ('pronto', 'falhou') AND vistoEm IS NULL ORDER BY terminadoEm DESC LIMIT 10`)
    .all() as Linha[];
  return linhas.map((l) => {
    const p = paraProjeto(l);
    const texto = p.estado === "pronto"
      ? p.versaoPublicada ? `«${p.nome}» está no ar.` : `«${p.nome}» está pronto para revisar.`
      : `«${p.nome}» não pôde ser gerado: ${(p.erro?.mensagem ?? "tente de novo").replace(/\.$/, "")}.`;
    return { id: p.id, texto, url: `/sites/${p.id}` };
  });
}

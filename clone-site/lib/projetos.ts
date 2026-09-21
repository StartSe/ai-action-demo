// Site = projeto: nome, marca, origem (captura de referência ou briefing), estado e a página gerada (que
// continua no histórico, lib/historico.ts, com as suas versões). Próprio do app (nunca comparado por
// scripts/verificar-padrao.sh). Tabela `projetos` no mesmo app.sqlite de lib/store.ts.
//
// Estados: rascunho → gerando → pronto | falhou; falhou → gerando ("Tentar de novo"). A geração corre em
// segundo plano (promessa sem await, mesmo desenho de videos-campanha/lib/videos.ts): a rota responde 202 e
// a tela consulta obter(id) a cada 5 s. A captura fica guardada na linha só até `pronto` (para gerar sem a
// aba aberta e para "Tentar de novo" sem reenviar) e é apagada em seguida.
import crypto from "node:crypto";
import { ErroIA, type Meta } from "./ai";
import { ACAO_ESCOLHER_MODELO, ErroDePedido, gerarDoBriefing, gerarPagina, normalizarMarca, normalizarStack, validarImagem } from "./gerador";
import { apagar as apagarResultado, obter as obterResultado } from "./historico";
import { abrirBanco } from "./store";
import type { EntradaPagina, ErroProjeto, EstadoProjeto, Marca, OrigemProjeto, Pagina, Projeto, Stack, Versao } from "./types";

const ESTADOS: EstadoProjeto[] = ["rascunho", "gerando", "pronto", "falhou"];
/** Depois disso em `gerando`, o laço de 60 s (instrumentation.ts) encerra a geração como falha. */
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
    tabelaPronta = true;
  }
  return d;
}

type Linha = {
  id: string; nome: string; slug: string; estado: EstadoProjeto; origem: OrigemProjeto; stack: Stack;
  instrucoes: string | null; briefing: string | null; marca: string | null; tamanhoImagem: number;
  paginaId: string | null; versaoPublicada: number | null; dominio: string | null; erro: string | null;
  criadoEm: string; atualizadoEm: string; terminadoEm: string | null; vistoEm: string | null;
};

// Nunca `SELECT *`: a coluna `imagem` (até 5 MB em base64) só sai por imagemDe().
const COLUNAS = "id, nome, slug, estado, origem, stack, instrucoes, briefing, marca, tamanhoImagem, paginaId, versaoPublicada, dominio, erro, criadoEm, atualizadoEm, terminadoEm, vistoEm";

function paraProjeto(l: Linha): Projeto {
  const p: Projeto = {
    id: l.id, nome: l.nome, slug: l.slug, estado: l.estado, origem: l.origem, stack: l.stack,
    tamanhoImagem: l.tamanhoImagem, criadoEm: l.criadoEm, atualizadoEm: l.atualizadoEm,
  };
  if (l.instrucoes) p.instrucoes = l.instrucoes;
  if (l.briefing) p.briefing = l.briefing;
  if (l.marca) { try { p.marca = JSON.parse(l.marca) as Marca; } catch { /* marca corrompida: segue sem */ } }
  if (l.paginaId) p.paginaId = l.paginaId;
  if (l.versaoPublicada) p.versaoPublicada = l.versaoPublicada;
  if (l.dominio) p.dominio = l.dominio;
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
  marca?: unknown;
  imagem?: unknown;
};

function textoCurto(valor: unknown, limite: number): string | undefined {
  if (typeof valor !== "string") return undefined;
  const t = valor.trim();
  return t ? t.slice(0, limite) : undefined;
}

/** Valida e grava um projeto em `rascunho`. Imagem obrigatória só na origem "referencia"; briefing só em "briefing". */
export function criar(dados: NovoProjeto): Projeto {
  const origem: OrigemProjeto = dados.origem === "briefing" ? "briefing" : "referencia";
  const marca = normalizarMarca(dados.marca);
  if (marca.erro) throw new ErroDePedido(marca.erro);
  const briefing = textoCurto(dados.briefing, LIMITE_BRIEFING);
  let imagem: string | null = null;
  let tamanhoImagem = 0;
  if (origem === "referencia") {
    const v = validarImagem(dados.imagem);
    if (!v.ok) throw new ErroDePedido(v.erro);
    imagem = dados.imagem as string;
    tamanhoImagem = v.tamanho;
  } else if (!briefing || briefing.length < 20) {
    throw new ErroDePedido("Conte em pelo menos uma frase o que a empresa faz e o que o site precisa ter.");
  }
  const nome = textoCurto(dados.nome, 80) || marca.marca?.nome?.trim() || NOME_AUTOMATICO;
  const id = gerarId();
  const t = agora();
  db().prepare(`INSERT INTO projetos (id, nome, slug, estado, origem, stack, instrucoes, briefing, marca, tamanhoImagem, imagem, criadoEm, atualizadoEm)
                VALUES (?, ?, ?, 'rascunho', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, nome, slugUnico(nome), origem, normalizarStack(dados.stack), textoCurto(dados.instrucoes, 4000) ?? null, briefing ?? null, marca.marca ? JSON.stringify(marca.marca) : null, tamanhoImagem, imagem, t, t);
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

/** Campos do pedido que só podem mudar antes de gerar (ou depois de uma falha). */
export function editarPedido(id: string, dados: { marca?: unknown; instrucoes?: unknown; briefing?: unknown; stack?: unknown }): Projeto {
  const p = obterOuFalhar(id);
  if (p.estado !== "rascunho" && p.estado !== "falhou") throw new ErroDePedido("O pedido só pode ser alterado antes de gerar ou depois de uma falha.");
  const sets: string[] = [];
  const valores: (string | null)[] = [];
  if (dados.marca !== undefined) {
    const marca = normalizarMarca(dados.marca);
    if (marca.erro) throw new ErroDePedido(marca.erro);
    sets.push("marca = ?");
    valores.push(marca.marca ? JSON.stringify(marca.marca) : null);
  }
  if (dados.instrucoes !== undefined) { sets.push("instrucoes = ?"); valores.push(textoCurto(dados.instrucoes, 4000) ?? null); }
  if (dados.briefing !== undefined) {
    const briefing = textoCurto(dados.briefing, LIMITE_BRIEFING);
    if (p.origem === "briefing" && (!briefing || briefing.length < 20)) throw new ErroDePedido("Conte em pelo menos uma frase o que a empresa faz e o que o site precisa ter.");
    sets.push("briefing = ?"); valores.push(briefing ?? null);
  }
  if (dados.stack !== undefined) { sets.push("stack = ?"); valores.push(normalizarStack(dados.stack)); }
  if (!sets.length) return p;
  sets.push("atualizadoEm = ?");
  valores.push(agora());
  db().prepare(`UPDATE projetos SET ${sets.join(", ")} WHERE id = ?`).run(...valores, id);
  return obterOuFalhar(id);
}

/** Apaga o projeto e a página do histórico (o link /s/<slug> passa a responder 404). */
export function apagar(id: string): void {
  const p = obter(id);
  if (!p) return;
  if (p.paginaId) apagarResultado(p.paginaId);
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

/** A versão que está no ar em /s/<slug> (versaoPublicada; na falta dela, a última). */
export function versaoPublicadaDe(p: Projeto): { titulo: string; versao: Versao } | null {
  const salva = paginaDoProjeto(p);
  if (!salva) return null;
  const versoes = salva.pagina.versoes;
  const alvo = versoes.find((v) => v.n === p.versaoPublicada) ?? versoes[versoes.length - 1];
  return { titulo: salva.pagina.titulo, versao: alvo };
}

/** Publica a versão n (padrão: a última). As edições continuam criando versões novas sem mexer no que está no ar. */
export function publicar(id: string, n?: unknown): { projeto: Projeto; versao: Versao } {
  const p = obterOuFalhar(id);
  const salva = paginaDoProjeto(p);
  if (p.estado !== "pronto" || !salva) throw new ErroDePedido("O site ainda não foi gerado. Publique depois de ficar pronto.");
  const versoes = salva.pagina.versoes;
  const alvo = n === undefined || n === null ? versoes[versoes.length - 1] : versoes.find((v) => v.n === Number(n));
  if (!alvo) throw new ErroDePedido("Essa versão não existe.");
  db().prepare("UPDATE projetos SET versaoPublicada = ?, atualizadoEm = ? WHERE id = ?").run(alvo.n, agora(), id);
  return { projeto: obterOuFalhar(id), versao: alvo };
}

// ---------------------------------------------------------------------------------------------------------
// Geração em segundo plano
// ---------------------------------------------------------------------------------------------------------

/** Traduz qualquer falha da geração para o formato gravado no projeto: nunca o corpo do provedor. */
function erroDe(err: unknown): ErroProjeto {
  if (err instanceof ErroIA) {
    const e: ErroProjeto = { mensagem: err.message, codigo: err.codigo };
    if (err.acao) e.acao = err.acao;
    return e;
  }
  if (err instanceof Error && err.message) return { mensagem: err.message };
  return { mensagem: "Não foi possível gerar o site desta vez. Tente de novo." };
}

function gravarFalha(id: string, erro: ErroProjeto): void {
  const t = agora();
  db().prepare("UPDATE projetos SET estado = 'falhou', erro = ?, terminadoEm = ?, atualizadoEm = ?, vistoEm = NULL WHERE id = ? AND estado = 'gerando'")
    .run(JSON.stringify(erro), t, t, id);
}

/**
 * Corre fora da requisição HTTP. Em sucesso grava `pronto`, `paginaId`, `versaoPublicada = 1` e APAGA a
 * imagem (a captura não fica guardada depois de servir); em falha grava `falhou` com o motivo e mantém a
 * imagem para "Tentar de novo" sem reenviar.
 */
async function executarGeracao(id: string): Promise<void> {
  const p = obter(id);
  if (!p || p.estado !== "gerando") return;
  try {
    let pagina: Pagina;
    if (p.origem === "briefing") {
      pagina = (await gerarDoBriefing({ briefing: p.briefing ?? "", stack: p.stack, marca: p.marca, instrucoes: p.instrucoes })).pagina;
    } else {
      const imagem = imagemDe(id);
      if (!imagem) throw new ErroDePedido("A captura deste site não está mais guardada. Crie o site de novo.");
      pagina = (await gerarPagina({ imagem, stack: p.stack, instrucoes: p.instrucoes, marca: p.marca })).pagina;
    }
    const t = agora();
    const nomeFinal = p.nome === NOME_AUTOMATICO ? pagina.titulo.slice(0, 80) : p.nome;
    const slugFinal = p.nome === NOME_AUTOMATICO ? slugUnico(nomeFinal, id) : p.slug;
    db().prepare(`UPDATE projetos SET estado = 'pronto', paginaId = ?, versaoPublicada = 1, imagem = NULL, erro = NULL,
                  nome = ?, slug = ?, terminadoEm = ?, atualizadoEm = ?, vistoEm = NULL WHERE id = ? AND estado = 'gerando'`)
      .run(pagina.id, nomeFinal, slugFinal, t, t, id);
  } catch (err) {
    if (!(err instanceof ErroIA) && !(err instanceof ErroDePedido)) console.error("Falha ao gerar o site", id, err);
    gravarFalha(id, erroDe(err));
  }
}

/** Dispara a geração e devolve na hora (o projeto já em `gerando`). Só de `rascunho` ou `falhou`. */
export function iniciarGeracao(id: string): Projeto {
  const p = obterOuFalhar(id);
  if (p.estado === "gerando") throw new ErroDePedido("Este site já está sendo gerado.");
  if (p.estado === "pronto") throw new ErroDePedido("Este site já está pronto. Para mudar algo, peça ao agente.");
  const t = agora();
  db().prepare("UPDATE projetos SET estado = 'gerando', erro = NULL, terminadoEm = NULL, atualizadoEm = ? WHERE id = ?").run(t, id);
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
 * gerando morreu com o processo anterior; no laço de 60 s, só o que passou de LIMITE_GERACAO_MS.
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
      ? `«${p.nome}» está no ar.`
      : `«${p.nome}» não pôde ser gerado: ${(p.erro?.mensagem ?? "tente de novo").replace(/\.$/, "")}.`;
    return { id: p.id, texto, url: `/sites/${p.id}` };
  });
}

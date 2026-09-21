// Validador e reparador da especificação do painel (RF-06). Nunca lança: conserta ou descarta e registra
// o que fez em console.warn. Sem import node:*: é lido por app/page.tsx (cliente) e pelas rotas (servidor).
import type { ColunaTabela, ComponentePainel, DadosDistribuicao, DadosIndicador, DadosSerie, DadosTabela, EspecPainel, Formato, Ponto, Posicao, TipoComponente } from "./types";

/** Classes de largura da grade. No Tailwind 4 só entra no CSS a classe escrita literalmente no código. */
export const LARGURA_CLASSE: Record<1 | 2 | 3 | 4, string> = {
  1: "lg:col-span-1 md:col-span-1",
  2: "lg:col-span-2 md:col-span-2",
  3: "lg:col-span-3 md:col-span-2",
  4: "lg:col-span-4 md:col-span-2",
};

export const MAXIMO_COMPONENTES = 8;
export const MAXIMO_PONTOS = 12;
export const MAXIMO_FATIAS = 6;
export const MAXIMO_LINHAS_TABELA = 10;
export const MAXIMO_COLUNAS_TABELA = 6;
const COLUNAS_GRADE = 4;
const ULTIMA_LINHA_ALVO = 3;

const TIPOS: TipoComponente[] = ["indicador", "linha", "area", "barra", "pizza", "rosca", "tabela"];
const FORMATOS: Formato[] = ["moeda", "numero", "percentual"];
const TIPOS_COLUNA: ColunaTabela["tipo"][] = ["texto", "numero", "moeda", "percentual", "data"];

export type OpcoesValidacao = {
  /** "geracao" (padrão): todo componente pode ser movido; "refinamento": só os ids em `moviveis`. */
  modo?: "geracao" | "refinamento";
  moviveis?: Iterable<string>;
};

type Bruto = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Bruto => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, maximo: number): string => (typeof v === "string" ? v.trim().slice(0, maximo) : typeof v === "number" ? String(v) : "");

function numero(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

const formato = (v: unknown, padrao: Formato = "numero"): Formato => (FORMATOS.includes(v as Formato) ? (v as Formato) : padrao);

function pontos(lista: unknown, rotuloDoTipo: string, titulo: string, maximo: number): Ponto[] {
  if (!Array.isArray(lista)) return [];
  const validos: Ponto[] = [];
  for (const item of lista) {
    if (!ehObjeto(item)) continue;
    const rotulo = texto(item.rotulo ?? item.nome ?? item.label, 60);
    const valor = numero(item.valor ?? item.value);
    if (!rotulo || valor === undefined) continue;
    validos.push({ rotulo, valor });
  }
  if (validos.length > maximo) console.warn(`[validar] "${titulo}": ${validos.length} ${rotuloDoTipo}, cortado em ${maximo}.`);
  return validos.slice(0, maximo);
}

function dadosIndicador(d: Bruto): DadosIndicador | null {
  const valor = numero(d.valor);
  const anterior = numero(d.anterior);
  if (valor === undefined || anterior === undefined) return null;
  const meta = numero(d.meta);
  const dados: DadosIndicador = { valor, anterior, formato: formato(d.formato) };
  if (dados.formato === "moeda") dados.prefixo = "R$";
  if (meta !== undefined && meta > 0) dados.meta = meta;
  if (d.direcaoBoa === "diminuir" || d.direcaoBoa === "aumentar") dados.direcaoBoa = d.direcaoBoa;
  return dados;
}

function dadosSerie(d: Bruto, titulo: string, tipo: TipoComponente): DadosSerie | null {
  const lista = pontos(d.pontos ?? d.dados ?? d.itens, "pontos", titulo, MAXIMO_PONTOS);
  if (lista.length === 0) return null;
  const dados: DadosSerie = { eixoX: texto(d.eixoX, 40), eixoY: texto(d.eixoY, 40), formato: formato(d.formato), pontos: lista };
  if (dados.formato === "moeda") dados.prefixo = "R$";
  if (tipo === "barra") dados.orientacao = d.orientacao === "horizontal" ? "horizontal" : "vertical";
  return dados;
}

function dadosDistribuicao(d: Bruto, titulo: string): DadosDistribuicao | null {
  const todas = pontos(d.fatias ?? d.pontos ?? d.dados, "fatias", titulo, 100);
  if (todas.length === 0) return null;
  let fatias = todas;
  if (todas.length > MAXIMO_FATIAS) {
    const ordenadas = [...todas].sort((a, b) => b.valor - a.valor);
    const principais = ordenadas.slice(0, MAXIMO_FATIAS - 1);
    const resto = ordenadas.slice(MAXIMO_FATIAS - 1).reduce((soma, f) => soma + f.valor, 0);
    fatias = [...principais, { rotulo: "Outros", valor: resto }];
    console.warn(`[validar] "${titulo}": ${todas.length} fatias, ${todas.length - MAXIMO_FATIAS + 1} agrupadas em "Outros".`);
  }
  const dados: DadosDistribuicao = { formato: formato(d.formato), fatias };
  if (dados.formato === "moeda") dados.prefixo = "R$";
  return dados;
}

function dadosTabela(d: Bruto, titulo: string): DadosTabela | null {
  if (!Array.isArray(d.colunas) || !Array.isArray(d.linhas)) return null;
  const colunas: ColunaTabela[] = [];
  for (const c of d.colunas) {
    if (!ehObjeto(c)) continue;
    const chave = texto(c.chave ?? c.key, 40);
    if (!chave || colunas.some((x) => x.chave === chave)) continue;
    const tipo = TIPOS_COLUNA.includes(c.tipo as ColunaTabela["tipo"]) ? (c.tipo as ColunaTabela["tipo"]) : "texto";
    colunas.push({ chave, rotulo: texto(c.rotulo ?? c.titulo, 40) || chave, tipo });
  }
  if (colunas.length === 0) return null;
  if (colunas.length > MAXIMO_COLUNAS_TABELA) console.warn(`[validar] "${titulo}": ${colunas.length} colunas, cortado em ${MAXIMO_COLUNAS_TABELA}.`);
  const colunasFinais = colunas.slice(0, MAXIMO_COLUNAS_TABELA);
  const linhas: Array<Record<string, string | number>> = [];
  for (const l of d.linhas) {
    if (!ehObjeto(l)) continue;
    const linha: Record<string, string | number> = {};
    let preenchida = false;
    for (const col of colunasFinais) {
      const v = l[col.chave];
      if (typeof v === "number" && Number.isFinite(v)) { linha[col.chave] = v; preenchida = true; }
      else if (typeof v === "string") { linha[col.chave] = v.slice(0, 120); preenchida = preenchida || v.trim().length > 0; }
      else linha[col.chave] = "";
    }
    if (preenchida) linhas.push(linha);
  }
  if (linhas.length === 0) return null;
  if (linhas.length > MAXIMO_LINHAS_TABELA) console.warn(`[validar] "${titulo}": ${linhas.length} linhas, cortado em ${MAXIMO_LINHAS_TABELA}.`);
  return { colunas: colunasFinais, linhas: linhas.slice(0, MAXIMO_LINHAS_TABELA) };
}

/** Posição como veio (só inteiros no intervalo aceito); `null` quando não dá para aproveitar nada. */
function posicaoBruta(p: unknown): Partial<Posicao> {
  if (!ehObjeto(p)) return {};
  const linha = numero(p.linha);
  const coluna = numero(p.coluna);
  const largura = numero(p.largura);
  const r: Partial<Posicao> = {};
  if (linha !== undefined && linha >= 0) r.linha = Math.floor(linha);
  if (coluna !== undefined && coluna >= 0 && coluna < COLUNAS_GRADE) r.coluna = Math.floor(coluna);
  if (largura !== undefined && largura >= 1 && largura <= COLUNAS_GRADE) r.largura = Math.floor(largura) as Posicao["largura"];
  return r;
}

type Candidato = { componente: ComponentePainel; pedida: Partial<Posicao>; ordem: number };

function componenteValido(bruto: unknown, ordem: number): Candidato | null {
  if (!ehObjeto(bruto)) return null;
  const tipo = bruto.tipo as TipoComponente;
  const titulo = texto(bruto.titulo, 40) || "Sem título";
  if (!TIPOS.includes(tipo)) {
    console.warn(`[validar] componente ${ordem + 1} ("${titulo}") descartado: tipo desconhecido "${String(bruto.tipo)}".`);
    return null;
  }
  const d = ehObjeto(bruto.dados) ? bruto.dados : ehObjeto(bruto.config) ? bruto.config : null;
  if (!d) {
    console.warn(`[validar] componente ${ordem + 1} ("${titulo}") descartado: sem dados.`);
    return null;
  }
  const id = texto(bruto.id, 20);
  const pedida = posicaoBruta(bruto.posicao);
  const base = { id, titulo, posicao: { linha: 0, coluna: 0, largura: 1 as const } };
  let componente: ComponentePainel | null = null;
  if (tipo === "indicador") {
    const dados = dadosIndicador(d);
    if (dados) componente = { ...base, tipo, dados };
  } else if (tipo === "linha" || tipo === "area" || tipo === "barra") {
    const dados = dadosSerie(d, titulo, tipo);
    if (dados) componente = { ...base, tipo, dados };
  } else if (tipo === "pizza" || tipo === "rosca") {
    const dados = dadosDistribuicao(d, titulo);
    if (dados) componente = { ...base, tipo, dados };
  } else {
    const dados = dadosTabela(d, titulo);
    if (dados) componente = { ...base, tipo, dados };
  }
  if (!componente) {
    console.warn(`[validar] componente ${ordem + 1} ("${titulo}", ${tipo}) descartado: faltam campos obrigatórios.`);
    return null;
  }
  return { componente, pedida, ordem };
}

/** Largura padrão por tipo quando a IA não informou uma válida. */
const larguraPadrao = (tipo: TipoComponente): Posicao["largura"] => (tipo === "indicador" ? 1 : tipo === "tabela" ? 4 : 2);

/** Ocupação da grade: um vetor de 4 booleanos por linha. */
class Grade {
  linhas: boolean[][] = [];
  garantir(linha: number) {
    while (this.linhas.length <= linha) this.linhas.push(new Array<boolean>(COLUNAS_GRADE).fill(false));
  }
  livre(linha: number, coluna: number, largura: number) {
    if (coluna < 0 || coluna + largura > COLUNAS_GRADE) return false;
    this.garantir(linha);
    for (let c = coluna; c < coluna + largura; c++) if (this.linhas[linha][c]) return false;
    return true;
  }
  ocupar(linha: number, coluna: number, largura: number) {
    this.garantir(linha);
    for (let c = coluna; c < coluna + largura; c++) this.linhas[linha][c] = true;
  }
  /** Primeira vaga da esquerda para a direita a partir de `desde`, acrescentando linha no fim se preciso. */
  vaga(desde: number, largura: number): { linha: number; coluna: number } {
    for (let linha = Math.max(0, desde); ; linha++) {
      this.garantir(linha);
      for (let coluna = 0; coluna + largura <= COLUNAS_GRADE; coluna++) {
        if (this.livre(linha, coluna, largura)) return { linha, coluna };
      }
    }
  }
}

/**
 * Valida e conserta a especificação. Na geração, reempacota todos os componentes; no refinamento, só
 * os `moviveis` (ids alterados ou novos) — os demais mantêm a posição que trouxeram.
 */
export function validarPainel(bruto: unknown, opcoes: OpcoesValidacao = {}): EspecPainel {
  const raiz: Bruto = ehObjeto(bruto) ? bruto : {};
  const listaBruta = Array.isArray(raiz.componentes) ? raiz.componentes : Array.isArray(raiz.components) ? raiz.components : [];
  if (!ehObjeto(bruto) || listaBruta.length === 0) console.warn("[validar] especificação sem componentes.");

  // 1. Componentes válidos, ordenados pela posição pedida (linha, coluna) e depois pela ordem original.
  const candidatos = listaBruta.map((c: unknown, i: number) => componenteValido(c, i)).filter((c): c is Candidato => c !== null);
  candidatos.sort((a, b) => (a.pedida.linha ?? 99) - (b.pedida.linha ?? 99) || (a.pedida.coluna ?? 99) - (b.pedida.coluna ?? 99) || a.ordem - b.ordem);
  const refinamento = opcoes.modo === "refinamento";
  const moviveis = new Set(opcoes.moviveis ?? []);
  let mantidos = candidatos;
  if (candidatos.length > MAXIMO_COMPONENTES) {
    // Na geração ficam os 8 primeiros por posição; no refinamento os originais parados têm prioridade
    // sobre os alterados/novos (senão um acréscimo expulsaria um componente que a pessoa não pediu para tirar).
    const prioridade = refinamento ? [...candidatos.filter((c) => !moviveis.has(c.componente.id)), ...candidatos.filter((c) => moviveis.has(c.componente.id))] : candidatos;
    const escolhidos = new Set(prioridade.slice(0, MAXIMO_COMPONENTES));
    mantidos = candidatos.filter((c) => escolhidos.has(c));
    console.warn(`[validar] ${candidatos.length} componentes válidos, mantidos ${MAXIMO_COMPONENTES}: descartados ${candidatos.filter((c) => !escolhidos.has(c)).map((c) => `"${c.componente.titulo}"`).join(", ")}.`);
  }

  // 2. Ids: duplicados ou ausentes ganham o menor "cN" livre.
  const usados = new Set<string>();
  for (const c of mantidos) {
    if (c.componente.id && !usados.has(c.componente.id)) { usados.add(c.componente.id); continue; }
    let n = 1;
    while (usados.has(`c${n}`)) n++;
    console.warn(`[validar] id ${c.componente.id ? `duplicado "${c.componente.id}"` : "ausente"} em "${c.componente.titulo}"; reatribuído como "c${n}".`);
    c.componente.id = `c${n}`;
    usados.add(c.componente.id);
  }

  // 3. Posições. No refinamento, os componentes fixos entram primeiro, exatamente onde estão.
  const grade = new Grade();
  const pendentes: Candidato[] = [];
  for (const c of mantidos) {
    const fixo = refinamento && !moviveis.has(c.componente.id);
    const { linha, coluna, largura } = c.pedida;
    if (fixo && linha !== undefined && coluna !== undefined && largura !== undefined && grade.livre(linha, coluna, largura)) {
      c.componente.posicao = { linha, coluna, largura };
      grade.ocupar(linha, coluna, largura);
    } else {
      if (fixo) console.warn(`[validar] "${c.componente.titulo}" deveria ficar parado, mas a posição está inválida ou ocupada; reposicionado.`);
      pendentes.push(c);
    }
  }
  for (const c of pendentes) {
    const largura = c.pedida.largura ?? larguraPadrao(c.componente.tipo);
    const { linha, coluna } = c.pedida;
    if (linha !== undefined && coluna !== undefined && linha <= ULTIMA_LINHA_ALVO && grade.livre(linha, coluna, largura)) {
      c.componente.posicao = { linha, coluna, largura };
      grade.ocupar(linha, coluna, largura);
      continue;
    }
    // Linha além do alvo (ou sem posição): procura a partir da última linha existente; o resto, a partir da própria linha.
    const desde = linha === undefined || linha > ULTIMA_LINHA_ALVO ? Math.max(0, grade.linhas.length - 1) : linha;
    const vaga = grade.vaga(desde, largura);
    console.warn(`[validar] "${c.componente.titulo}" movido para linha ${vaga.linha}, coluna ${vaga.coluna} (largura ${largura}).`);
    c.componente.posicao = { linha: vaga.linha, coluna: vaga.coluna, largura };
    grade.ocupar(vaga.linha, vaga.coluna, largura);
  }

  const componentes = mantidos.map((c) => c.componente).sort((a, b) => a.posicao.linha - b.posicao.linha || a.posicao.coluna - b.posicao.coluna);

  const painel: EspecPainel = {
    titulo: texto(raiz.titulo, 60) || "Painel de indicadores",
    resumo: texto(raiz.resumo, 240),
    setor: texto(raiz.setor, 40) || "Geral",
    componentes,
  };
  if (typeof raiz.refinadoEm === "string" && raiz.refinadoEm) painel.refinadoEm = raiz.refinadoEm;
  return painel;
}

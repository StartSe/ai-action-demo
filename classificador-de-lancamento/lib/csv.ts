// Parser de CSV feito à mão, sem dependências (mesmo desenho de financas-ia/lib/csv.ts, adaptado ao
// mapeamento fixo de colunas deste app: data/descrição/valor, mais categoria no histórico). Roda no
// servidor (lib/classificador.ts) e é puro o bastante para rodar em qualquer runtime Node.
export type CSVParseado = { cabecalho: string[]; linhas: string[][] };

function detectarSeparador(primeiraLinha: string): string {
  const candidatos = [";", ",", "\t"];
  let melhor = ";";
  let melhorContagem = -1;
  for (const c of candidatos) {
    const contagem = primeiraLinha.split(c).length;
    if (contagem > melhorContagem) {
      melhorContagem = contagem;
      melhor = c;
    }
  }
  return melhor;
}

/** Entende aspas duplas (com "" como escape) e quebras de linha dentro de campos com aspas. */
export function parseCSV(texto: string): CSVParseado {
  const limpo = String(texto || "").replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!limpo.trim()) return { cabecalho: [], linhas: [] };

  const primeiraLinha = limpo.slice(0, limpo.indexOf("\n") >= 0 ? limpo.indexOf("\n") : undefined);
  const sep = detectarSeparador(primeiraLinha);

  const linhas: string[][] = [];
  let campo = "";
  let linhaAtual: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const ch = limpo[i];
    if (dentroDeAspas) {
      if (ch === '"') {
        if (limpo[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += ch;
      }
      continue;
    }
    if (ch === '"') {
      dentroDeAspas = true;
      continue;
    }
    if (ch === sep) {
      linhaAtual.push(campo);
      campo = "";
      continue;
    }
    if (ch === "\n") {
      linhaAtual.push(campo);
      linhas.push(linhaAtual);
      campo = "";
      linhaAtual = [];
      continue;
    }
    campo += ch;
  }
  linhaAtual.push(campo);
  if (linhaAtual.length > 1 || linhaAtual[0] !== "") linhas.push(linhaAtual);

  const naoVazias = linhas.filter((l) => l.some((v) => String(v).trim() !== ""));
  const [cabecalho, ...resto] = naoVazias;
  return {
    cabecalho: (cabecalho || []).map((h) => String(h).trim()),
    linhas: resto.map((l) => l.map((v) => String(v).trim())),
  };
}

/** Aceita "1.234,56", "R$ 1.234,56", "(234,56)" (negativo contábil) e também "1234.56". */
export function parseNumero(valor: unknown): number | null {
  if (typeof valor === "number") return valor;
  let s = String(valor ?? "").trim();
  if (!s) return null;
  s = s.replace(/r\$/i, "").replace(/\s+/g, "");
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return null;

  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return negativo ? -n : n;
}

function normalizar(h: string) {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Índice da primeira coluna cujo cabeçalho normalizado contém um dos padrões, na ordem dada. */
function acharColuna(cabecalho: string[], padroes: string[]): number {
  const normalizado = cabecalho.map(normalizar);
  for (const p of padroes) {
    const i = normalizado.findIndex((h) => h.includes(p));
    if (i >= 0) return i;
  }
  return -1;
}

export type MapeamentoHistorico = { data: number; descricao: number; valor: number; categoria: number };
export type MapeamentoNovos = { data: number; descricao: number; valor: number };

const PADROES_DATA = ["data", "date", "dia", "competencia", "vencimento"];
const PADROES_DESCRICAO = ["descri", "histor", "item", "observ", "detalhe", "fornecedor", "lancamento"];
const PADROES_VALOR = ["valor", "total", "montante", "vlr", "amount"];
const PADROES_CATEGORIA = ["categ", "conta", "classific", "plano de contas", "centro de custo", "grupo"];

export function mapearColunasHistorico(cabecalho: string[]): MapeamentoHistorico {
  return {
    data: acharColuna(cabecalho, PADROES_DATA),
    descricao: acharColuna(cabecalho, PADROES_DESCRICAO),
    valor: acharColuna(cabecalho, PADROES_VALOR),
    categoria: acharColuna(cabecalho, PADROES_CATEGORIA),
  };
}

export function mapearColunasNovos(cabecalho: string[]): MapeamentoNovos {
  return {
    data: acharColuna(cabecalho, PADROES_DATA),
    descricao: acharColuna(cabecalho, PADROES_DESCRICAO),
    valor: acharColuna(cabecalho, PADROES_VALOR),
  };
}

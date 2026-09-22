// Parser de CSV feito à mão, sem dependências (mesmo espírito de financas-ia/lib/csv.ts, adaptado a este
// domínio: aqui a coluna que importa é a nota de perda em texto livre, não valores). Roda no navegador
// (o arquivo inteiro nunca sai da máquina do executivo) e também no servidor.
import type { Mapeamento } from "./types";

export type CSVParseado = { separador: string; cabecalho: string[]; linhas: string[][] };

/** Detecta o separador mais provável olhando a primeira linha "de verdade" do arquivo. */
export function detectarSeparador(primeiraLinha: string): string {
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
export function parseCSV(texto: string, separador?: string): CSVParseado {
  const limpo = String(texto || "").replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!limpo.trim()) return { separador: separador || ";", cabecalho: [], linhas: [] };

  const primeiraLinha = limpo.slice(0, limpo.indexOf("\n") >= 0 ? limpo.indexOf("\n") : undefined);
  const sep = separador || detectarSeparador(primeiraLinha);

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
    separador: sep,
    cabecalho: (cabecalho || []).map((h) => String(h).trim()),
    linhas: resto.map((l) => l.map((v) => String(v).trim())),
  };
}

/** Aceita "1.234,56", "R$ 1.234,56", "-234,56" e também "1234.56". Usado só para a coluna opcional de valor. */
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
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return negativo ? -n : n;
}

/** Aceita dd/mm/aaaa e aaaa-mm-dd. Usado só para a coluna opcional de data. */
export function parseDataTexto(valor: unknown): string | null {
  const s = String(valor ?? "").trim();
  if (!s) return null;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return s;
  return null;
}

/**
 * Sugere qual coluna é a nota de perda (texto livre e longo), combinando o nome do cabeçalho com uma
 * checagem do conteúdo. As colunas de contexto (valor, segmento, data) são só um bônus opcional.
 */
export function sugerirMapeamento(cabecalho: string[], linhas: string[][]): Mapeamento {
  const amostra = linhas.slice(0, 30);
  const normalizado = cabecalho.map((h) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));

  function pontuarPorNome(padroes: string[]): number[] {
    return normalizado.map((h) => (padroes.some((p) => h.includes(p)) ? 1 : 0));
  }

  function comprimentoMedio(indice: number): number {
    if (indice < 0) return 0;
    const valores = amostra.map((l) => l[indice]).filter((v) => v !== undefined && v.trim() !== "");
    if (!valores.length) return 0;
    return valores.reduce((soma, v) => soma + v.length, 0) / valores.length;
  }

  function taxaDeAcerto(indice: number, testar: (v: string) => unknown): number {
    if (indice < 0) return 0;
    const valores = amostra.map((l) => l[indice]).filter((v) => v !== undefined && v !== "");
    if (!valores.length) return 0;
    return valores.filter((v) => testar(v) !== null).length / valores.length;
  }

  // Nota: prioriza nome do cabeçalho e, como critério de desempate/reforço, o texto mais longo em
  // média (uma nota de perda em texto livre tende a ser bem mais longa que qualquer outra coluna).
  const porNomeNota = pontuarPorNome(["nota", "motivo", "razao", "razão", "observ", "coment", "descri", "detalhe", "reason", "note", "why"]);
  let nota = -1;
  let melhorPontuacaoNota = -1;
  for (let i = 0; i < cabecalho.length; i++) {
    const pontuacao = porNomeNota[i] * 100 + comprimentoMedio(i);
    if (pontuacao > melhorPontuacaoNota) {
      melhorPontuacaoNota = pontuacao;
      nota = i;
    }
  }
  // Sem nenhum indício de nome, cai para a coluna de texto mais longo do arquivo inteiro.
  if (nota === -1 || melhorPontuacaoNota === 0) {
    let melhorComprimento = -1;
    for (let i = 0; i < cabecalho.length; i++) {
      const c = comprimentoMedio(i);
      if (c > melhorComprimento) {
        melhorComprimento = c;
        nota = i;
      }
    }
  }

  function melhorIndice(padroesNome: string[], testarConteudo: ((v: string) => unknown) | null, excluir: number): number {
    const porNome = pontuarPorNome(padroesNome);
    let melhor = -1;
    let melhorPontuacao = -1;
    for (let i = 0; i < cabecalho.length; i++) {
      if (i === excluir) continue;
      const acerto = testarConteudo ? taxaDeAcerto(i, testarConteudo) : 0;
      const pontuacao = porNome[i] * 2 + acerto;
      if (pontuacao > melhorPontuacao) {
        melhorPontuacao = pontuacao;
        melhor = i;
      }
    }
    return melhorPontuacao > 0 ? melhor : -1;
  }

  const valor = melhorIndice(["valor", "total", "preco", "preço", "montante"], parseNumero, nota);
  const segmento = melhorIndice(["segmento", "categ", "setor", "industria", "indústria", "porte"], null, nota);
  const data = melhorIndice(["data", "date", "perdid", "fechamento"], parseDataTexto, nota);

  return { nota, valor, segmento, data };
}

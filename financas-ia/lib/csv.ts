// Parser de CSV feito à mão, sem dependências. Roda no navegador (o arquivo inteiro
// nunca sai da máquina do executivo) e também no Node, para testes automatizados.
// Detecta separador (; , ou tab), respeita aspas, e entende números e datas em
// formato brasileiro além do formato internacional.
import type { Mapeamento } from "./types";

export type CSVParseado = { separador: string; cabecalho: string[]; linhas: string[][] };

// Detecta o separador mais provável olhando a primeira linha "de verdade" do arquivo.
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

// Parser de caracteres: entende aspas duplas (com "" como escape) e quebras de
// linha dentro de campos com aspas, o que um split ingênuo por linha não resolve.
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

// Aceita "1.234,56", "R$ 1.234,56", "R$1.234,56", "-234,56" e também "1234.56".
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
    // Formato brasileiro: ponto é separador de milhar, vírgula é decimal.
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return negativo ? -n : n;
}

// Aceita dd/mm/aaaa e aaaa-mm-dd. Retorna um Date (meio-dia UTC, para evitar
// problemas de fuso horário ao virar o dia) ou null se não reconhecer o formato.
export function parseData(valor: unknown): Date | null {
  const s = String(valor ?? "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dia, mes, ano] = m;
    return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia), 12));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, ano, mes, dia] = m;
    return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia), 12));
  }
  return null;
}

// Sugere o mapeamento de colunas (data, categoria, valor, descrição) combinando
// o nome do cabeçalho com uma checagem do conteúdo das primeiras linhas.
export function sugerirMapeamento(cabecalho: string[], linhas: string[][]): Mapeamento {
  const amostra = linhas.slice(0, 20);
  const normalizado = cabecalho.map((h) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));

  function pontuarPorNome(padroes: string[]): number[] {
    return normalizado.map((h) => (padroes.some((p) => h.includes(p)) ? 1 : 0));
  }

  function taxaDeAcerto(indice: number, testar: (v: string) => unknown): number {
    if (indice < 0) return 0;
    const valores = amostra.map((l) => l[indice]).filter((v) => v !== undefined && v !== "");
    if (!valores.length) return 0;
    const acertos = valores.filter((v) => testar(v) !== null).length;
    return acertos / valores.length;
  }

  function melhorIndice(padroesNome: string[], testarConteudo: ((v: string) => unknown) | null): number {
    const porNome = pontuarPorNome(padroesNome);
    let melhor = -1;
    let melhorPontuacao = -1;
    for (let i = 0; i < cabecalho.length; i++) {
      const acerto = testarConteudo ? taxaDeAcerto(i, testarConteudo) : 0;
      const pontuacao = porNome[i] * 2 + acerto;
      if (pontuacao > melhorPontuacao) {
        melhorPontuacao = pontuacao;
        melhor = i;
      }
    }
    return melhorPontuacao > 0 ? melhor : -1;
  }

  const data = melhorIndice(["data", "date", "dia", "competencia", "vencimento"], parseData);
  const valorIdx = melhorIndice(["valor", "total", "preco", "montante", "vlr", "amount"], parseNumero);
  const categoria = melhorIndice(["categ", "tipo", "classe", "grupo", "centro de custo"], null);
  const descricao = melhorIndice(["descri", "histor", "item", "observ", "detalhe", "fornecedor"], null);

  return { data, categoria, valor: valorIdx, descricao };
}

// Leitura de comentários a partir de um arquivo CSV ou TXT, tudo processado no navegador.
import type { Comentario } from "./types";

export interface ArquivoCSV {
  tipo: "csv";
  headers: string[];
  rows: string[][];
}

export interface ArquivoTXT {
  tipo: "txt";
  linhas: string[];
}

export type ArquivoDados = ArquivoCSV | ArquivoTXT;

export function comentariosDoTexto(texto: string): Comentario[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((t) => ({ texto: t }));
}

function parseCSVLinha(linha: string, delim: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (entreAspas) {
      if (ch === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        atual += ch;
      }
    } else if (ch === '"') {
      entreAspas = true;
    } else if (ch === delim) {
      campos.push(atual);
      atual = "";
    } else {
      atual += ch;
    }
  }
  campos.push(atual);
  return campos;
}

export function parseCSV(texto: string): { headers: string[]; rows: string[][] } {
  const linhas = texto.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
  if (!linhas.length) return { headers: [], rows: [] };
  const delim = linhas[0].split(";").length > linhas[0].split(",").length ? ";" : ",";
  const headers = parseCSVLinha(linhas[0], delim).map((h) => h.trim());
  const rows = linhas.slice(1).map((l) => parseCSVLinha(l, delim));
  return { headers, rows };
}

export function adivinharColuna(headers: string[], palavras: string[]): number {
  const idx = headers.findIndex((h) => palavras.some((p) => h.toLowerCase().includes(p)));
  return idx >= 0 ? idx : -1;
}

export function adivinharColunaTexto(headers: string[]): number {
  const idx = adivinharColuna(headers, ["coment", "feedback", "review", "avalia", "texto", "mensagem", "ticket"]);
  return idx >= 0 ? idx : 0;
}

export function adivinharColunaNota(headers: string[]): number {
  return adivinharColuna(headers, ["nota", "score", "nps"]);
}

export function comentariosDoArquivo(dados: ArquivoDados | null, idxTexto: number, idxNota: number): Comentario[] {
  if (!dados) return [];
  if (dados.tipo === "txt") {
    return dados.linhas.map((texto) => ({ texto }));
  }
  return dados.rows
    .map((row) => {
      const texto = (row[idxTexto] || "").trim();
      if (!texto) return null;
      let nota: number | undefined;
      if (idxNota >= 0) {
        const n = parseFloat(String(row[idxNota] || "").replace(",", "."));
        if (Number.isFinite(n) && n >= 0 && n <= 10) nota = n;
      }
      return { texto, nota } as Comentario;
    })
    .filter((c): c is Comentario => c !== null);
}

export async function lerArquivo(file: File): Promise<ArquivoDados> {
  const texto = await file.text();
  const ehCSV = /\.csv$/i.test(file.name) || file.type === "text/csv";
  if (ehCSV) {
    const parsed = parseCSV(texto);
    return { tipo: "csv", headers: parsed.headers, rows: parsed.rows };
  }
  const linhas = texto
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter(Boolean);
  return { tipo: "txt", linhas };
}

// Faturas de ferramentas de IA, lançadas manualmente (US-019) ou lidas por e-mail/PDF (histórias
// futuras). Usa o mesmo arquivo SQLite de lib/store.ts/lib/historico.ts, em uma tabela própria.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Fatura, Periodo } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS faturas (
    id TEXT PRIMARY KEY,
    fornecedor TEXT NOT NULL,
    ferramenta TEXT NOT NULL,
    categoria TEXT NOT NULL,
    valor REAL NOT NULL,
    moeda TEXT NOT NULL,
    valorBRL REAL NOT NULL,
    data TEXT NOT NULL,
    periodicidade TEXT NOT NULL,
    origem TEXT NOT NULL,
    referencia TEXT,
    criadoEm TEXT NOT NULL
  )`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS faturas_dedup ON faturas (fornecedor, valor, data)`);
  return db;
}

type Linha = {
  id: string; fornecedor: string; ferramenta: string; categoria: string; valor: number; moeda: string;
  valorBRL: number; data: string; periodicidade: string; origem: string; referencia: string | null; criadoEm: string;
};

function linhaParaFatura(l: Linha): Fatura {
  return {
    id: l.id,
    fornecedor: l.fornecedor,
    ferramenta: l.ferramenta,
    categoria: l.categoria,
    valor: l.valor,
    moeda: l.moeda as Fatura["moeda"],
    valorBRL: l.valorBRL,
    data: l.data,
    periodicidade: l.periodicidade as Fatura["periodicidade"],
    origem: l.origem as Fatura["origem"],
    referencia: l.referencia ?? undefined,
    criadoEm: l.criadoEm,
  };
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/** Início (AAAA-MM-DD) do período, contando `meses` para trás a partir do mês atual (incluindo-o). */
export function inicioPeriodo(meses: number, referencia = new Date()): string {
  const d = new Date(referencia.getFullYear(), referencia.getMonth() - (meses - 1), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function mesesDoPeriodo(periodo: Periodo): number {
  return periodo === "mes" ? 1 : periodo === "3meses" ? 3 : 12;
}

/** Salva uma fatura; ignora silenciosamente (devolve a existente) quando já existe uma com o mesmo
 * fornecedor, valor e data — mesma chave de dedup usada por leituras futuras de e-mail/PDF. */
export function salvar(fatura: Omit<Fatura, "id" | "criadoEm">): Fatura {
  const existente = abrir()
    .prepare("SELECT * FROM faturas WHERE fornecedor = ? AND valor = ? AND data = ?")
    .get(fatura.fornecedor, fatura.valor, fatura.data) as Linha | undefined;
  if (existente) return linhaParaFatura(existente);

  const id = gerarId();
  const criadoEm = new Date().toISOString();
  try {
    abrir()
      .prepare(
        `INSERT INTO faturas (id, fornecedor, ferramenta, categoria, valor, moeda, valorBRL, data, periodicidade, origem, referencia, criadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id, fatura.fornecedor, fatura.ferramenta, fatura.categoria, fatura.valor, fatura.moeda, fatura.valorBRL,
        fatura.data, fatura.periodicidade, fatura.origem, fatura.referencia || null, criadoEm
      );
  } catch {
    // Corrida rara entre a checagem acima e o INSERT: outra chamada já inseriu a mesma chave.
    const duplicada = abrir()
      .prepare("SELECT * FROM faturas WHERE fornecedor = ? AND valor = ? AND data = ?")
      .get(fatura.fornecedor, fatura.valor, fatura.data) as Linha;
    return linhaParaFatura(duplicada);
  }
  return { ...fatura, id, criadoEm };
}

/** Faturas dentro do período (mês atual, últimos 3 meses ou últimos 12 meses), mais recentes primeiro. */
export function listar(periodo: Periodo): Fatura[] {
  const desde = inicioPeriodo(mesesDoPeriodo(periodo));
  const linhas = abrir().prepare("SELECT * FROM faturas WHERE data >= ? ORDER BY data DESC").all(desde) as Linha[];
  return linhas.map(linhaParaFatura);
}

/** Faturas dos últimos `n` meses (contando o atual), mais recentes primeiro — usado por lib/leitura.ts
 * para ter sempre um mês extra de contexto na hora de calcular a variação do mês mais recente, mesmo
 * quando o período pedido pela tela é só "mês atual" (1 mês). */
export function listarUltimosMeses(n: number, referencia = new Date()): Fatura[] {
  const desde = inicioPeriodo(n, referencia);
  const linhas = abrir().prepare("SELECT * FROM faturas WHERE data >= ? ORDER BY data DESC").all(desde) as Linha[];
  return linhas.map(linhaParaFatura);
}

/** Já existe fatura com esta origem e referência (ex.: id da mensagem do Gmail)? Evita reler — e gastar
 * uma chamada ao modelo — em um e-mail que já virou fatura numa importação anterior. */
export function existeReferencia(origem: Fatura["origem"], referencia: string): boolean {
  const linha = abrir().prepare("SELECT 1 FROM faturas WHERE origem = ? AND referencia = ? LIMIT 1").get(origem, referencia);
  return Boolean(linha);
}

/** Todas as faturas gravadas, sem filtro de período — usado só para decidir se o app tem dado real (senão cai no demo). */
export function existeAlguma(): boolean {
  const linha = abrir().prepare("SELECT 1 FROM faturas LIMIT 1").get();
  return Boolean(linha);
}

export function apagar(id: string): void {
  abrir().prepare("DELETE FROM faturas WHERE id = ?").run(id);
}

export function apagarTodas(): void {
  abrir().prepare("DELETE FROM faturas").run();
}

/** Total gasto (BRL) no período, para uso rápido fora de lib/leitura.ts. */
export function resumo(periodo: Periodo): { totalBRL: number; quantidade: number } {
  const faturas = listar(periodo);
  return { totalBRL: faturas.reduce((s, f) => s + f.valorBRL, 0), quantidade: faturas.length };
}

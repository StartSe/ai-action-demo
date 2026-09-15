// Armazenamento local de configuração em SQLite (node:sqlite, sem dependências).
// As chaves das integrações ficam aqui, gravadas pelo setup inicial (/setup).
// Variáveis de ambiente continuam funcionando como alternativa e têm prioridade.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return db;
}

/** Lê uma configuração: variável de ambiente primeiro, depois o banco. */
export function getConfig(chave: string): string | undefined {
  const env = process.env[chave];
  if (env && env.trim()) return env.trim();
  try {
    const linha = abrir().prepare("SELECT valor FROM config WHERE chave = ?").get(chave) as { valor: string } | undefined;
    return linha?.valor || undefined;
  } catch (err) {
    console.error("Falha ao ler configuração", chave, err);
    return undefined;
  }
}

export function setConfig(chave: string, valor: string | null | undefined): void {
  const d = abrir();
  if (valor === null || valor === undefined || valor === "") {
    d.prepare("DELETE FROM config WHERE chave = ?").run(chave);
    return;
  }
  d.prepare(`INSERT INTO config (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))
             ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`).run(chave, valor.trim());
}

export function getAllConfig(): Record<string, string> {
  const linhas = abrir().prepare("SELECT chave, valor FROM config").all() as { chave: string; valor: string }[];
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
}

/** Indica de onde veio o valor, para a tela de setup mostrar "definido por variável de ambiente". */
export function origemConfig(chave: string): "env" | "banco" | null {
  if (process.env[chave]?.trim()) return "env";
  const linha = abrir().prepare("SELECT 1 FROM config WHERE chave = ?").get(chave);
  return linha ? "banco" : null;
}

/** Mostra só o começo e o fim de um segredo. */
export function mascarar(valor: string | undefined): string | null {
  if (!valor) return null;
  if (valor.length <= 8) return "••••";
  return `${valor.slice(0, 4)}••••${valor.slice(-4)}`;
}

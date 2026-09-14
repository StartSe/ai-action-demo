// Time de vendas cadastrado no painel ("Cadastrar vendedor"), para escolher quem está treinando.
// Usa o mesmo arquivo SQLite de lib/store.ts/lib/historico.ts, em uma tabela própria.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Vendedor } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS vendedores (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT,
    equipe TEXT,
    criadoEm TEXT NOT NULL
  )`);
  return db;
}

type Linha = { id: string; nome: string; email: string | null; equipe: string | null; criadoEm: string };

function linhaParaVendedor(l: Linha): Vendedor {
  return { id: l.id, nome: l.nome, email: l.email ?? undefined, equipe: l.equipe ?? undefined, criadoEm: l.criadoEm };
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export function criar({ nome, email, equipe }: { nome: string; email?: string; equipe?: string }): Vendedor {
  const id = gerarId();
  const criadoEm = new Date().toISOString();
  abrir()
    .prepare("INSERT INTO vendedores (id, nome, email, equipe, criadoEm) VALUES (?, ?, ?, ?, ?)")
    .run(id, nome, email || null, equipe || null, criadoEm);
  return { id, nome, email, equipe, criadoEm };
}

export function listar(limite = 100): Vendedor[] {
  const linhas = abrir().prepare("SELECT * FROM vendedores ORDER BY nome ASC LIMIT ?").all(limite) as Linha[];
  return linhas.map(linhaParaVendedor);
}

export function obter(id: string): Vendedor | null {
  const linha = abrir().prepare("SELECT * FROM vendedores WHERE id = ?").get(id) as Linha | undefined;
  return linha ? linhaParaVendedor(linha) : null;
}

export function apagar(id: string): void {
  abrir().prepare("DELETE FROM vendedores WHERE id = ?").run(id);
}

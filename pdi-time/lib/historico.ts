// Histórico de resultados gerados, para reabrir por link (/r/[id]) ou imprimir (/imprimir/[id]).
// Usa o mesmo arquivo SQLite de lib/store.ts, em uma tabela própria.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS resultados (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    entrada TEXT NOT NULL,
    saida TEXT NOT NULL,
    meta TEXT NOT NULL,
    criadoEm TEXT NOT NULL,
    expiraEm TEXT NULL
  )`);
  return db;
}

export type Resultado<Entrada = unknown, Saida = unknown, Meta = unknown> = {
  id: string;
  tipo: string;
  entrada: Entrada;
  saida: Saida;
  meta: Meta;
  criadoEm: string;
  expiraEm: string | null;
};

type Linha = { id: string; tipo: string; entrada: string; saida: string; meta: string; criadoEm: string; expiraEm: string | null };

function linhaParaResultado<E, S, M>(l: Linha): Resultado<E, S, M> {
  return { id: l.id, tipo: l.tipo, entrada: JSON.parse(l.entrada), saida: JSON.parse(l.saida), meta: JSON.parse(l.meta), criadoEm: l.criadoEm, expiraEm: l.expiraEm };
}

/** Token aleatório de 12 caracteres, seguro para URL (base64url de 9 bytes). */
function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/** Salva um resultado e devolve o id gerado; expiraEmDias, quando informado, define expiraEm a partir de agora. */
export function salvar({ tipo, entrada, saida, meta, expiraEmDias }: { tipo: string; entrada: unknown; saida: unknown; meta: unknown; expiraEmDias?: number }): string {
  const id = gerarId();
  const criadoEm = new Date().toISOString();
  const expiraEm = expiraEmDias ? new Date(Date.now() + expiraEmDias * 24 * 60 * 60 * 1000).toISOString() : null;
  abrir()
    .prepare("INSERT INTO resultados (id, tipo, entrada, saida, meta, criadoEm, expiraEm) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, tipo, JSON.stringify(entrada), JSON.stringify(saida), JSON.stringify(meta), criadoEm, expiraEm);
  return id;
}

export function obter<E = unknown, S = unknown, M = unknown>(id: string): Resultado<E, S, M> | null {
  const linha = abrir().prepare("SELECT * FROM resultados WHERE id = ?").get(id) as Linha | undefined;
  return linha ? linhaParaResultado<E, S, M>(linha) : null;
}

/** Lista os resultados mais recentes primeiro, sem os campos pesados (entrada/saida). */
export function listar(limite = 10): Pick<Resultado, "id" | "tipo" | "criadoEm">[] {
  const linhas = abrir()
    .prepare("SELECT id, tipo, criadoEm FROM resultados ORDER BY criadoEm DESC LIMIT ?")
    .all(limite) as Pick<Linha, "id" | "tipo" | "criadoEm">[];
  return linhas;
}

export function apagar(id: string): void {
  abrir().prepare("DELETE FROM resultados WHERE id = ?").run(id);
}

export function apagarTodos(): void {
  abrir().prepare("DELETE FROM resultados").run();
}

/** Remove resultados cujo expiraEm já passou; roda na inicialização do servidor (ver instrumentation.ts). */
export function limparExpirados(): void {
  abrir().prepare("DELETE FROM resultados WHERE expiraEm IS NOT NULL AND expiraEm < ?").run(new Date().toISOString());
}

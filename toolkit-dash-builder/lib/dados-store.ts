// Guarda a planilha enviada no mesmo app.sqlite, em tabela própria.
// Precisa ficar guardada (e não só viver na requisição) porque o painel é reaberto por /r/[id],
// impresso por /imprimir/[id] e ajustado pela conversa de refino — e todos recalculam em cima
// das linhas originais.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Dados } from "./planilha";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

/** Planilha apagada sozinha depois disso. Dado do usuário não fica para sempre sem necessidade. */
export const DIAS_DE_GUARDA = 30;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS planilhas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    linhas INTEGER NOT NULL,
    criadoEm TEXT NOT NULL,
    expiraEm TEXT NOT NULL
  )`);
  return db;
}

export function guardarDados(dados: Dados): string {
  const id = crypto.randomBytes(9).toString("base64url");
  const agora = new Date();
  const expira = new Date(agora.getTime() + DIAS_DE_GUARDA * 86_400_000);
  abrir()
    .prepare("INSERT INTO planilhas (id, nome, conteudo, linhas, criadoEm, expiraEm) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, dados.nome, JSON.stringify(dados), dados.linhas.length, agora.toISOString(), expira.toISOString());
  return id;
}

export function obterDados(id: string): Dados | null {
  const linha = abrir().prepare("SELECT conteudo FROM planilhas WHERE id = ?").get(id) as { conteudo: string } | undefined;
  if (!linha) return null;
  try {
    return JSON.parse(linha.conteudo) as Dados;
  } catch (err) {
    console.error("Planilha guardada ilegível:", id, err);
    return null;
  }
}

export function apagarDados(id: string): void {
  abrir().prepare("DELETE FROM planilhas WHERE id = ?").run(id);
}

/** Roda na subida do servidor, junto com limparExpirados() do histórico (ver instrumentation.ts). */
export function limparPlanilhasExpiradas(): void {
  abrir().prepare("DELETE FROM planilhas WHERE expiraEm < ?").run(new Date().toISOString());
}

// Questionários salvos pelo editor (components/EditorPerguntas.tsx): uma cópia editável do
// questionário modelo (ou de um gerado para um setor), guardada para reabrir depois.
// Usa o mesmo arquivo SQLite de lib/store.ts/lib/historico.ts, em uma tabela própria.
// "Salvar" com o mesmo título atualiza a linha existente (US-029) em vez de duplicar — a decisão de
// quando atualizar e quando inserir mora em lib/link-avaliacao.ts:guardarQuestionario, que sabe se
// o questionário salvo está em uso por uma avaliação aberta.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Questionario } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS questionarios (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    questionario TEXT NOT NULL,
    criadoEm TEXT NOT NULL
  )`);
  return db;
}

export type QuestionarioSalvo = { id: string; titulo: string; questionario: Questionario; criadoEm: string };

type Linha = { id: string; titulo: string; questionario: string; criadoEm: string };

function linhaParaSalvo(l: Linha): QuestionarioSalvo {
  return { id: l.id, titulo: l.titulo, questionario: JSON.parse(l.questionario), criadoEm: l.criadoEm };
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/** Insere uma cópia nova do questionário e devolve o id gerado. */
export function salvar({ titulo, questionario }: { titulo: string; questionario: Questionario }): string {
  const id = gerarId();
  const criadoEm = new Date().toISOString();
  abrir()
    .prepare("INSERT INTO questionarios (id, titulo, questionario, criadoEm) VALUES (?, ?, ?, ?)")
    .run(id, titulo, JSON.stringify(questionario), criadoEm);
  return id;
}

/** Regrava o conteúdo (e o título) de um questionário já salvo; a data passa a ser a de agora, para ele subir na lista. */
export function atualizar(id: string, { titulo, questionario }: { titulo: string; questionario: Questionario }): boolean {
  const r = abrir()
    .prepare("UPDATE questionarios SET titulo = ?, questionario = ?, criadoEm = ? WHERE id = ?")
    .run(titulo, JSON.stringify(questionario), new Date().toISOString(), id);
  return Number(r.changes) > 0;
}

export function obter(id: string): QuestionarioSalvo | null {
  const linha = abrir().prepare("SELECT * FROM questionarios WHERE id = ?").get(id) as Linha | undefined;
  return linha ? linhaParaSalvo(linha) : null;
}

/** Questionário salvo com este título (comparação sem diferenciar maiúsculas nem espaços nas pontas), o mais recente. */
export function obterPorTitulo(titulo: string): QuestionarioSalvo | null {
  const linha = abrir()
    .prepare("SELECT * FROM questionarios WHERE lower(trim(titulo)) = lower(trim(?)) ORDER BY criadoEm DESC LIMIT 1")
    .get(titulo) as Linha | undefined;
  return linha ? linhaParaSalvo(linha) : null;
}

/** Lista os mais recentes primeiro, sem o questionário inteiro (usado em "Meus questionários"). */
export function listar(limite = 20): Pick<QuestionarioSalvo, "id" | "titulo" | "criadoEm">[] {
  const linhas = abrir()
    .prepare("SELECT id, titulo, criadoEm FROM questionarios ORDER BY criadoEm DESC LIMIT ?")
    .all(limite) as Pick<Linha, "id" | "titulo" | "criadoEm">[];
  return linhas;
}

export function apagar(id: string): void {
  abrir().prepare("DELETE FROM questionarios WHERE id = ?").run(id);
}

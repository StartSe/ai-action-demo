// Respostas reais recebidas por um link de avaliação (US-012): cada linha já sai separada em
// área/cargo/valores (mesmo formato de lib/types.ts:Resposta), gravada pelo callback do formulário
// "bussola" (lib/link-avaliacao.ts) assim que a pessoa envia — sem chamar a IA. A análise dessas
// respostas (nível geral por dimensão) é a US-013; aqui só existe a gravação e a leitura crua.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Resposta } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS respostas_avaliacao (
    id TEXT PRIMARY KEY,
    codigo TEXT NOT NULL,
    questionarioId TEXT NOT NULL,
    area TEXT NULL,
    cargo TEXT NULL,
    valores TEXT NOT NULL,
    criadoEm TEXT NOT NULL
  )`);
  return db;
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

type Linha = { id: string; codigo: string; questionarioId: string; area: string | null; cargo: string | null; valores: string; criadoEm: string };

function linhaParaResposta(l: Linha): Resposta {
  const respondente = l.area || l.cargo ? { area: l.area || undefined, cargo: l.cargo || undefined } : undefined;
  return { id: l.id, respondente, valores: JSON.parse(l.valores), criadoEm: l.criadoEm };
}

/** Grava uma resposta recebida pelo link público (`codigo` = token do formulário), ligada ao questionário. */
export function salvar({ codigo, questionarioId, area, cargo, valores }: { codigo: string; questionarioId: string; area?: string; cargo?: string; valores: Record<string, string> }): string {
  const id = gerarId();
  const criadoEm = new Date().toISOString();
  abrir()
    .prepare("INSERT INTO respostas_avaliacao (id, codigo, questionarioId, area, cargo, valores, criadoEm) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, codigo, questionarioId, area ?? null, cargo ?? null, JSON.stringify(valores), criadoEm);
  return id;
}

/** Respostas de um link, mais recentes primeiro; já no formato usado por Avaliacao.respostas. */
export function listarPorCodigo(codigo: string, limite = -1): Resposta[] {
  const linhas = abrir()
    .prepare("SELECT * FROM respostas_avaliacao WHERE codigo = ? ORDER BY criadoEm DESC LIMIT ?")
    .all(codigo, limite) as Linha[];
  return linhas.map(linhaParaResposta);
}

/** Todas as respostas já recebidas para um questionário, juntando vários links criados a partir dele. */
export function listarPorQuestionario(questionarioId: string, limite = 2000): Resposta[] {
  const linhas = abrir()
    .prepare("SELECT * FROM respostas_avaliacao WHERE questionarioId = ? ORDER BY criadoEm DESC LIMIT ?")
    .all(questionarioId, limite) as Linha[];
  return linhas.map(linhaParaResposta);
}

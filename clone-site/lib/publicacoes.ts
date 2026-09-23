import crypto from "node:crypto";
import { abrirBanco } from "./store";

export type DestinoPublicacao = "local" | "netlify" | "render";
export type RegistroPublicacao = { id: string; projetoId: string; destino: DestinoPublicacao; versao: number; anterior: number | null; tipo: "publicacao" | "rollback"; criadoEm: string; url: string; deployId: string | null };

function db() {
  const d = abrirBanco();
  d.exec(`CREATE TABLE IF NOT EXISTS publicacoes (
    id TEXT PRIMARY KEY, projetoId TEXT NOT NULL, destino TEXT NOT NULL,
    versao INTEGER NOT NULL, anterior INTEGER, tipo TEXT NOT NULL,
    criadoEm TEXT NOT NULL, url TEXT NOT NULL, deployId TEXT
  )`);
  d.exec("CREATE INDEX IF NOT EXISTS publicacoes_projeto ON publicacoes(projetoId, criadoEm)");
  return d;
}

export function registrarPublicacao(dados: Omit<RegistroPublicacao, "id" | "criadoEm">) {
  db().prepare("INSERT INTO publicacoes (id, projetoId, destino, versao, anterior, tipo, criadoEm, url, deployId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(crypto.randomUUID(), dados.projetoId, dados.destino, dados.versao, dados.anterior, dados.tipo, new Date().toISOString(), dados.url, dados.deployId);
}

export function listarPublicacoes(projetoId: string): RegistroPublicacao[] {
  return db().prepare("SELECT * FROM publicacoes WHERE projetoId = ? ORDER BY rowid DESC").all(projetoId) as RegistroPublicacao[];
}

export function apagarPublicacoes(projetoId: string) {
  db().prepare("DELETE FROM publicacoes WHERE projetoId = ?").run(projetoId);
}

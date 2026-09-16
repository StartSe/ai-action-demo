// Estado próprio deste app sobre cada autoavaliação recebida por link (/f/<token>): o motivo quando a IA
// falhou ao gerar o PDI e o resultado gerado depois por "Gerar PDI agora". lib/formularios.ts
// (compartilhado) grava `resultadoId` só na hora da resposta e não tem coluna de erro; em vez de mudar o
// arquivo compartilhado (17 apps), o complemento fica numa tabela própria, chaveada pelo token (cada
// link de autoavaliação aceita uma única resposta, então token ≡ resposta). Arquivo próprio do app.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { ErroIA } from "./ai";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS pdi_autoavaliacoes (
    token TEXT PRIMARY KEY,
    resultadoId TEXT NULL,
    erro TEXT NULL,
    atualizadoEm TEXT NOT NULL
  )`);
  return db;
}

/** O que a tela mostra quando a IA falhou: a frase curada de lib/ai.ts, o código e a ação sugerida (mesmo formato do ErrorBox). */
export type ErroGeracao = { mensagem: string; codigo?: string; acao?: { rotulo: string; url: string } };

export type EstadoAutoavaliacao = { token: string; resultadoId: string | null; erro: ErroGeracao | null; atualizadoEm: string };

type Linha = { token: string; resultadoId: string | null; erro: string | null; atualizadoEm: string };

function linhaParaEstado(l: Linha): EstadoAutoavaliacao {
  return { token: l.token, resultadoId: l.resultadoId, erro: l.erro ? (JSON.parse(l.erro) as ErroGeracao) : null, atualizadoEm: l.atualizadoEm };
}

/** Traduz a exceção da geração numa frase para a tela: ErroIA já vem curado; qualquer outra coisa vira a frase fixa (o detalhe fica no console). */
export function erroDeGeracao(err: unknown): ErroGeracao {
  if (err instanceof ErroIA) return { mensagem: err.message, codigo: err.codigo, acao: err.acao };
  console.error("Falha ao gerar o PDI da autoavaliação:", err);
  return { mensagem: "Não foi possível gerar o PDI agora. Tente de novo em alguns minutos." };
}

export function registrarFalha(token: string, erro: ErroGeracao): void {
  abrir()
    .prepare("INSERT INTO pdi_autoavaliacoes (token, resultadoId, erro, atualizadoEm) VALUES (?, NULL, ?, ?) ON CONFLICT(token) DO UPDATE SET erro = excluded.erro, atualizadoEm = excluded.atualizadoEm")
    .run(token, JSON.stringify(erro), new Date().toISOString());
}

export function registrarResultado(token: string, resultadoId: string): void {
  abrir()
    .prepare("INSERT INTO pdi_autoavaliacoes (token, resultadoId, erro, atualizadoEm) VALUES (?, ?, NULL, ?) ON CONFLICT(token) DO UPDATE SET resultadoId = excluded.resultadoId, erro = NULL, atualizadoEm = excluded.atualizadoEm")
    .run(token, resultadoId, new Date().toISOString());
}

export function obterEstado(token: string): EstadoAutoavaliacao | null {
  const linha = abrir().prepare("SELECT * FROM pdi_autoavaliacoes WHERE token = ?").get(token) as Linha | undefined;
  return linha ? linhaParaEstado(linha) : null;
}

/** Estados de vários tokens de uma vez (lista "Autoavaliações recebidas"), sem uma consulta por linha. */
export function estadosPorToken(tokens: string[]): Map<string, EstadoAutoavaliacao> {
  const mapa = new Map<string, EstadoAutoavaliacao>();
  if (tokens.length === 0) return mapa;
  const marcadores = tokens.map(() => "?").join(", ");
  const linhas = abrir().prepare(`SELECT * FROM pdi_autoavaliacoes WHERE token IN (${marcadores})`).all(...tokens) as Linha[];
  for (const l of linhas) mapa.set(l.token, linhaParaEstado(l));
  return mapa;
}

import { randomUUID } from "node:crypto";
import { abrirBanco } from "./store";
import { AppError } from "./api";
import { contexto } from "./contexto";
import { carregarBase } from "./base";
import { listarPlanilhas } from "./planilhas";
import type { SessaoConversa } from "./types";
function db() {
  const b = abrirBanco();
  b.exec(`CREATE TABLE IF NOT EXISTS conversas (id TEXT PRIMARY KEY, titulo TEXT NOT NULL, fontes TEXT NOT NULL, criado_em TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mensagens (id TEXT PRIMARY KEY, planilha_id TEXT NOT NULL, json TEXT NOT NULL, criado_em TEXT NOT NULL);`);
  return b;
}
function ler(row: Record<string, unknown>): SessaoConversa {
  return { id: String(row.id), titulo: String(row.titulo), fontes: JSON.parse(String(row.fontes)), criadoEm: String(row.criado_em) };
}
export function listarConversas(): SessaoConversa[] {
  const b = db();
  if (!b.prepare("SELECT id FROM conversas LIMIT 1").get()) {
    const base = carregarBase();
    const fontes = [base.matriculas, base.custos, base.marketing].filter(p => p !== null).map(p => p.id);
    b.prepare("INSERT INTO conversas VALUES (?, ?, ?, ?)").run("base", "Primeira conversa", JSON.stringify(fontes), new Date().toISOString());
  }
  return b.prepare("SELECT * FROM conversas ORDER BY criado_em DESC, rowid DESC").all().map(ler);
}
export function obterConversa(id: string): SessaoConversa {
  const row = db().prepare("SELECT * FROM conversas WHERE id = ?").get(id);
  if (!row) throw new AppError("Conversa não encontrada. Abra outra conversa no histórico.", 404);
  return ler(row);
}
export function criarConversa(fontes: unknown): SessaoConversa {
  if (!Array.isArray(fontes) || fontes.length > 3 || fontes.some(f => typeof f !== "string") || new Set(fontes).size !== fontes.length) throw new AppError("Selecione até três fontes: matrículas, custos e marketing.");
  const planilhas = listarPlanilhas();
  const escolhidas = fontes.map(id => {
    const p = planilhas.find(p => p.id === id);
    if (!p) throw new AppError("Uma das fontes não está mais disponível. Atualize os conectores.");
    if (p.papelPlanilha === "outra") throw new AppError(`Confirme o mapeamento de ${p.nome} antes de analisar.`);
    return p;
  });
  if (new Set(escolhidas.map(p => p.papelPlanilha)).size !== escolhidas.length) throw new AppError("Selecione apenas uma planilha de cada tipo.");
  if (escolhidas.some(p => p.demo) && escolhidas.some(p => !p.demo)) throw new AppError("Use suas planilhas ou a base de exemplo, sem misturá-las.");
  const sessao = { id: randomUUID(), titulo: "Nova conversa", fontes: fontes as string[], criadoEm: new Date().toISOString() };
  db().prepare("INSERT INTO conversas VALUES (?, ?, ?, ?)").run(sessao.id, sessao.titulo, JSON.stringify(sessao.fontes), sessao.criadoEm);
  return sessao;
}
export function excluirConversa(id: string) {
  obterConversa(id);
  const b = db();
  b.exec("BEGIN");
  try {
    b.prepare("DELETE FROM mensagens WHERE planilha_id = ?").run(id);
    b.prepare("DELETE FROM conversas WHERE id = ?").run(id);
    b.exec("COMMIT");
  } catch(e) { b.exec("ROLLBACK"); throw e; }
}
export function titularConversa(id: string, titulo: string) {
  db().prepare("UPDATE conversas SET titulo = ? WHERE id = ? AND titulo IN ('Nova conversa', 'Primeira conversa')").run(titulo.slice(0, 70), id);
}
export function comConversa<T>(id: string, fn: () => T): T {
  const c = obterConversa(id);
  return contexto.run({ id: c.id, fontes: c.fontes }, fn);
}

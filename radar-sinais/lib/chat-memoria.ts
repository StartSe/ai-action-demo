import { randomUUID } from "node:crypto";
import { abrirBanco } from "./store";
import type { Fonte, No } from "./types";
export type MensagemRadar = { papel: "usuario" | "agente"; texto: string };
export type MensagemSalva = MensagemRadar & { id: string; criadoEm: string; resultadoId: string; fontes?: Fonte[]; nos?: No[]; canal?: "texto" | "voz" };
function banco() {
  const db = abrirBanco();
  db.exec(`CREATE TABLE IF NOT EXISTS radar_mensagens (id TEXT PRIMARY KEY, radarId TEXT NOT NULL, dados TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS mensagens_radar ON radar_mensagens(radarId);
    CREATE TABLE IF NOT EXISTS radar_chat_locks (radarId TEXT PRIMARY KEY, token TEXT NOT NULL, ate INTEGER NOT NULL)`);
  return db;
}
export function memoriaRadar(radarId: string, limite = 100): MensagemSalva[] {
  return (banco().prepare("SELECT dados FROM radar_mensagens WHERE radarId = ? ORDER BY rowid DESC LIMIT ?").all(radarId, limite) as { dados: string }[]).reverse().map(r => JSON.parse(r.dados));
}
export function guardarTurno(radarId: string, resultadoId: string, pergunta: string, resposta: { resposta: string; fontes: Fonte[]; nos: No[] }, canal: "texto" | "voz" = "texto") {
  const db = banco(), criadoEm = new Date().toISOString();
  const mensagens: MensagemSalva[] = [{ id: randomUUID(), criadoEm, resultadoId, papel: "usuario", texto: pergunta, canal }, { id: randomUUID(), criadoEm, resultadoId, papel: "agente", texto: resposta.resposta, fontes: resposta.fontes, nos: resposta.nos, canal }];
  db.exec("BEGIN IMMEDIATE");
  try { for (const m of mensagens) db.prepare("INSERT INTO radar_mensagens VALUES (?, ?, ?)").run(m.id, radarId, JSON.stringify(m)); db.exec("COMMIT"); }
  catch(e) { db.exec("ROLLBACK"); throw e; }
  return mensagens;
}
export function bloquearConversa(radarId: string): (() => void) | null {
  const token = randomUUID();
  const r = banco().prepare("INSERT INTO radar_chat_locks VALUES (?, ?, ?) ON CONFLICT(radarId) DO UPDATE SET token = excluded.token, ate = excluded.ate WHERE radar_chat_locks.ate < ?").run(radarId, token, Date.now() + 5 * 60_000, Date.now());
  return r.changes ? () => { banco().prepare("DELETE FROM radar_chat_locks WHERE radarId = ? AND token = ?").run(radarId, token); } : null;
}

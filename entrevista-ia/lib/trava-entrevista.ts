import { randomUUID } from "node:crypto";
import { banco } from "./banco";

/** O processo de áudio e o Next compartilham o banco, mas não os Maps em memória. */
export async function comTurnoExclusivo<T>(id: string, executar: () => Promise<T>): Promise<T> {
  const db = banco();
  db.exec(`CREATE TABLE IF NOT EXISTS turno_entrevista (
    entrevistaId TEXT PRIMARY KEY REFERENCES entrevistas(id) ON DELETE CASCADE,
    dono TEXT NOT NULL, expiraEm INTEGER NOT NULL
  )`);
  const dono = randomUUID();
  const limite = Date.now() + 12000;
  for (;;) {
    const resultado = db.prepare(`INSERT INTO turno_entrevista (entrevistaId, dono, expiraEm) VALUES (?, ?, ?)
      ON CONFLICT(entrevistaId) DO UPDATE SET dono = excluded.dono, expiraEm = excluded.expiraEm
      WHERE turno_entrevista.expiraEm < ?`).run(id, dono, Date.now() + 60000, Date.now());
    if (Number(resultado.changes)) break;
    if (Date.now() >= limite) throw new Error("Sua última resposta ainda está sendo organizada. Aguarde alguns segundos e tente novamente.");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  try { return await executar(); }
  finally { db.prepare("DELETE FROM turno_entrevista WHERE entrevistaId = ? AND dono = ?").run(id, dono); }
}

import { abrirBanco } from "./store";
import type { QualificacaoProfunda } from "./qualificacao-profunda-tipos";
function banco() {
  const db = abrirBanco();
  db.exec("CREATE TABLE IF NOT EXISTS qualificacoes_profundas (lead_id TEXT PRIMARY KEY, dados TEXT NOT NULL)");
  return db;
}
export function obterQualificacaoProfunda(leadId: string): QualificacaoProfunda | null {
  const row = banco().prepare("SELECT dados FROM qualificacoes_profundas WHERE lead_id = ?").get(leadId) as { dados: string } | undefined;
  return row ? JSON.parse(row.dados) : null;
}
export function salvarQualificacaoProfunda(dados: QualificacaoProfunda) {
  banco().prepare("INSERT INTO qualificacoes_profundas (lead_id, dados) VALUES (?, ?) ON CONFLICT(lead_id) DO UPDATE SET dados = excluded.dados").run(dados.leadId, JSON.stringify(dados));
}
export function apagarQualificacaoProfunda(leadId: string) {
  banco().prepare("DELETE FROM qualificacoes_profundas WHERE lead_id = ?").run(leadId);
}

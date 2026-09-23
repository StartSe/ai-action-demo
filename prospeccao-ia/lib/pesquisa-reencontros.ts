import { abrirBanco } from "./store";

function banco() {
  const d = abrirBanco();
  d.exec(`CREATE TABLE IF NOT EXISTS pesquisa_reencontros (
    prospeccao_id TEXT NOT NULL, lead_id TEXT NOT NULL, PRIMARY KEY (prospeccao_id, lead_id)
  )`);
  return d;
}

/** Mantém a referência ao contato existente sem duplicar cadastro ou estado comercial. */
export function registrarReencontro(id: string, leadId: string) {
  banco().prepare(`INSERT OR IGNORE INTO pesquisa_reencontros (prospeccao_id, lead_id)
    SELECT atual.id, leads.id FROM prospeccoes atual JOIN leads ON leads.id = ?
    JOIN prospeccoes anterior ON anterior.id = leads.prospeccao_id
    WHERE atual.id = ? AND atual.estado = 'executando' AND atual.produto_id = anterior.produto_id AND atual.id != anterior.id`).run(leadId, id);
}

export function idsReencontrados(id: string): string[] {
  return (banco().prepare("SELECT lead_id FROM pesquisa_reencontros WHERE prospeccao_id = ? ORDER BY rowid").all(id) as { lead_id: string }[]).map(l => l.lead_id);
}

export function apagarReencontros(id: string, leadId = false) {
  banco().prepare(`DELETE FROM pesquisa_reencontros WHERE ${leadId ? "lead_id" : "prospeccao_id"} = ?`).run(id);
}

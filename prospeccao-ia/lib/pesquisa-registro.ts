import { abrirBanco, getConfig } from "./store";
export type ConsultaPesquisa = { id: number; fonte: string; acao: string; consulta: string; estado: string; quantidade: number; mensagem: string | null };
export type DecisaoPesquisa = { id: number; mensagem: string; criadoEm: string };
function banco() {
  const d = abrirBanco();
  d.exec(`CREATE TABLE IF NOT EXISTS pesquisa_consultas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, prospeccao_id TEXT NOT NULL, fonte TEXT NOT NULL,
    acao TEXT NOT NULL, consulta TEXT NOT NULL, estado TEXT NOT NULL, quantidade INTEGER NOT NULL DEFAULT 0,
    mensagem TEXT, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); CREATE INDEX IF NOT EXISTS pesquisa_por_prospeccao ON pesquisa_consultas(prospeccao_id);
  CREATE TABLE IF NOT EXISTS pesquisa_decisoes (id INTEGER PRIMARY KEY AUTOINCREMENT, prospeccao_id TEXT NOT NULL, mensagem TEXT NOT NULL, criado_em TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS decisoes_por_prospeccao ON pesquisa_decisoes(prospeccao_id)`);
  return d;
}
export function registrarConsulta(prospeccaoId: string | undefined, fonte: string, acao: string, consulta: string): number | undefined {
  if (!prospeccaoId) return;
  return Number(banco().prepare("INSERT INTO pesquisa_consultas (prospeccao_id, fonte, acao, consulta, estado) VALUES (?, ?, ?, ?, 'consultando')").run(prospeccaoId, fonte, acao, consulta.slice(0, 500)).lastInsertRowid);
}
export function concluirConsulta(id: number | undefined, estado: "concluida" | "vazia" | "falhou" | "limite" | "pendente", quantidade: number, mensagem?: string) {
  if (id === undefined) return;
  banco().prepare("UPDATE pesquisa_consultas SET estado = ?, quantidade = ?, mensagem = ? WHERE id = ?").run(estado, quantidade, mensagem ?? null, id);
}
export function consultasDaProspeccao(id: string): ConsultaPesquisa[] {
  return banco().prepare("SELECT id, fonte, acao, consulta, estado, quantidade, mensagem FROM pesquisa_consultas WHERE prospeccao_id = ? ORDER BY id").all(id) as ConsultaPesquisa[];
}
export function limiteDaFonte(prospeccaoId: string | undefined, fonte: string): boolean {
  if (!prospeccaoId) return false;
  const numero = Number(getConfig(`${fonte.toUpperCase()}_TETO_CONSULTAS`) || 10);
  const teto = Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : 10;
  const { quantidade } = banco().prepare("SELECT COUNT(*) quantidade FROM pesquisa_consultas WHERE prospeccao_id = ? AND fonte = ? AND estado != 'limite'").get(prospeccaoId, fonte) as { quantidade: number };
  return quantidade >= teto;
}

export function apagarConsultas(prospeccaoId: string): void {
  banco().prepare("DELETE FROM pesquisa_consultas WHERE prospeccao_id = ?").run(prospeccaoId);
  banco().prepare("DELETE FROM pesquisa_decisoes WHERE prospeccao_id = ?").run(prospeccaoId);
}

export function registrarDecisao(prospeccaoId: string, mensagem: string): void {
  banco().prepare("INSERT INTO pesquisa_decisoes (prospeccao_id, mensagem, criado_em) VALUES (?, ?, ?)").run(prospeccaoId, mensagem.slice(0, 600), new Date().toISOString());
}

export function decisoesDaPesquisa(prospeccaoId: string): DecisaoPesquisa[] {
  return banco().prepare("SELECT id, mensagem, criado_em AS criadoEm FROM pesquisa_decisoes WHERE prospeccao_id = ? ORDER BY id").all(prospeccaoId) as DecisaoPesquisa[];
}

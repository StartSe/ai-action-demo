import { banco } from "./banco";

export type PassoPesquisa = { titulo: string; estado: "em_andamento" | "concluido" | "aviso" | "falhou"; iniciadoEm?: string; concluidoEm?: string };
export type ProgressoPesquisa = { passos: PassoPesquisa[]; atualizadoEm: string };
function db() {
  const d = banco();
  d.exec(`CREATE TABLE IF NOT EXISTS progresso_pesquisa (
    candidatoId TEXT PRIMARY KEY REFERENCES candidatos(id) ON DELETE CASCADE,
    dados TEXT NOT NULL
  )`);
  return d;
}
export function lerProgressoPesquisa(id: string): ProgressoPesquisa | null {
  const linha = db().prepare("SELECT dados FROM progresso_pesquisa WHERE candidatoId = ?").get(id) as { dados: string } | undefined;
  return linha ? JSON.parse(linha.dados) as ProgressoPesquisa : null;
}
function gravar(id: string, passos: PassoPesquisa[]) {
  db().prepare("INSERT INTO progresso_pesquisa (candidatoId, dados) VALUES (?, ?) ON CONFLICT(candidatoId) DO UPDATE SET dados = excluded.dados")
    .run(id, JSON.stringify({ passos, atualizadoEm: new Date().toISOString() }));
}
export function iniciarProgressoPesquisa(id: string) {
  gravar(id, [{ titulo: "Preparando a pesquisa e verificando a conexão", estado: "em_andamento", iniciadoEm: new Date().toISOString() }]);
}
export function etapaPesquisa(id: string, titulo: string) {
  const progresso = lerProgressoPesquisa(id);
  if (!progresso) return;
  const passos = progresso.passos.map((p): PassoPesquisa => p.estado === "em_andamento" ? { ...p, estado: "concluido", concluidoEm: new Date().toISOString() } : p);
  gravar(id, [...passos, { titulo, estado: "em_andamento", iniciadoEm: new Date().toISOString() }]);
}
export function concluirEtapaPesquisa(id: string, estado: "concluido" | "aviso" | "falhou") {
  const progresso = lerProgressoPesquisa(id);
  if (!progresso) return;
  gravar(id, progresso.passos.map((p) => p.estado === "em_andamento" ? { ...p, estado, concluidoEm: new Date().toISOString() } : p));
}

import { banco } from "./banco";
import { listarFontes } from "./candidatos";
import type { Coleta } from "./pesquisa";

function db() {
  const d = banco();
  d.exec(`CREATE TABLE IF NOT EXISTS coleta_pesquisa (
    candidatoId TEXT PRIMARY KEY REFERENCES candidatos(id) ON DELETE CASCADE,
    dados TEXT NOT NULL
  )`);
  return d;
}

export function salvarColeta(id: string, coleta: Coleta) {
  db().prepare("INSERT INTO coleta_pesquisa (candidatoId, dados) VALUES (?, ?) ON CONFLICT(candidatoId) DO UPDATE SET dados = excluded.dados")
    .run(id, JSON.stringify(coleta));
}

export function lerColetaSalva(id: string): Coleta | null {
  const fontes = listarFontes(id).filter((f) => f.tipo !== "cv" && f.url && f.conteudo.trim());
  const linha = db().prepare("SELECT dados FROM coleta_pesquisa WHERE candidatoId = ?").get(id) as { dados: string } | undefined;
  if (linha) {
    const coleta = JSON.parse(linha.dados) as Coleta;
    // Uma nova coleta pode ter substituído as páginas antes de ser interrompida.
    if (coleta.paginas.length && coleta.paginas.every((p) => fontes.some((f) => f.id === p.fonteId))) return coleta;
  }
  // Recupera também pesquisas interrompidas antes da existência deste registro.
  if (!fontes.length) return null;
  return { status: "coletada", consulta: "Material da pesquisa anterior", resultados: [], parcial: true, chamadas: 0,
    paginas: fontes.map((f) => ({ tipo: f.tipo, url: f.url!, titulo: f.titulo || f.url!, conteudo: f.conteudo, fonteId: f.id })) };
}

import { abrirBanco } from "./store";
import { obterProspeccao } from "./workspace";

// Arquivar organiza a lista sem alterar a execução nem apagar leads e abordagens.
function banco() {
  const d = abrirBanco();
  d.exec(`CREATE TABLE IF NOT EXISTS arquivo_prospeccoes (
    prospeccao_id TEXT PRIMARY KEY,
    arquivada_em TEXT NOT NULL
  )`);
  return d;
}
export function datasArquivamento(): Map<string, string> {
  const linhas = banco().prepare("SELECT prospeccao_id, arquivada_em FROM arquivo_prospeccoes").all() as { prospeccao_id: string; arquivada_em: string }[];
  return new Map(linhas.map(l => [l.prospeccao_id, l.arquivada_em]));
}
export function definirArquivamento(id: string, arquivada: boolean): { arquivadaEm: string | null } | null {
  if (!obterProspeccao(id)) return null;
  const d = banco();
  if (arquivada) {
    d.prepare("INSERT INTO arquivo_prospeccoes (prospeccao_id, arquivada_em) VALUES (?, ?) ON CONFLICT(prospeccao_id) DO NOTHING").run(id, new Date().toISOString());
  } else {
    d.prepare("DELETE FROM arquivo_prospeccoes WHERE prospeccao_id = ?").run(id);
  }
  const linha = d.prepare("SELECT arquivada_em FROM arquivo_prospeccoes WHERE prospeccao_id = ?").get(id) as { arquivada_em: string } | undefined;
  return { arquivadaEm: linha?.arquivada_em ?? null };
}

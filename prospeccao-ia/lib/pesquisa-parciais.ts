import { abrirBanco } from "./store";
import { perfilLinkedin } from "./perfil-linkedin";
import { urlAvatarPublico } from "./avatar-pessoa";
import type { ResultadoBuscaWeb } from "./descoberta";

export type FaseCandidato = "encontrado" | "verificando" | "analisando";
export type CandidatoParcial = {
  url: string; nome: string; cargo: string | null; empresa: string | null;
  cidade: string | null; fontes: string[]; fase: FaseCandidato; avatarUrl: string | null;
};

function banco() {
  const d = abrirBanco();
  d.exec(`CREATE TABLE IF NOT EXISTS pesquisa_candidatos (
    prospeccao_id TEXT NOT NULL, url TEXT NOT NULL, dados TEXT NOT NULL,
    PRIMARY KEY (prospeccao_id, url)
  )`);
  return d;
}

export function candidatosDaPesquisa(id: string): CandidatoParcial[] {
  const linhas = banco().prepare("SELECT dados FROM pesquisa_candidatos WHERE prospeccao_id = ? ORDER BY rowid").all(id) as { dados: string }[];
  return linhas.map(l => JSON.parse(l.dados) as CandidatoParcial);
}

/** Prévia persistente, sem promover candidatos a leads ou atribuir aderência antes da análise. */
export function registrarCandidatosParciais(id: string, itens: ResultadoBuscaWeb[], fase: FaseCandidato = "encontrado") {
  const d = banco();
  const anteriores = new Map(candidatosDaPesquisa(id).map(c => [c.url, c]));
  const gravar = d.prepare(`INSERT INTO pesquisa_candidatos (prospeccao_id, url, dados)
    SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM prospeccoes WHERE id = ? AND estado = 'executando')
    ON CONFLICT (prospeccao_id, url) DO UPDATE SET dados = excluded.dados`);
  const fases: FaseCandidato[] = ["encontrado", "verificando", "analisando"];
  for (const item of itens) {
    const url = perfilLinkedin(item.url);
    if (!url) continue;
    const anterior = anteriores.get(url);
    const partes = item.titulo.split("|")[0].split(/\s[-–]\s/).map(p => p.trim());
    const candidato: CandidatoParcial = {
      url, nome: item.pessoa?.nome || anterior?.nome || partes[0] || "Perfil encontrado",
      cargo: item.pessoa?.cargo || anterior?.cargo || partes[1] || null,
      empresa: item.pessoa?.empresa || anterior?.empresa || partes[2] || null,
      cidade: item.pessoa?.cidade || anterior?.cidade || null,
      avatarUrl: urlAvatarPublico(item.avatarUrl) || anterior?.avatarUrl || null,
      fontes: [...new Set([...(anterior?.fontes ?? []), ...(item.fontes ?? [])])],
      fase: fases[Math.max(fases.indexOf(fase), fases.indexOf(anterior?.fase ?? "encontrado"))],
    };
    gravar.run(id, url, JSON.stringify(candidato), id);
    anteriores.set(url, candidato);
  }
}

export function apagarCandidatosParciais(id: string) {
  banco().prepare("DELETE FROM pesquisa_candidatos WHERE prospeccao_id = ?").run(id);
}

export function retirarCandidatoParcial(id: string, linkedin: string | null) {
  const url = linkedin && perfilLinkedin(linkedin);
  if (url) banco().prepare("DELETE FROM pesquisa_candidatos WHERE prospeccao_id = ? AND url = ?").run(id, url);
}

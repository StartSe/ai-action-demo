// Rastreamento de quais leads já foram entregues pela rotina "leads novos toda semana" (lib/rotinas-do-app.ts),
// para não repetir o mesmo lead em duas semanas seguidas. Arquivo próprio deste app (não compartilhado):
// usa o mesmo arquivo SQLite de lib/store.ts, com sua própria tabela e conexão (mesmo padrão de lib/historico.ts/lib/rotinas.ts).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { buscarLeads } from "./leads";
import type { DadosBusca } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS leads_vistos (
    perfil TEXT NOT NULL,
    leadId TEXT NOT NULL,
    criadoEm TEXT NOT NULL,
    PRIMARY KEY (perfil, leadId)
  )`);
  return db;
}

/** Chave estável do perfil buscado (segmento + cargo + localização + porte), para separar "já vistos" por combinação. */
function chavePerfil(dados: Pick<DadosBusca, "segmento" | "cargo" | "localizacao" | "porte">): string {
  return [dados.segmento, dados.cargo, dados.localizacao, dados.porte].map((v) => String(v || "").trim().toLowerCase()).join("|");
}

function jaVistos(perfil: string): Set<string> {
  const linhas = abrir().prepare("SELECT leadId FROM leads_vistos WHERE perfil = ?").all(perfil) as { leadId: string }[];
  return new Set(linhas.map((l) => l.leadId));
}

function marcarVistos(perfil: string, ids: string[]): void {
  if (!ids.length) return;
  const stmt = abrir().prepare("INSERT OR IGNORE INTO leads_vistos (perfil, leadId, criadoEm) VALUES (?, ?, ?)");
  const agora = new Date().toISOString();
  for (const id of ids) stmt.run(perfil, id, agora);
}

/** Busca leads para a rotina semanal, excluindo quem já foi entregue antes para o mesmo perfil (segmento+cargo+localização+porte). */
export async function buscarLeadsNovos(dados: DadosBusca) {
  const perfil = chavePerfil(dados);
  const vistos = jaVistos(perfil);
  const resultado = await buscarLeads(dados);
  const leads = resultado.leads.filter((l) => !vistos.has(l.id));
  marcarVistos(perfil, leads.map((l) => l.id));
  return { ...resultado, leads };
}

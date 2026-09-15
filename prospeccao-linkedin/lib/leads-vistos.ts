// Rastreamento de quais leads já foram entregues pela rotina "leads novos toda semana" (lib/rotinas-do-app.ts),
// para a mesma pessoa não aparecer em duas semanas. Arquivo próprio deste app (não compartilhado): usa o mesmo
// arquivo SQLite de lib/store.ts, com tabela e conexão próprias (mesmo padrão de lib/historico.ts e lib/rotinas.ts).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { leadsDemoNovos } from "./demo";
import { buscarLeadsProspectHalo, prospectHaloConfigurado } from "./prospecthalo";
import { chavePerfil, type Lead, type Perfil } from "./types";

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

/** Chave estável de um lead entre buscas: a URL do LinkedIn quando existe (o id do Prospect Halo pode ser só a posição na resposta), senão o id. */
export function chaveLead(lead: Lead): string {
  return (lead.linkedinUrl || "").trim().toLowerCase().replace(/\/+$/, "") || lead.id;
}

function jaVistos(perfil: string): Set<string> {
  const linhas = abrir().prepare("SELECT leadId FROM leads_vistos WHERE perfil = ?").all(perfil) as { leadId: string }[];
  return new Set(linhas.map((l) => l.leadId));
}

function marcarVistos(perfil: string, chaves: string[]): void {
  if (!chaves.length) return;
  const stmt = abrir().prepare("INSERT OR IGNORE INTO leads_vistos (perfil, leadId, criadoEm) VALUES (?, ?, ?)");
  const agora = new Date().toISOString();
  for (const chave of chaves) stmt.run(perfil, chave, agora);
}

/**
 * Busca leads para a rotina semanal, excluindo quem já foi entregue para o mesmo perfil, e marca os devolvidos como entregues.
 * Com o Prospect Halo conectado a lista vem dele (lança ErroProspectHalo em falha); sem ele, vem do pool fictício
 * (origem "demo"), que também não se repete entre execuções. Devolve no máximo `quantidade`, os de maior pontuação primeiro.
 */
export async function buscarLeadsNovos(perfil: Perfil, quantidade: number): Promise<Lead[]> {
  const chave = chavePerfil(perfil);
  const vistos = jaVistos(chave);
  const candidatos = prospectHaloConfigurado()
    ? (await buscarLeadsProspectHalo(perfil)).filter((l) => !vistos.has(chaveLead(l)))
    : leadsDemoNovos(perfil, vistos, chaveLead);
  // Dois leads da mesma resposta podem ter a mesma chave (mesma URL): fica só o primeiro.
  const unicos = new Map<string, Lead>();
  for (const l of candidatos) if (!unicos.has(chaveLead(l))) unicos.set(chaveLead(l), l);
  const leads = Array.from(unicos.values()).sort((a, b) => b.pontuacao - a.pontuacao).slice(0, quantidade);
  marcarVistos(chave, leads.map(chaveLead));
  return leads;
}

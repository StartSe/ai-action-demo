import { abrirBanco } from "./store";
import { obter } from "./historico";
import { obterRadar } from "./radares";
import type { DadosRadar, Radar } from "./types";
import type { Meta } from "./ai";
export type Destaque = { chave: string; tipo: "foco" | "hype" | "artigo"; titulo: string; url?: string; atualizadoEm: string };
function banco() {
  const db = abrirBanco();
  db.exec("CREATE TABLE IF NOT EXISTS radar_destaques (radarId TEXT NOT NULL, chave TEXT NOT NULL, dados TEXT NOT NULL, PRIMARY KEY(radarId, chave))");
  return db;
}
export function listarDestaques(radarId: string): Destaque[] {
  obterRadar(radarId);
  return (banco().prepare("SELECT dados FROM radar_destaques WHERE radarId = ? ORDER BY json_extract(dados, '$.atualizadoEm') DESC, rowid DESC LIMIT 50").all(radarId) as { dados: string }[]).map(r => JSON.parse(r.dados));
}
export function salvarDestaque(corpo: unknown) {
  const v = corpo as { resultadoId?: string; sinalId?: string; url?: string; tipo?: string; remover?: boolean } | null;
  if (!v || typeof v.resultadoId !== "string") throw new Error("Escolha uma análise salva.");
  const analise = obter<DadosRadar, Radar, Meta>(v.resultadoId);
  if (!analise || analise.tipo !== "radar" || analise.meta.demo) throw new Error("Escolha uma análise com fontes reais.");
  const radarId = obterRadar(analise.entrada.radarId).id;
  let item: Destaque;
  if (v.tipo === "artigo") {
    const fonte = analise.saida.sinais.flatMap(s => s.fontes).find(f => f.url === v.url);
    if (!fonte) throw new Error("O artigo não pertence a esta análise.");
    item = { chave: `artigo:${fonte.url}`, tipo: "artigo", titulo: fonte.titulo, url: fonte.url, atualizadoEm: new Date().toISOString() };
  } else {
    const sinal = analise.saida.sinais.find(s => s.id === v.sinalId);
    if (!sinal || !["foco", "hype"].includes(v.tipo || "")) throw new Error("Escolha um sinal e marque foco ou possível hype.");
    item = { chave: `sinal:${sinal.titulo.trim().toLowerCase()}`, tipo: v.tipo as "foco" | "hype", titulo: sinal.titulo, atualizadoEm: new Date().toISOString() };
  }
  if (v.remover) banco().prepare("DELETE FROM radar_destaques WHERE radarId = ? AND chave = ?").run(radarId, item.chave);
  else {
    if (listarDestaques(radarId).length >= 50 && !banco().prepare("SELECT 1 FROM radar_destaques WHERE radarId = ? AND chave = ?").get(radarId, item.chave)) throw new Error("Você já tem 50 destaques. Remova um antes de adicionar outro.");
    banco().prepare("INSERT INTO radar_destaques VALUES (?, ?, ?) ON CONFLICT(radarId, chave) DO UPDATE SET dados = excluded.dados").run(radarId, item.chave, JSON.stringify(item));
  }
  return listarDestaques(radarId);
}

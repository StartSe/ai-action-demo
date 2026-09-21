// Visitas do site publicado (/s/<slug>): uma linha por abertura do HTML, com dia, hora, origem (host do Referer)
// e dispositivo (celular × computador pelo User-Agent). Robôs conhecidos e a prévia (?previa=1) não contam.
// Sem nenhum serviço externo: o próprio app é quem serve a página, então é ele quem conta.
import crypto from "node:crypto";
import { abrirBanco } from "./store";

export type Dispositivo = "celular" | "computador";
export type ResumoMetricas = {
  dias: number;
  total: number;
  porDia: { dia: string; visitas: number }[];
  celular: number;
  computador: number;
  origens: { origem: string; visitas: number }[];
  /** Variação em % contra o período anterior de mesmo tamanho; null quando o anterior teve zero visitas. */
  comparadoAoPeriodoAnterior: number | null;
  totalAnterior: number;
};

const ROBOS = /bot|crawl|spider|slurp|preview|headlesschrome|lighthouse|facebookexternalhit|whatsapp|telegram|curl\/|wget\/|python-requests|monitor/i;
const CELULAR = /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i;

let tabelaPronta = false;
function db() {
  const d = abrirBanco();
  if (!tabelaPronta) {
    d.exec(`CREATE TABLE IF NOT EXISTS visitas (
      id TEXT PRIMARY KEY,
      projetoId TEXT NOT NULL,
      dia TEXT NOT NULL,
      hora INTEGER NOT NULL,
      origem TEXT NOT NULL,
      dispositivo TEXT NOT NULL,
      caminho TEXT NOT NULL,
      criadoEm TEXT NOT NULL
    )`);
    d.exec(`CREATE INDEX IF NOT EXISTS visitas_projeto_dia ON visitas (projetoId, dia)`);
    tabelaPronta = true;
  }
  return d;
}

/** "AAAA-MM-DD" no fuso do servidor (nunca toISOString().slice: em UTC-3 a data vira o dia seguinte à noite; ver CLAUDE.md). */
export function diaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function origemDe(referer: string | null, hostProprio: string | null): string {
  if (!referer) return "direto";
  try {
    const host = new URL(referer).hostname.replace(/^www\./, "").toLowerCase();
    if (!host) return "direto";
    if (hostProprio && host === hostProprio.replace(/^www\./, "").toLowerCase().split(":")[0]) return "o próprio site";
    return host;
  } catch {
    return "direto";
  }
}

/** Conta a abertura de /s/<slug> — chamada sem await pela rota. Devolve false quando a visita não conta (robô, prévia). */
export function registrarVisita(projetoId: string, req: Request): boolean {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("previa") === "1") return false;
    const ua = req.headers.get("user-agent") ?? "";
    if (!ua || ROBOS.test(ua)) return false;
    const agora = new Date();
    db().prepare("INSERT INTO visitas (id, projetoId, dia, hora, origem, dispositivo, caminho, criadoEm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(crypto.randomBytes(9).toString("base64url"), projetoId, diaLocal(agora), agora.getHours(), origemDe(req.headers.get("referer"), req.headers.get("host")), CELULAR.test(ua) ? "celular" : "computador", url.pathname.slice(0, 200), agora.toISOString());
    return true;
  } catch (err) {
    console.error("Falha ao registrar visita", err);
    return false;
  }
}

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return diaLocal(d);
}

/** Visitas dos últimos `dias` (7 ou 30), com a série por dia preenchida (zeros incluídos) e a comparação com o período anterior. */
export function resumo(projetoId: string, dias: number): ResumoMetricas {
  const n = dias === 30 ? 30 : 7;
  const inicio = diasAtras(n - 1);
  const inicioAnterior = diasAtras(2 * n - 1);
  const linhas = db().prepare("SELECT dia, dispositivo, origem FROM visitas WHERE projetoId = ? AND dia >= ?").all(projetoId, inicio) as { dia: string; dispositivo: Dispositivo; origem: string }[];
  const anterior = (db().prepare("SELECT COUNT(*) AS n FROM visitas WHERE projetoId = ? AND dia >= ? AND dia < ?").get(projetoId, inicioAnterior, inicio) as { n: number }).n;
  const porDiaMapa = new Map<string, number>();
  for (let i = n - 1; i >= 0; i--) porDiaMapa.set(diasAtras(i), 0);
  const origensMapa = new Map<string, number>();
  let celular = 0;
  for (const l of linhas) {
    porDiaMapa.set(l.dia, (porDiaMapa.get(l.dia) ?? 0) + 1);
    origensMapa.set(l.origem, (origensMapa.get(l.origem) ?? 0) + 1);
    if (l.dispositivo === "celular") celular++;
  }
  const total = linhas.length;
  return {
    dias: n,
    total,
    porDia: [...porDiaMapa.entries()].map(([dia, visitas]) => ({ dia, visitas })),
    celular,
    computador: total - celular,
    origens: [...origensMapa.entries()].map(([origem, visitas]) => ({ origem, visitas })).sort((a, b) => b.visitas - a.visitas).slice(0, 5),
    comparadoAoPeriodoAnterior: anterior > 0 ? Math.round(((total - anterior) / anterior) * 100) : null,
    totalAnterior: anterior,
  };
}

/** O resumo em uma frase, para o agente e para o e-mail semanal. */
export function resumoEmTexto(projetoId: string, dias: number): string {
  const r = resumo(projetoId, dias);
  if (r.total === 0) return `nenhuma visita nos últimos ${r.dias} dias${r.totalAnterior ? ` (o período anterior teve ${r.totalAnterior})` : ""}.`;
  const pctCelular = Math.round((r.celular / r.total) * 100);
  const origem = r.origens[0] ? `${r.origens[0].origem} (${r.origens[0].visitas})` : "direto";
  const variacao = r.comparadoAoPeriodoAnterior === null ? "sem período anterior para comparar" : `${r.comparadoAoPeriodoAnterior >= 0 ? "+" : ""}${r.comparadoAoPeriodoAnterior}% em relação aos ${r.dias} dias anteriores`;
  return `${r.total} visita${r.total === 1 ? "" : "s"} nos últimos ${r.dias} dias, ${pctCelular}% pelo celular, principal origem ${origem}, ${variacao}.`;
}

export function apagarDoProjeto(projetoId: string): void {
  db().prepare("DELETE FROM visitas WHERE projetoId = ?").run(projetoId);
}

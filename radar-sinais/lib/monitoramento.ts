import type { DadosRadar } from "./types";

export const TIPO_MONITORAMENTO = "radar-diario";
export const HORARIOS_PADRAO = ["08:00", "16:00", "20:00"];
export const FUSO_PADRAO = "America/Sao_Paulo";
export type Monitoramento = DadosRadar & { horarios: string[]; fuso: string };

export function validarMonitoramento(valor: unknown): Monitoramento {
  const v = valor as Partial<Monitoramento> | null;
  if (!v || !Array.isArray(v.temas) || v.temas.some(t => typeof t !== "string" || t.length > 200)) throw new Error("Informe termos de até 200 caracteres.");
  const temas = [...new Set(v.temas.map(t => t.trim()).filter(Boolean))];
  if (!temas.length || temas.length > 12) throw new Error("Cadastre de 1 a 12 termos.");
  const horarios = v.horarios ?? HORARIOS_PADRAO;
  if (!Array.isArray(horarios) || !horarios.length || horarios.length > 12 || horarios.some(h => typeof h !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h))) throw new Error("Escolha de 1 a 12 horários no formato HH:MM.");
  const fuso = v.fuso ?? FUSO_PADRAO;
  if (typeof fuso !== "string") throw new Error("Informe um fuso válido.");
  try { new Intl.DateTimeFormat("en", { timeZone: fuso }).format(); } catch { throw new Error("Fuso inválido. Exemplo: America/Sao_Paulo."); }
  const periodoDias = v.periodoDias ?? 7;
  if (![7, 30, 90].includes(periodoDias)) throw new Error("Período inválido.");
  if (v.setor !== undefined && (typeof v.setor !== "string" || v.setor.length > 200)) throw new Error("Setor inválido.");
  if (v.radarId !== undefined && (typeof v.radarId !== "string" || !v.radarId || v.radarId.length > 80)) throw new Error("Radar inválido.");
  return { radarId: v.radarId, temas, horarios: [...new Set(horarios)].sort(), fuso, periodoDias, setor: v.setor?.trim() || undefined };
}

function relogio(data: Date, fuso: string): string {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(data);
  const campo = (nome: string) => p.find(v => v.type === nome)!.value;
  return `${campo("year")}-${campo("month")}-${campo("day")}T${campo("hour")}:${campo("minute")}`;
}

/** Compara slots no relógio do fuso; retomadas executam apenas o mais recente, sem rajadas atrasadas. */
export function monitoramentoDevido(p: Monitoramento, ultima: string | null, criadoEm: string, agora: Date): boolean {
  const atual = relogio(agora, p.fuso);
  const anterior = relogio(new Date(ultima ?? criadoEm), p.fuso);
  const dias = new Set([atual.slice(0, 10), relogio(new Date(agora.getTime() - 86400000), p.fuso).slice(0, 10)]);
  return [...dias].some(dia => p.horarios.some(h => `${dia}T${h}` <= atual && `${dia}T${h}` > anterior));
}

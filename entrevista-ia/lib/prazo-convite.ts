/** Regras compartilhadas pelo convite e pela tela, sem dependências do servidor. */
export const PRAZO_PADRAO = 7;
export const PRAZOS_VALIDOS = [7, 15, 30];
const DIA_MS = 86_400_000;

export type PeriodoConvite = { iniciaEm: string; expiraEm: string };

export function prazoValido(bruto: unknown): number {
  const dias = Number(bruto);
  return PRAZOS_VALIDOS.includes(dias) ? dias : PRAZO_PADRAO;
}

export function periodoPadrao(agora = new Date(), dias = PRAZO_PADRAO): PeriodoConvite {
  return { iniciaEm: agora.toISOString(), expiraEm: new Date(agora.getTime() + dias * DIA_MS).toISOString() };
}

function dataValida(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const partes = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(valor);
  if (!partes || !Number.isFinite(Date.parse(valor))) return false;
  const [, ano, mes, dia] = partes;
  return Number(dia) <= new Date(Date.UTC(Number(ano), Number(mes), 0)).getUTCDate();
}

export function validarPeriodo({ iniciaEm, expiraEm, expiraEmDias }: { iniciaEm?: unknown; expiraEm?: unknown; expiraEmDias?: unknown }, agora = new Date()): PeriodoConvite {
  if (iniciaEm === undefined && expiraEm === undefined) return periodoPadrao(agora, prazoValido(expiraEmDias));
  if (!dataValida(iniciaEm) || !dataValida(expiraEm)) throw new Error("Informe datas e horários válidos para o início e o fim da entrevista.");
  if (Date.parse(expiraEm) <= Date.parse(iniciaEm)) throw new Error("O fim da entrevista deve ser posterior ao início.");
  if (Date.parse(expiraEm) <= agora.getTime()) throw new Error("O fim da entrevista deve ser no futuro.");
  return { iniciaEm: new Date(iniciaEm).toISOString(), expiraEm: new Date(expiraEm).toISOString() };
}

/** datetime-local usa o fuso do navegador; o servidor sempre recebe ISO com fuso. */
export function dataParaCampo(iso: string): string {
  const data = new Date(iso);
  return new Date(data.getTime() - data.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function dataDoPrazo(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

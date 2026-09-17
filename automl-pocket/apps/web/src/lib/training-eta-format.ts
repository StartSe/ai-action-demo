/**
 * Helpers puros de duração da tela de progresso do treino (US-027): tabela
 * fixa de fallback, fatores de faixa e formatação pt-BR. Este módulo é
 * client-safe (sem banco) — a estimativa real, que consulta audit_logs, fica
 * em `training-eta.ts` (server-only) e re-exporta tudo daqui.
 */

/** Duração típica de um treino por problemType, em segundos. */
export const FALLBACK_DURATION_SECONDS: Record<string, number> = {
  classification: 120,
  regression: 120,
  forecasting: 240,
};

/**
 * Faixa exibida ao usuário em torno de uma estimativa pontual: a estimativa
 * é uma ordem de grandeza, então a UI mostra "entre 0,7x e 1,5x".
 */
export const ETA_RANGE_FACTORS = { min: 0.7, max: 1.5 } as const;

export type DurationRange = { minSeconds: number; maxSeconds: number };

/** Faixa em segundos ao redor de uma estimativa pontual. */
export function durationRange(estimateSeconds: number): DurationRange {
  return {
    minSeconds: estimateSeconds * ETA_RANGE_FACTORS.min,
    maxSeconds: estimateSeconds * ETA_RANGE_FACTORS.max,
  };
}

/**
 * Faixa fixa por problemType; null para tipo desconhecido (a UI omite a linha
 * em vez de prometer um número inventado).
 */
export function fallbackDurationRange(
  problemType: string,
): DurationRange | null {
  const estimate = FALLBACK_DURATION_SECONDS[problemType];
  return estimate === undefined ? null : durationRange(estimate);
}

/** "5 min", "1 h", "1 h 10 min" — minutos inteiros já arredondados. */
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Faixa de duração em pt-BR, com granularidade de minuto:
 * - máximo abaixo de 1 min → "menos de 1 min"
 * - extremos que arredondam para o mesmo minuto → "cerca de 1 h 10 min"
 * - caso geral → "entre 2 e 4 min" (a unidade só aparece uma vez quando
 *   ambos ficam abaixo de 1 h; com horas cada extremo leva a própria unidade:
 *   "entre 50 min e 1 h 15 min")
 */
export function formatDurationRange(minSec: number, maxSec: number): string {
  const lo = Math.max(0, Math.min(minSec, maxSec));
  const hi = Math.max(0, Math.max(minSec, maxSec));
  if (hi < 60) return "menos de 1 min";

  const minMinutes = Math.max(1, Math.round(lo / 60));
  const maxMinutes = Math.max(1, Math.round(hi / 60));
  if (minMinutes === maxMinutes) return `cerca de ${formatMinutes(maxMinutes)}`;
  if (maxMinutes < 60) return `entre ${minMinutes} e ${maxMinutes} min`;
  return `entre ${formatMinutes(minMinutes)} e ${formatMinutes(maxMinutes)}`;
}

/**
 * Tempo que falta para um treino em execução (US-015): estimativa própria
 * menos o que já decorreu, nunca negativo — o worker pode passar da
 * estimativa e a UI então mostra "menos de 1 min" em vez de um número
 * negativo.
 */
export function remainingSeconds(
  estimateSeconds: number,
  elapsedSeconds: number,
): number {
  return Math.max(0, estimateSeconds - Math.max(0, elapsedSeconds));
}

/**
 * Duração pontual aproximada, em pt-BR, com granularidade de minuto:
 * "menos de 1 min", "cerca de 3 min", "cerca de 1 h 10 min". Usada na linha
 * "Restam …" da tela de progresso.
 */
export function formatApproxDuration(seconds: number): string {
  const total = Math.max(0, seconds);
  if (total < 60) return "menos de 1 min";
  return `cerca de ${formatMinutes(Math.max(1, Math.round(total / 60)))}`;
}

/**
 * Tempo decorrido compacto para a linha "Treinando há …": "45s", "2min 05s",
 * "1h 03min 09s". Valores negativos (relógio do cliente atrasado em relação ao
 * servidor) viram zero.
 */
export function formatElapsed(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}h ${pad(minutes)}min ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}min ${pad(seconds)}s`;
  return `${seconds}s`;
}

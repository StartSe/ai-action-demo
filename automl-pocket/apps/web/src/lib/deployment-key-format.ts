/**
 * Formatação client-safe do estado da chave de um deployment (US-039):
 * tempo restante da chave anterior em graça e "último uso". Funções puras
 * com `now` injetado — a UI passa um relógio que só existe após o mount
 * (evita hydration mismatch) e os testes passam um instante fixo.
 */

/** Data ISO → ms; null para ausente/inválida. */
function parseIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Tempo restante até `expiresAtIso` no formato HH:MM ("23:41"); null quando
 * já expirou ou não há chave anterior — a UI omite a linha.
 */
export function formatRemainingHHMM(
  expiresAtIso: string | null | undefined,
  now: number,
): string | null {
  const expiresAt = parseIso(expiresAtIso);
  if (expiresAt === null) return null;
  const remainingMs = expiresAt - now;
  if (remainingMs <= 0) return null;
  // Arredonda para cima: faltando 30 s ainda mostra 00:01, nunca 00:00
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** "há menos de 1 min" | "há 5 min" | "há 3 h" | "há 2 dias" */
export function formatRelativeAgo(thenMs: number, now: number): string {
  const elapsedMs = Math.max(0, now - thenMs);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "há menos de 1 min";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/**
 * Linha "Último uso": "Nunca usada" sem registro; "Último uso: há X min, de
 * <ip>" com IP; sem IP (proxy sem x-forwarded-for) omite a parte "de <ip>".
 */
export function formatLastUsed(
  lastUsedAtIso: string | null | undefined,
  lastUsedIp: string | null | undefined,
  now: number,
): string {
  const lastUsedAt = parseIso(lastUsedAtIso);
  if (lastUsedAt === null) return "Nunca usada";
  const ago = formatRelativeAgo(lastUsedAt, now);
  const ip = lastUsedIp?.trim();
  return ip ? `Último uso: ${ago}, de ${ip}` : `Último uso: ${ago}`;
}

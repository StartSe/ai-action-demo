const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> =
  [
    { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
    { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
    { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
    { unit: "day", ms: 24 * 60 * 60 * 1000 },
    { unit: "hour", ms: 60 * 60 * 1000 },
    { unit: "minute", ms: 60 * 1000 },
  ];

/** Formata um número com separador de milhar pt-BR (ex.: 12345 → "12.345"). */
export function numberPtBr(value: number): string {
  return value.toLocaleString("pt-BR");
}

/** Formata uma data como tempo relativo em pt-BR (ex.: "há 2 dias"). */
export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diff = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return "agora mesmo";
}

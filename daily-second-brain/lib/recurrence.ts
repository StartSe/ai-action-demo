import { BrainError } from "./api";
import type { Recurrence } from "./capture-types";

export function recurrence(value: unknown): Recurrence {
  if (!value || typeof value !== "object")
    throw new BrainError("Escolha quando repetir a coleta.");
  const r = value as Recurrence;
  if (
    !["daily", "weekdays", "weekly"].includes(r.frequency) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ||
    !Number.isInteger(r.weekday) ||
    r.weekday < 0 ||
    r.weekday > 6 ||
    typeof r.timezone !== "string"
  )
    throw new BrainError(
      "Confira a frequência, o dia e o horário do agendamento.",
    );
  try {
    new Intl.DateTimeFormat("en", { timeZone: r.timezone }).format();
  } catch {
    throw new BrainError("Escolha um fuso horário válido.");
  }
  return {
    frequency: r.frequency,
    time: r.time,
    timezone: r.timezone,
    weekday: r.weekday,
  };
}
export function nextOccurrence(input: Recurrence, after = new Date()): string {
  const r = recurrence(input);
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: r.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = (d: Date) =>
    Object.fromEntries(format.formatToParts(d).map((p) => [p.type, p.value]));
  const start = parts(after);
  const startDay = `${start.year}-${start.month}-${start.day}`;
  const startTime = `${start.hour}:${start.minute}`;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Scan UTC instants, not the server's local clock. Missing DST times are
  // skipped; a repeated local time runs only once on that calendar day.
  for (
    let time = Math.floor(after.getTime() / 60000) * 60000 + 60000,
      end = time + 9 * 86400000;
    time < end;
    time += 60000
  ) {
    const p = parts(new Date(time));
    if (`${p.hour}:${p.minute}` !== r.time) continue;
    if (`${p.year}-${p.month}-${p.day}` === startDay && r.time <= startTime)
      continue;
    const weekday = days.indexOf(p.weekday);
    if (r.frequency === "weekdays" && (weekday === 0 || weekday === 6))
      continue;
    if (r.frequency === "weekly" && weekday !== r.weekday) continue;
    return new Date(time).toISOString();
  }
  throw new BrainError("Não foi possível calcular o próximo horário.");
}

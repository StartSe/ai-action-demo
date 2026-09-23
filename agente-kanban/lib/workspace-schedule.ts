import type { Routine } from "./workspace-types";

export function localClock(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

/** One execution per local date, including after restart. Never backfills slots before creation. */
export function dueSlot(routine: Routine, now = new Date()): string | null {
  if (!routine.enabled) return null;
  const local = localClock(now, routine.timezone);
  const created = localClock(new Date(routine.createdAt), routine.timezone);
  const weekday = new Date(`${local.date}T12:00:00Z`).getUTCDay();
  if (
    local.time < routine.time ||
    `${local.date}T${routine.time}` < `${created.date}T${created.time}`
  )
    return null;
  if (routine.frequency === "weekly" && weekday !== routine.weekday)
    return null;
  if (routine.frequency === "weekdays" && (weekday === 0 || weekday === 6))
    return null;
  return `${local.date}T${routine.time}@${routine.timezone}`;
}

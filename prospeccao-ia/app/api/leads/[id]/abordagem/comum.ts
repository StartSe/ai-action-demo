import type { EstrategiaAbordagem } from "@/lib/types";

export const CAMPOS_ESTRATEGIA: (keyof EstrategiaAbordagem)[] = ["objetivo", "gancho", "dorProvavel", "tom", "cta"];

export function estrategiaValida(v: unknown): v is EstrategiaAbordagem {
  if (!v || typeof v !== "object") return false;
  return CAMPOS_ESTRATEGIA.every((campo) => typeof (v as Record<string, unknown>)[campo] === "string" && (v as Record<string, unknown>)[campo] !== "");
}

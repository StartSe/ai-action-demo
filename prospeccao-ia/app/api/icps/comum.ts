// Leitura de corpo compartilhada por POST /api/icps e PUT /api/icps/[id] (US-006): as duas rotas
// validam e montam o mesmo formato de critérios e listas (personas, dores, sinais).
import type { CriteriosICP, Jornada } from "@/lib/types";

export const JORNADAS: Jornada[] = ["b2b", "b2c"];

function texto(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function listaTexto(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const itens = v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  return itens.length > 0 ? itens : undefined;
}

export function lerCriterios(corpo: unknown): CriteriosICP {
  const c = corpo && typeof corpo === "object" ? (corpo as Record<string, unknown>) : {};
  return {
    setor: texto(c.setor),
    porte: texto(c.porte),
    localizacao: texto(c.localizacao),
    outros: texto(c.outros),
    faixaEtaria: texto(c.faixaEtaria),
    ocupacao: texto(c.ocupacao),
    interesses: listaTexto(c.interesses),
    contexto: texto(c.contexto),
  };
}

/** Lista de chips (personas, dores, sinais): remove vazios e duplicados, preservando a ordem de inserção. */
export function lerLista(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<string>();
  const itens: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    itens.push(t);
  }
  return itens;
}

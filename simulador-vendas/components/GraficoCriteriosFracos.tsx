import { numero } from "@/lib/formato";
import type { CriterioFraco } from "@/lib/types";

/** Barras horizontais dos critérios mais fracos da equipe, no mesmo padrão CSS de GraficoCategorias (financas-ia): HTML puro (não SVG), critério pior (primeiro da lista, já vem ordenada) em warn. */
export function GraficoCriteriosFracos({ criterios }: { criterios: CriterioFraco[] }) {
  if (!criterios.length) return <p className="text-muted text-sm">Sem conversas analisadas suficientes no período para este gráfico.</p>;

  return (
    <div className="flex flex-col gap-3">
      {criterios.map((c, i) => (
        <div key={c.nome} className="flex items-center gap-2.5 flex-wrap">
          <span className="w-[168px] shrink-0 text-[13px] text-muted text-right truncate" title={c.nome}>
            {c.nome}
          </span>
          <div className="flex-1 min-w-0">
            <div
              className={`h-7 rounded-[4px] ${i === 0 ? "bg-warn" : "bg-accent"}`}
              style={{ width: `${Math.max((c.notaMedia / 10) * 100, 2)}%` }}
              title={`${c.nome}: ${numero(c.notaMedia, 1)}`}
            />
          </div>
          <span className="w-10 shrink-0 text-[13px] font-bold text-ink">{numero(c.notaMedia, 1)}</span>
        </div>
      ))}
    </div>
  );
}

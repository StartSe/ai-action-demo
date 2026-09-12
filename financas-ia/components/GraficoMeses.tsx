import type { MesResumo } from "@/lib/types";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function GraficoMeses({ meses }: { meses: MesResumo[] }) {
  if (!meses.length) return <p className="text-muted text-sm">Sem meses suficientes para o gráfico.</p>;

  const max = Math.max(...meses.map((m) => m.total), 1);
  const barW = 52;
  const gap = 26;
  const chartH = 170;
  const padTop = 30;
  const padBottom = 30;
  const w = meses.length * (barW + gap) + gap;
  const h = chartH + padTop + padBottom;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-auto min-w-[320px]" role="img" aria-label="Total de despesas por mês">
      {meses.map((m, i) => {
        const x = gap + i * (barW + gap);
        const bh = Math.max((m.total / max) * chartH, 3);
        const y = padTop + (chartH - bh);
        return (
          <g key={m.mes}>
            <rect x={x} y={y} width={barW} height={bh} rx={4} className="fill-accent">
              <title>{`${m.rotulo}: ${moeda.format(m.total)}`}</title>
            </rect>
            <text x={x + barW / 2} y={y - 8} textAnchor="middle" className="fill-ink text-[11.5px] font-bold">
              {moedaCompacta.format(m.total)}
            </text>
            <text x={x + barW / 2} y={padTop + chartH + 20} textAnchor="middle" className="fill-muted text-[11.5px]">
              {m.rotulo}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

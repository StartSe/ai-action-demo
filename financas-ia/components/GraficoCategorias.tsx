import type { CategoriaResumo } from "@/lib/types";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function GraficoCategorias({ categorias }: { categorias: CategoriaResumo[] }) {
  if (!categorias.length) return <p className="text-muted text-sm">Sem categorias suficientes para o gráfico.</p>;

  const max = Math.max(...categorias.map((c) => c.total), 1);
  const rowH = 28;
  const rowGap = 12;
  const labelW = 128;
  const chartW = 380;
  const valueW = 96;
  const w = labelW + chartW + valueW;
  const h = categorias.length * (rowH + rowGap) + rowGap;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-auto min-w-[380px]" role="img" aria-label="Total de despesas por categoria">
      {categorias.map((c, i) => {
        const y = rowGap + i * (rowH + rowGap);
        const bw = Math.max((c.total / max) * chartW, 3);
        return (
          <g key={c.categoria}>
            <text x={labelW - 10} y={y + rowH / 2 + 4} textAnchor="end" className="fill-muted text-[11.5px]">
              {c.categoria}
            </text>
            <rect x={labelW} y={y} width={bw} height={rowH} rx={4} className="fill-accent">
              <title>{`${c.categoria}: ${moeda.format(c.total)}`}</title>
            </rect>
            <text x={labelW + bw + 10} y={y + rowH / 2 + 4} className="fill-ink text-[11.5px] font-bold">
              {moedaCompacta.format(c.total)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

import type { CategoriaCrescimento, CategoriaResumo } from "@/lib/types";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

function percentual(v: number) {
  const sinal = v > 0 ? "+" : "";
  return `${sinal}${(v || 0).toFixed(1).replace(".", ",")}%`;
}

export function GraficoCategorias({
  categorias,
  maiorCrescimento,
}: {
  categorias: CategoriaResumo[];
  maiorCrescimento?: CategoriaCrescimento;
}) {
  if (!categorias.length) return <p className="text-muted text-sm">Sem categorias suficientes para o gráfico.</p>;

  const max = Math.max(...categorias.map((c) => c.total), 1);

  return (
    <div>
      <div className="flex flex-col gap-3">
        {categorias.map((c) => {
          const destaque = c.categoria === maiorCrescimento?.categoria;
          const largura = Math.max((c.total / max) * 100, 2);
          return (
            <div key={c.categoria} className="flex items-center gap-2.5">
              <span className="w-[104px] shrink-0 text-[13px] text-muted text-right truncate" title={c.categoria}>
                {c.categoria}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className={`h-7 rounded-[4px] ${destaque ? "bg-warn" : "bg-accent"}`}
                  style={{ width: `${largura}%` }}
                  title={`${c.categoria}: ${moeda.format(c.total)}`}
                />
              </div>
              <span className="w-20 shrink-0 text-[13px] font-bold text-ink">{moedaCompacta.format(c.total)}</span>
            </div>
          );
        })}
      </div>
      {maiorCrescimento && (
        <div className="flex items-center gap-2 mt-3.5 text-[13px] text-muted">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-warn shrink-0" />
          Maior crescimento: {maiorCrescimento.categoria} ({percentual(maiorCrescimento.variacao)})
        </div>
      )}
    </div>
  );
}

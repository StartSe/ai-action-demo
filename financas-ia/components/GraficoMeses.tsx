import type { MesResumo } from "@/lib/types";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const CORES_TOM: Record<string, string> = { ok: "text-ok", warn: "text-warn", danger: "text-danger", neutro: "text-muted" };

function percentual(v: number) {
  const sinal = v > 0 ? "+" : "";
  return `${sinal}${(v || 0).toFixed(1).replace(".", ",")}%`;
}

// Altura fixa em px (nunca dentro de um viewBox escalado): o eixo Y e os rótulos
// ficam legíveis em qualquer largura de tela, do celular ao desktop.
const CHART_H = 170;

export function GraficoMeses({
  meses,
  variacao,
  tom = "neutro",
}: {
  meses: MesResumo[];
  variacao?: number;
  tom?: "ok" | "warn" | "danger" | "neutro";
}) {
  if (!meses.length) return <p className="text-muted text-sm">Sem meses suficientes para o gráfico.</p>;

  const max = Math.max(...meses.map((m) => m.total), 1);
  // `minmax(0, 1fr)` (em vez de só `1fr`) impede que o conteúdo de uma coluna (ex.: o rótulo
  // de variação do último mês) force a grade inteira a ficar mais larga que o cartão.
  const colunas = `44px repeat(${meses.length}, minmax(0, 1fr))`;

  return (
    <div>
      <div className="grid gap-2.5 border-b-2 border-ink/50" style={{ gridTemplateColumns: colunas, height: CHART_H }}>
        <div className="flex flex-col justify-between text-right">
          <span className="text-[11px] leading-none text-muted">{moedaCompacta.format(max)}</span>
          <span className="text-[11px] leading-none text-muted">{moedaCompacta.format(max / 2)}</span>
          <span className="text-[11px] leading-none text-muted">{moedaCompacta.format(0)}</span>
        </div>
        {meses.map((m, i) => {
          const ultimo = i === meses.length - 1;
          const altura = Math.max((m.total / max) * 100, 2);
          return (
            <div key={m.mes} className="min-w-0 flex flex-col items-center justify-end">
              {ultimo && (
                <>
                  {variacao !== undefined && (
                    <span className={`text-[11px] font-bold leading-none text-center mb-1 ${CORES_TOM[tom]}`}>{percentual(variacao)}</span>
                  )}
                  <span className="text-[11px] font-bold leading-none text-center text-ink mb-1">{moedaCompacta.format(m.total)}</span>
                </>
              )}
              <div
                className={`w-full rounded-t-[4px] ${ultimo ? "bg-accent" : "bg-[#ccd0d8]"}`}
                style={{ height: `${altura}%` }}
                title={`${m.rotulo}: ${moeda.format(m.total)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="grid gap-2.5 mt-2" style={{ gridTemplateColumns: colunas }}>
        <div />
        {meses.map((m) => (
          <span key={m.mes} className="min-w-0 text-center text-[11px] text-muted truncate">
            {m.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

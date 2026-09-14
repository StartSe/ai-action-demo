// Gráfico de barras pareadas (gasto x planejado) por mês, em HTML+CSS puro — mesmo padrão já usado
// em financas-ia (GraficoMeses/GraficoCategorias): nunca SVG com viewBox escalado (o texto escalaria
// junto com a largura), nunca Flexbox flex-1 para colunas com texto (a fileira de rótulos "estoura"
// a largura do cartão quando várias colunas têm texto). CSS Grid com minmax(0, 1fr) por coluna do mês
// resolve os dois problemas; dentro de cada coluna, as duas barras (gasto/planejado) usam flex-1 no
// próprio contêiner da coluna (sem texto, só cor) para ganhar uma altura definida onde a % de altura
// de cada barra possa resolver.
import type { GastoPorMes } from "@/lib/types";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

// Altura fixa em px (nunca dentro de um viewBox escalado): o eixo Y e os rótulos ficam legíveis em
// qualquer largura de tela, do celular ao desktop.
const CHART_H = 180;

export function GraficoGastoPlanejado({ meses }: { meses: GastoPorMes[] }) {
  if (!meses.length) return <p className="text-muted text-sm">Sem meses suficientes para o gráfico.</p>;

  const max = Math.max(...meses.map((m) => Math.max(m.gastoBRL, m.planejadoBRL)), 1);
  // `minmax(0, 1fr)` (em vez de só `1fr`) impede que o conteúdo de uma coluna force a grade inteira
  // a ficar mais larga que o cartão.
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
          const estourou = m.planejadoBRL > 0 && m.gastoBRL > m.planejadoBRL;
          const alturaGasto = m.gastoBRL > 0 ? Math.max((m.gastoBRL / max) * 100, 2) : 0;
          const alturaPlanejado = m.planejadoBRL > 0 ? Math.max((m.planejadoBRL / max) * 100, 2) : 0;
          return (
            <div key={m.mes} className="min-w-0 flex flex-col items-stretch justify-end">
              {ultimo && (
                <span className={`text-[11px] font-bold leading-none text-center mb-1 ${estourou ? "text-danger" : "text-ink"}`}>
                  {moedaCompacta.format(m.gastoBRL)}
                </span>
              )}
              <div className="flex-1 w-full flex items-end justify-center gap-[3px]">
                <div
                  className={`w-1/2 rounded-t-[4px] ${estourou ? "bg-danger" : "bg-accent"}`}
                  style={{ height: `${alturaGasto}%` }}
                  title={`Gasto em ${m.rotulo}: ${moeda.format(m.gastoBRL)}`}
                />
                <div
                  className="w-1/2 rounded-t-[4px] bg-[#ccd0d8]"
                  style={{ height: `${alturaPlanejado}%` }}
                  title={`Planejado para ${m.rotulo}: ${moeda.format(m.planejadoBRL)}`}
                />
              </div>
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
      <div className="flex items-center gap-4 mt-3.5 text-[13px] text-muted">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-accent shrink-0" />
          Gasto
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-[#ccd0d8] shrink-0" />
          Planejado
        </div>
      </div>
    </div>
  );
}

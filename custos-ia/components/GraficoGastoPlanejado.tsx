// Gráfico de barras pareadas (gasto x planejado) por mês, em HTML+CSS puro — mesmo padrão já usado
// em financas-ia (GraficoMeses/GraficoCategorias): nunca SVG com viewBox escalado (o texto escalaria
// junto com a largura), nunca Flexbox flex-1 para colunas com texto (a fileira de rótulos "estoura"
// a largura do cartão quando várias colunas têm texto). CSS Grid com minmax(0, 1fr) por coluna do mês
// resolve os dois problemas; dentro de cada coluna, as duas barras (gasto/planejado) usam flex-1 no
// próprio contêiner da coluna (sem texto, só cor) para ganhar uma altura definida onde a % de altura
// de cada barra possa resolver. As barras têm largura máxima: com um mês só (o padrão "Mês atual"),
// `w-1/2` sozinho daria duas barras da largura do cartão inteiro.
import type { GastoPorMes } from "@/lib/types";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

/** "R$ 11,9 mil" sai do Intl com espaços NÃO separáveis (U+00A0/U+202F): dentro de uma coluna de 45 px
 * (seis meses num celular) o rótulo não quebra e empurra a grade inteira para fora do cartão. Trocar
 * por espaço comum deixa o texto quebrar em duas linhas e o gráfico caber. */
function compacto(valor: number): string {
  return moedaCompacta.format(valor).replace(/[\u00a0\u202f]/g, " ");
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-04" -> "abr/26". `rotulo` ("abril de 2026") não cabe numa coluna de 45 px (seis meses num
 * celular) e sairia cortado no meio da palavra pelo `truncate`; o nome completo fica no `title`. */
function rotuloCurto(mes: string): string {
  const [ano, m] = mes.split("-");
  const nome = MESES_CURTOS[Number(m) - 1];
  return nome ? `${nome}/${ano.slice(2)}` : mes;
}

// Altura fixa em px (nunca dentro de um viewBox escalado): o eixo Y e os rótulos ficam legíveis em
// qualquer largura de tela, do celular ao desktop.
const CHART_H = 180;

export function GraficoGastoPlanejado({ meses }: { meses: GastoPorMes[] }) {
  if (!meses.length) return <p className="text-muted text-sm">Sem meses suficientes para o gráfico.</p>;

  const max = Math.max(...meses.map((m) => Math.max(m.gastoBRL, m.planejadoBRL)), 1);
  // `minmax(0, 1fr)` (em vez de só `1fr`) impede que o conteúdo de uma coluna force a grade inteira
  // a ficar mais larga que o cartão. A coluna do eixo Y é `max-content`, não uma largura fixa: com
  // seis meses num celular de 390 px, um rótulo como "R$ 27,4 mil" estoura qualquer valor fixo e
  // empurra a grade inteira para fora do cartão (medido: 370 px de conteúdo em 358 disponíveis).
  const colunas = `max-content repeat(${meses.length}, minmax(0, 1fr))`;

  return (
    <div>
      <div className="grid gap-1.5 md:gap-2.5 border-b-2 border-ink/50" style={{ gridTemplateColumns: colunas, height: CHART_H }}>
        <div className="flex flex-col justify-between text-right">
          <span className="text-[11px] leading-none text-muted">{compacto(max)}</span>
          <span className="text-[11px] leading-none text-muted">{compacto(max / 2)}</span>
          <span className="text-[11px] leading-none text-muted">{compacto(0)}</span>
        </div>
        {meses.map((m, i) => {
          const ultimo = i === meses.length - 1;
          const estourou = m.planejadoBRL > 0 && m.gastoBRL > m.planejadoBRL;
          const alturaGasto = m.gastoBRL > 0 ? Math.max((m.gastoBRL / max) * 100, 2) : 0;
          const alturaPlanejado = m.planejadoBRL > 0 ? Math.max((m.planejadoBRL / max) * 100, 2) : 0;
          return (
            <div key={m.mes} className="min-w-0 flex flex-col items-stretch justify-end">
              {ultimo && (
                <span className={`text-[11px] font-bold leading-tight text-center mb-1 ${estourou ? "text-danger" : "text-ink"}`}>
                  {compacto(m.gastoBRL)}
                </span>
              )}
              <div className="flex-1 w-full flex items-end justify-center gap-[3px]">
                <div
                  className={`w-1/2 max-w-14 rounded-t-[4px] ${estourou ? "bg-danger" : "bg-accent"}`}
                  style={{ height: `${alturaGasto}%` }}
                  title={`Gasto em ${m.rotulo}: ${moeda.format(m.gastoBRL)}`}
                />
                <div
                  className="w-1/2 max-w-14 rounded-t-[4px] bg-[#ccd0d8]"
                  style={{ height: `${alturaPlanejado}%` }}
                  title={`Planejado para ${m.rotulo}: ${moeda.format(m.planejadoBRL)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-1.5 md:gap-2.5 mt-2" style={{ gridTemplateColumns: colunas }}>
        <div />
        {meses.map((m) => (
          <span key={m.mes} className="min-w-0 text-center text-[11px] text-muted truncate" title={m.rotulo}>
            {rotuloCurto(m.mes)}
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

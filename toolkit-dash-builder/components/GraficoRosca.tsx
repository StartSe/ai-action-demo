// Pizza e rosca: um <circle> por fatia com stroke-dasharray/stroke-dashoffset (sem cálculo de arco), até
// 6 fatias, diferenciadas por degraus de opacidade do acento (100/88/76/64/52/40 %); legenda com valor e percentual.
import { formatar } from "@/lib/formatar";
import type { DadosDistribuicao } from "@/lib/types";

const OPACIDADES = [1, 0.88, 0.76, 0.64, 0.52, 0.4];
// pathLength="100" normaliza a circunferência: o dasharray fala em percentual seja qual for o raio.
// Na pizza o traço vai do centro à borda (r = 10,5 e traço 21 cabem no viewBox de 42); na rosca é um anel.
const GEOMETRIA = { pizza: { raio: 10.5, traco: 21 }, rosca: { raio: 17, traco: 7 } };

export function GraficoRosca({ dados, titulo, rosca }: { dados: DadosDistribuicao; titulo: string; rosca: boolean }) {
  const fatias = [...dados.fatias].filter((f) => f.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 6);
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (fatias.length === 0 || total <= 0) return <p className="text-muted text-sm">Sem fatias suficientes para o gráfico.</p>;
  const { raio, traco } = rosca ? GEOMETRIA.rosca : GEOMETRIA.pizza;
  // Cada fatia começa onde a anterior terminou: o offset é 25 (topo do círculo) menos o acumulado até ela.
  const arcos = fatias.reduce<{ pct: number; offset: number; opacidade: number }[]>((lista, f, i) => {
    const acumulado = lista.reduce((s, a) => s + a.pct, 0);
    lista.push({ pct: (f.valor / total) * 100, offset: 25 - acumulado, opacidade: OPACIDADES[i] ?? 0.4 });
    return lista;
  }, []);
  return (
    <div className="flex items-center gap-5 max-md:gap-4 flex-wrap">
      <div className="relative w-[136px] h-[136px] shrink-0">
        <svg viewBox="0 0 42 42" width="136" height="136" aria-hidden="true">
          {arcos.map((a, i) => (
            <circle key={i} cx="21" cy="21" r={raio} pathLength={100} fill="transparent" stroke="var(--color-accent)" strokeOpacity={a.opacidade} strokeWidth={traco} strokeDasharray={`${a.pct} ${100 - a.pct}`} strokeDashoffset={a.offset} />
          ))}
        </svg>
        {rosca && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <span className="text-[11px] text-muted leading-none">Total</span>
            <span className="text-[14px] font-extrabold text-ink leading-tight mt-1 break-words" title={formatar(total, dados.formato)}>{formatar(total, dados.formato, true)}</span>
          </div>
        )}
      </div>
      <ul className="flex-1 min-w-[200px] flex flex-col gap-1.5 text-[12.5px]">
        {fatias.map((f, i) => (
          <li key={`${f.rotulo}-${i}`} className="flex items-center gap-2 min-w-0">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0"><rect width="10" height="10" rx="2" fill="var(--color-accent)" fillOpacity={arcos[i].opacidade} /></svg>
            <span className="truncate text-ink" title={f.rotulo}>{f.rotulo}</span>
            <span className="ml-auto shrink-0 font-bold text-ink" title={formatar(f.valor, dados.formato)}>{formatar(f.valor, dados.formato, true)}</span>
            <span className="shrink-0 text-muted w-[38px] text-right">{Math.round(arcos[i].pct)}%</span>
          </li>
        ))}
      </ul>
      <p className="sr-only">{`${titulo}: ${fatias.map((f, i) => `${f.rotulo} ${formatar(f.valor, dados.formato)} (${Math.round(arcos[i].pct)}%)`).join(", ")}.`}</p>
    </div>
  );
}

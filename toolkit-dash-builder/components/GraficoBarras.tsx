// Barras verticais e horizontais: cada barra é um <rect> em SVG (imprime), rótulos e valores em HTML
// (molde: financas-ia/GraficoCategorias). A maior barra fica a 100 % e as demais a 70 % de opacidade.
import { formatar, rotuloCurto } from "@/lib/formatar";
import type { DadosSerie } from "@/lib/types";

const ALTURA = 150;
const ALTURA_LINHA = 22;

export function GraficoBarras({ dados, titulo }: { dados: DadosSerie; titulo: string }) {
  const pontos = dados.pontos;
  if (pontos.length === 0) return <p className="text-muted text-sm">Sem valores suficientes para o gráfico.</p>;
  const max = Math.max(...pontos.map((p) => p.valor), 1);
  const leitura = `${titulo}, ${dados.eixoY} por ${dados.eixoX}: ${pontos.map((p) => `${p.rotulo} ${formatar(p.valor, dados.formato)}`).join(", ")}.`;

  if (dados.orientacao === "horizontal") {
    return (
      <div>
        <p className="text-[12.5px] text-muted mb-3">{dados.eixoY} por {dados.eixoX.toLowerCase()}</p>
        <div className="flex flex-col gap-2.5">
          {pontos.map((p, i) => {
            const largura = Math.max((Math.max(p.valor, 0) / max) * 100, 1.5);
            return (
              <div key={`${p.rotulo}-${i}`} className="flex items-center gap-2.5">
                <span className="w-[104px] max-md:w-[84px] shrink-0 text-[12.5px] text-muted text-right truncate" title={p.rotulo}>
                  <span className="max-md:hidden">{p.rotulo}</span>
                  <span className="md:hidden">{rotuloCurto(p.rotulo)}</span>
                </span>
                <svg className="painel-svg flex-1 min-w-0" height={ALTURA_LINHA} viewBox={`0 0 100 ${ALTURA_LINHA}`} preserveAspectRatio="none" aria-hidden="true">
                  <rect x="0" y="0" width={largura} height={ALTURA_LINHA} fill="var(--color-accent)" fillOpacity={p.valor === max ? 1 : 0.7} />
                </svg>
                <span className="min-w-[64px] shrink-0 text-[12.5px] font-bold text-ink text-right" title={formatar(p.valor, dados.formato)}>{formatar(p.valor, dados.formato, true)}</span>
              </div>
            );
          })}
        </div>
        <p className="sr-only">{leitura}</p>
      </div>
    );
  }

  const colunas = `max-content repeat(${pontos.length}, minmax(0, 1fr))`;
  return (
    <div>
      <p className="text-[12.5px] text-muted mb-2">{dados.eixoY} por {dados.eixoX.toLowerCase()}</p>
      <div className="grid gap-2 border-b border-ink/50" style={{ gridTemplateColumns: colunas, height: ALTURA }}>
        <div className="flex flex-col justify-between text-right">
          <span className="text-[11px] leading-none text-muted">{formatar(max, dados.formato, true)}</span>
          <span className="text-[11px] leading-none text-muted">{formatar(max / 2, dados.formato, true)}</span>
          <span className="text-[11px] leading-none text-muted">{formatar(0, dados.formato, true)}</span>
        </div>
        {pontos.map((p, i) => {
          const altura = Math.max((Math.max(p.valor, 0) / max) * ALTURA, 2);
          return (
            <div key={`${p.rotulo}-${i}`} className="min-w-0 flex flex-col justify-end" title={`${p.rotulo}: ${formatar(p.valor, dados.formato)}`}>
              <svg className="painel-svg" height={ALTURA} viewBox={`0 0 100 ${ALTURA}`} preserveAspectRatio="none" aria-hidden="true">
                <rect x="12" y={ALTURA - altura} width="76" height={altura} fill="var(--color-accent)" fillOpacity={p.valor === max ? 1 : 0.7} />
              </svg>
            </div>
          );
        })}
      </div>
      <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: colunas }}>
        <div className="invisible text-[11px] leading-none" aria-hidden="true">{formatar(max, dados.formato, true)}</div>
        {pontos.map((p, i) => (
          <span key={`${p.rotulo}-${i}`} className="min-w-0 text-center text-[11px] text-muted truncate" title={`${p.rotulo}: ${formatar(p.valor, dados.formato)}`}>
            <span className="max-md:hidden">{p.rotulo}</span>
            <span className="md:hidden">{rotuloCurto(p.rotulo)}</span>
          </span>
        ))}
      </div>
      <p className="sr-only">{leitura}</p>
    </div>
  );
}

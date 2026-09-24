// Linha e área: o SVG só carrega geometria (polyline, path, grade) esticada com preserveAspectRatio="none";
// eixo Y, rótulos do eixo X e o último valor ficam em HTML, numa grade alinhada ao SVG (molde: financas-ia/GraficoMeses).
import { formatar, rotuloCurto } from "@/lib/formatar";
import type { DadosSerie } from "@/lib/types";

const ALTURA = 150;

export function GraficoSerie({ dados, titulo, area }: { dados: DadosSerie; titulo: string; area: boolean }) {
  const pontos = dados.pontos;
  if (pontos.length === 0) return <p className="text-muted text-sm">Sem pontos suficientes para o gráfico.</p>;
  const max = Math.max(...pontos.map((p) => p.valor), 1);
  const n = pontos.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => ALTURA - (Math.max(v, 0) / max) * ALTURA;
  const coordenadas = pontos.map((p, i) => `${x(i).toFixed(2)},${y(p.valor).toFixed(2)}`);

  /**
   * Com muitos pontos (uma série diária de um mês) os rótulos não cabem e o eixo vira "2… 2… 3…".
   * Mostra no máximo oito, sempre incluindo o primeiro e o último; os demais viram espaço em
   * branco, o que mantém o alinhamento com a linha. O valor de cada ponto segue no `title` e na
   * leitura para leitor de tela.
   */
  const passo = Math.max(1, Math.ceil(n / 8));
  const visivel = (i: number) => {
    if (i === 0 || i === n - 1) return true;
    if (n - 1 - i < passo / 2) return false; // colaria no rótulo final
    return i % passo === 0;
  };
  const caminhoArea = `M0,${ALTURA} L${coordenadas.join(" L")} L100,${ALTURA} Z`;
  const ultimo = pontos[n - 1];
  const colunas = `repeat(${n}, minmax(0, 1fr))`;
  return (
    <div>
      <p className="text-[12.5px] text-muted mb-2 flex justify-between gap-2 flex-wrap">
        <span>{dados.eixoY} por {dados.eixoX.toLowerCase()}</span>
        <span className="font-bold text-ink">{ultimo.rotulo}: {formatar(ultimo.valor, dados.formato, true)}</span>
      </p>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "max-content minmax(0, 1fr)" }}>
        <div className="flex flex-col justify-between text-right" style={{ height: ALTURA }}>
          <span className="text-[11px] leading-none text-muted">{formatar(max, dados.formato, true)}</span>
          <span className="text-[11px] leading-none text-muted">{formatar(max / 2, dados.formato, true)}</span>
          <span className="text-[11px] leading-none text-muted">{formatar(0, dados.formato, true)}</span>
        </div>
        <svg className="painel-svg" height={ALTURA} viewBox={`0 0 100 ${ALTURA}`} preserveAspectRatio="none" aria-hidden="true">
          <line className="painel-traco" x1="0" y1="0.5" x2="100" y2="0.5" stroke="var(--color-line)" strokeWidth="1" />
          <line className="painel-traco" x1="0" y1={ALTURA / 2} x2="100" y2={ALTURA / 2} stroke="var(--color-line)" strokeWidth="1" />
          <line className="painel-traco" x1="0" y1={ALTURA - 0.5} x2="100" y2={ALTURA - 0.5} stroke="var(--color-ink)" strokeWidth="1" strokeOpacity="0.5" />
          {area && <path d={caminhoArea} fill="var(--color-accent)" fillOpacity="0.14" />}
          <polyline className="painel-traco" points={coordenadas.join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <div className="grid gap-2.5 mt-2" style={{ gridTemplateColumns: "max-content minmax(0, 1fr)" }}>
        <div className="invisible text-[11px] leading-none" aria-hidden="true">{formatar(max, dados.formato, true)}</div>
        <div className="grid" style={{ gridTemplateColumns: colunas }}>
          {pontos.map((p, i) => (
            // Rótulo visível transborda para as células vizinhas, que estão vazias de propósito:
            // com 30 pontos a célula tem 1/30 da largura e "23/08" viraria "2…".
            <span key={`${p.rotulo}-${i}`} className={`min-w-0 text-[11px] text-muted ${visivel(i) ? "overflow-visible whitespace-nowrap" : "truncate"} ${i === 0 ? "text-left" : i === n - 1 ? "text-right" : "text-center"}`} title={`${p.rotulo}: ${formatar(p.valor, dados.formato)}`}>
              {visivel(i) && (
                <>
                  <span className="max-md:hidden">{p.rotulo}</span>
                  <span className="md:hidden">{rotuloCurto(p.rotulo)}</span>
                </>
              )}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">{`${titulo}, ${dados.eixoY} por ${dados.eixoX}: ${pontos.map((p) => `${p.rotulo} ${formatar(p.valor, dados.formato)}`).join(", ")}.`}</p>
    </div>
  );
}

import { Chip } from "@/components/ui";
import { orcamentoDaCategoria, type ItemOrcamento } from "@/lib/orcamento-calculo";
import type { CategoriaCrescimento, CategoriaResumo } from "@/lib/types";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** O formato compacto do Intl usa espaço NÃO separável ("R$ 105 mil"), que não quebra linha e estoura
 * coluna estreita: trocado por espaço comum antes de ir para a tela (ver CLAUDE.md). */
function compacto(v: number) {
  return moedaCompacta.format(v).replace(/[\u00a0\u202f]/g, " ");
}

function percentual(v: number) {
  const sinal = v > 0 ? "+" : "";
  return `${sinal}${(v || 0).toFixed(1).replace(".", ",")}%`;
}

export function GraficoCategorias({
  categorias,
  maiorCrescimento,
  orcamento,
  meses = 1,
}: {
  categorias: CategoriaResumo[];
  maiorCrescimento?: CategoriaCrescimento;
  orcamento?: ItemOrcamento[];
  /** Nº de meses do período mostrado no gráfico: converte o orçamento (mensal) para a mesma escala do total por categoria. */
  meses?: number;
}) {
  if (!categorias.length) return <p className="text-muted text-sm">Sem categorias suficientes para o gráfico.</p>;

  const max = Math.max(...categorias.map((c) => c.total), 1);
  const temOrcamento = Boolean(orcamento?.length);
  const mesesNoPeriodo = Math.max(meses, 1);

  return (
    <div>
      <div className="flex flex-col gap-3">
        {categorias.map((c) => {
          const destaque = c.categoria === maiorCrescimento?.categoria;
          const largura = Math.max((c.total / max) * 100, 2);
          const orcadoMensal = orcamento ? orcamentoDaCategoria(orcamento, c.categoria) : undefined;
          const orcadoPeriodo = orcadoMensal !== undefined ? orcadoMensal * mesesNoPeriodo : undefined;
          const estourou = orcadoPeriodo !== undefined && c.total > orcadoPeriodo;
          return (
            <div key={c.categoria} className="flex items-center gap-2.5 flex-wrap">
              <span className="w-[104px] shrink-0 text-[13px] text-muted text-right truncate" title={c.categoria}>
                {c.categoria}
              </span>
              <div className="flex-1 min-w-0 relative">
                <div
                  className={`h-7 rounded-[4px] ${destaque ? "bg-warn" : "bg-accent"}`}
                  style={{ width: `${largura}%` }}
                  title={`${c.categoria}: ${moeda.format(c.total)}`}
                />
                {orcadoPeriodo !== undefined && (
                  <div
                    className={`absolute top-0 h-7 w-[2px] ${estourou ? "bg-danger" : "bg-ink/50"}`}
                    style={{ left: `${Math.min((orcadoPeriodo / max) * 100, 100)}%` }}
                    title={`Orçamento do período: ${moeda.format(orcadoPeriodo)}`}
                  />
                )}
              </div>
              <span className="min-w-[80px] shrink-0 text-[13px] font-bold text-ink">{compacto(c.total)}</span>
              {estourou && <Chip nivel="alta">Acima do orçamento</Chip>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5 mt-3.5 text-[13px] text-muted">
        {maiorCrescimento && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-warn shrink-0" />
            Maior crescimento: {maiorCrescimento.categoria} ({percentual(maiorCrescimento.variacao)})
          </div>
        )}
        {temOrcamento && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-[2px] h-2.5 bg-ink/50 shrink-0" />
            Linha: orçamento mensal da categoria, no total do período
          </div>
        )}
      </div>
    </div>
  );
}

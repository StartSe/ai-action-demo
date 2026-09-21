// Cartão de indicador: número grande, variação contra o período anterior e, se houver meta, uma barra de
// progresso em SVG (<rect> imprime; fundo de div não).
import { formatar, tomDaVariacao, variacao, variacaoTexto } from "@/lib/formatar";
import type { DadosIndicador } from "@/lib/types";

const COR_TOM = { ok: "text-ok", danger: "text-danger", neutro: "text-muted" } as const;

export function CartaoIndicador({ dados, titulo }: { dados: DadosIndicador; titulo: string }) {
  const v = variacao(dados.valor, dados.anterior);
  const tom = tomDaVariacao(v, dados.direcaoBoa);
  const compacto = dados.formato === "moeda" && Math.abs(dados.valor) >= 100000;
  const progresso = dados.meta ? Math.max(0, Math.min(100, (dados.valor / dados.meta) * 100)) : null;
  return (
    <div>
      <p className="text-[30px] max-md:text-[26px] leading-none font-extrabold tracking-[-0.02em] text-ink text-balance break-words" title={formatar(dados.valor, dados.formato)}>
        {formatar(dados.valor, dados.formato, compacto)}
      </p>
      <p className="text-[12.5px] mt-2 flex items-baseline gap-1.5 flex-wrap">
        <span className={`font-bold ${COR_TOM[tom]}`}>{variacaoTexto(v)}</span>
        <span className="text-muted">contra o período anterior ({formatar(dados.anterior, dados.formato, compacto)})</span>
      </p>
      {progresso !== null && dados.meta !== undefined && (
        <div className="mt-3">
          <svg className="painel-svg" height={6} viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="0" width="100" height="6" fill="var(--color-accent-soft)" />
            <rect x="0" y="0" width={progresso} height="6" fill="var(--color-accent)" />
          </svg>
          <p className="text-[12px] text-muted mt-1.5">{Math.round(progresso)}% da meta de {formatar(dados.meta, dados.formato, compacto)}</p>
        </div>
      )}
      <p className="sr-only">{`${titulo}: ${formatar(dados.valor, dados.formato)}, ${variacaoTexto(v)} contra ${formatar(dados.anterior, dados.formato)} no período anterior.`}</p>
    </div>
  );
}

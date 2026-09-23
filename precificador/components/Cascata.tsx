"use client";
// Para onde vai cada real cobrado: barra empilhada com legenda.
//
// É o price waterfall reduzido ao que um pequeno negócio tem — imposto, taxa do canal, custo
// direto, custo fixo rateado e o que sobra.
import { moeda, percentual } from "@/lib/formato";
import type { Cascata as DadosCascata } from "@/lib/precificacao";

const COR: Record<string, string> = {
  imposto: "#8a93a6",
  canal: "#b8bfcc",
  direto: "var(--color-accent)",
  rateio: "var(--color-accent-2)",
  lucro: "var(--estado-saudavel)",
};

export function Cascata({ cascata }: { cascata: DadosCascata }) {
  const lucro = cascata.fatias.find((f) => f.chave === "lucro")!;

  return (
    <section aria-label="Para onde vai o preço">
      <h3 className="section-title">Para onde vai cada real</h3>

      <div className="flex h-7 rounded-field overflow-hidden border border-line" role="img" aria-label={cascata.fatias.map((f) => `${f.rotulo}: ${moeda(f.valor)}`).join(", ")}>
        {cascata.fatias
          .filter((f) => f.fracao > 0.001)
          .map((f) => (
            <div key={f.chave} style={{ width: `${f.fracao * 100}%`, background: COR[f.chave] }} title={`${f.rotulo}: ${moeda(f.valor)}`} />
          ))}
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {cascata.fatias.map((f) => (
          <li key={f.chave} className="flex items-center gap-2 text-[13px]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COR[f.chave] }} aria-hidden="true" />
            <span className="text-ink-2 flex-1">{f.rotulo}</span>
            <span className={`cifra font-semibold ${f.chave === "lucro" && f.valor < 0 ? "text-danger" : "text-ink"}`}>{moeda(f.valor)}</span>
            <span className="cifra text-muted w-14 text-right">{cascata.preco > 0 ? percentual(f.valor / cascata.preco, 0) : "—"}</span>
          </li>
        ))}
      </ul>

      {cascata.prejuizo && (
        <p className="mt-3 text-[13px] text-danger font-semibold">
          Falta {moeda(Math.abs(lucro.valor))} para esta venda se pagar. Cada unidade vendida aumenta o buraco.
        </p>
      )}
    </section>
  );
}

// Força e tendência de um sinal como chips (mesma escala de cor dos chips da suíte: alta = danger,
// média = warn, baixa = ok). A tendência usa um chevron SVG, não uma seta em texto.
import type { Sinal } from "@/lib/types";

export const ROTULO_FORCA: Record<Sinal["forca"], string> = { alta: "Força alta", media: "Força média", baixa: "Força baixa" };
export const ROTULO_TENDENCIA: Record<Sinal["tendencia"], string> = { subindo: "Subindo", estavel: "Estável", caindo: "Caindo" };

export function Chevron({ tendencia, className = "" }: { tendencia: Sinal["tendencia"]; className?: string }) {
  const d = tendencia === "subindo" ? "M3 8.5 6 5.5 9 8.5" : tendencia === "caindo" ? "M3 3.5 6 6.5 9 3.5" : "M2.5 6h7";
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}

export function SinalChips({ forca, tendencia, className = "" }: { forca: Sinal["forca"]; tendencia: Sinal["tendencia"]; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className={`chip-${forca}`}>{ROTULO_FORCA[forca]}</span>
      <span className={`${tendencia === "subindo" ? "chip-neutral" : "chip-cinza"} inline-flex items-center gap-1`}>
        <Chevron tendencia={tendencia} />
        {ROTULO_TENDENCIA[tendencia]}
      </span>
    </span>
  );
}

"use client";

import { useState } from "react";
import { proporcao, type Cena, type Formato } from "@/lib/types";

/** Largura do quadro por proporção: o vertical e o quadrado não ocupam a largura toda do cartão para não ficarem altos demais. */
const LARGURA: Record<Formato, string> = { "9:16": "min(100%, 240px)", "16:9": "100%", "1:1": "min(100%, 340px)" };

/**
 * Prévia ilustrativa de um conceito: um quadro na proporção escolhida, com a imagem do produto ao fundo
 * (sobreposição escura a 40%) e o texto de cada cena entrando num crossfade discreto (3 s por cena, CSS puro,
 * desligado por prefers-reduced-motion). Escolher uma cena nos botões abaixo para a alternância e fixa a cena.
 * `fixa` nasce com a cena 1 fixa e sem animação: é o que a captura de tela usa (?captura=1), senão as três
 * cenas saem sobrepostas na imagem.
 */
export function Storyboard({ cenas, formato, imagem, titulo, fixa = false }: { cenas: Cena[]; formato: Formato; imagem?: string; titulo: string; fixa?: boolean }) {
  const [ativa, setAtiva] = useState<number | null>(fixa ? 0 : null);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="storyboard relative overflow-hidden rounded-[14px] bg-[#1c1530] text-white select-none"
        data-manual={ativa === null ? "nao" : "sim"}
        style={{ aspectRatio: proporcao(formato), width: LARGURA[formato], containerType: "inline-size" }}
        role="img"
        aria-label={`Prévia ilustrativa do conceito ${titulo}: ${cenas.map((c) => c.textoNaTela).join(" / ")}`}
      >
        <div
          className="storyboard-fundo absolute inset-0 bg-cover bg-center"
          style={imagem ? { backgroundImage: `url("${imagem}")` } : { backgroundImage: "radial-gradient(circle at 50% 40%, var(--color-accent) 0%, var(--color-accent-ink) 55%, #1c1530 100%)" }}
        />
        <div className="absolute inset-0 bg-black/40" />
        {cenas.map((c, i) => (
          <div key={i} className="storyboard-cena absolute inset-0 flex items-center justify-center p-[6cqw] text-center" data-indice={i} data-ativa={ativa === i ? "sim" : "nao"} style={{ animationDelay: `${i * 3}s` }}>
            <p className="font-bold text-[clamp(15px,7.5cqw,30px)] leading-[1.15] tracking-[-0.01em] [text-shadow:0_2px_12px_rgba(0,0,0,0.55)]">{c.textoNaTela}</p>
          </div>
        ))}
        <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em]">Prévia ilustrativa</span>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Escolher a cena da prévia">
        {cenas.map((c, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={ativa === i}
            title={ativa === i ? "Voltar a alternar as cenas" : `Fixar a cena ${i + 1}: ${c.textoNaTela}`}
            onClick={() => setAtiva(ativa === i ? null : i)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold border transition-colors ${ativa === i ? "bg-accent text-white border-accent" : "bg-surface text-muted border-line hover:text-ink"}`}
          >
            Cena {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

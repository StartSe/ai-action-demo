"use client";
import { useId, useState } from "react";
import { DIMENSOES } from "@/lib/modelo";
import type { MediaDimensao } from "@/lib/types";
const nomes = [
  "Estratégia",
  "Dados",
  "Pessoas",
  "Processos",
  "Governança",
  "Resultados",
];
export function BussolaOrbital({
  medias = [],
  compacta = false,
}: {
  medias?: MediaDimensao[];
  compacta?: boolean;
}) {
  const gradiente = useId();
  const arredondar = (n: number) => Number(n.toFixed(4));
  const [ativo, setAtivo] = useState(0);
  const dimensoes = medias.length
    ? medias.map((m) => m.dimensao)
    : DIMENSOES.map((d) => d.nome);
  const ponto = (i: number, r: number) => {
    const a = (i * 2 * Math.PI) / dimensoes.length - Math.PI / 2;
    return [
      arredondar(200 + Math.cos(a) * r),
      arredondar(200 + Math.sin(a) * r),
    ];
  };
  const media = medias[ativo]?.media;
  return (
    <div className={`orbital ${compacta ? "orbital-compacta" : ""}`}>
      <svg
        viewBox="0 0 400 400"
        role="img"
        aria-label={
          medias.length
            ? "Radar de maturidade. Valores disponíveis nos botões de dimensão."
            : "Bússola das seis dimensões do assessment, ainda sem respostas."
        }
      >
        <defs>
          <radialGradient id={gradiente}>
            <stop offset="0" stopColor="#bcefa6" stopOpacity=".18" />
            <stop offset="1" stopColor="#bcefa6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="190" fill={`url(#${gradiente})`} />
        {[45, 80, 115, 150].map((r) => (
          <circle
            key={r}
            cx="200"
            cy="200"
            r={r}
            fill="none"
            stroke="#7c9e9f"
            strokeOpacity=".24"
            strokeDasharray={r === 150 ? "2 7" : undefined}
          />
        ))}
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i * Math.PI) / 30;
          return (
            <line
              key={i}
              x1={arredondar(200 + Math.cos(a) * 162)}
              y1={arredondar(200 + Math.sin(a) * 162)}
              x2={arredondar(200 + Math.cos(a) * (i % 5 === 0 ? 169 : 165))}
              y2={arredondar(200 + Math.sin(a) * (i % 5 === 0 ? 169 : 165))}
              stroke="#a3c5bf"
              strokeOpacity=".4"
            />
          );
        })}
        {dimensoes.map((d, i) => {
          const [x, y] = ponto(i, 150);
          return (
            <line
              key={d}
              x1="200"
              y1="200"
              x2={x}
              y2={y}
              stroke="#96b5ae"
              strokeOpacity=".2"
            />
          );
        })}
        {medias.length > 0 ? (
          <>
            <polygon
              points={medias
                .map((m, i) => ponto(i, m.media * 30).join(","))
                .join(" ")}
              fill="#b9ed93"
              fillOpacity=".17"
              stroke="#c5f394"
              strokeWidth="2"
            />
            {medias.map((m, i) => {
              const [cx, cy] = ponto(i, m.media * 30);
              return (
                <circle
                  key={m.dimensao}
                  cx={cx}
                  cy={cy}
                  r={i === ativo ? 5 : 3}
                  fill="#d2ffad"
                />
              );
            })}
          </>
        ) : (
          <g transform="rotate(32 200 200)">
            <path
              d="m200 99 22 101-22 101-22-101Z"
              fill="#bfea9f"
              fillOpacity=".1"
              stroke="#bfea9f"
              strokeWidth="1.2"
            />
            <path d="m200 99 22 101h-22Z" fill="#cef4ac" />
            <path d="m200 301-22-101h22Z" fill="#d4e5df" fillOpacity=".5" />
            <circle cx="200" cy="200" r="5" fill="#102f32" stroke="#d2fbb0" />
          </g>
        )}
      </svg>
      {dimensoes.map((d, i) => {
        const [x, y] = ponto(i, 182);
        return (
          <button
            type="button"
            className={`orbital-label ${i === ativo ? "active" : ""}`}
            key={d}
            style={{ left: `${x / 4}%`, top: `${y / 4}%` }}
            onClick={() => setAtivo(i)}
            aria-pressed={i === ativo}
          >
            {medias.length ? d.split(" e ")[0] : nomes[i]}
            {medias[i] && (
              <small>{medias[i].media.toLocaleString("pt-BR")}</small>
            )}
          </button>
        );
      })}
      <div className="orbital-caption" aria-live="polite">
        <span className="live-dot" />
        {dimensoes[ativo]}{" "}
        <span>
          {media !== undefined
            ? `${media.toLocaleString("pt-BR")} / 5`
            : "Explore as dimensões"}
        </span>
      </div>
    </div>
  );
}

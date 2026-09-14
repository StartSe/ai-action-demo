"use client";
// Radar de maturidade: SVG só com as formas geométricas (eixos, anéis, polígono), com
// preserveAspectRatio padrão e um container quadrado (aspect-square) que casa exatamente com o
// viewBox — os rótulos (nomes das dimensões e os números dos anéis) são HTML posicionado por
// porcentagem por cima, então o tamanho da fonte nunca escala com o container (mesma técnica já
// usada em radar-sinais/components/Grafo.tsx e documentada em progress.txt).
import { ESCALA_MODELO } from "@/lib/modelo";
import type { LeituraDimensao, MediaDimensao } from "@/lib/types";
import { DataTable } from "./ui";

const TAMANHO = 200;
const CENTRO = TAMANHO / 2;
const RAIO = 72;
const RAIO_ROTULO = 92;
const ANEIS = [1, 3, 5];

function pontoEixo(indice: number, total: number, raio: number) {
  const angulo = -Math.PI / 2 + (2 * Math.PI * indice) / total;
  return { x: CENTRO + raio * Math.cos(angulo), y: CENTRO + raio * Math.sin(angulo) };
}

function raioParaValor(valor: number) {
  const { min, max } = ESCALA_MODELO;
  const t = Math.max(0, Math.min(1, (valor - min) / (max - min)));
  return RAIO * t;
}

function pct(v: number) {
  return `${(v / TAMANHO) * 100}%`;
}

export function GraficoMaturidade({ medias, leituraPorDimensao }: { medias: MediaDimensao[]; leituraPorDimensao: LeituraDimensao[] }) {
  const n = medias.length;
  if (n < 3) return null;

  const pontosPoligono = medias.map((m, i) => pontoEixo(i, n, raioParaValor(m.media)));
  const caminhoPoligono = pontosPoligono.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div>
      <div className="relative w-full max-w-[360px] mx-auto aspect-square mb-4">
        <svg viewBox={`0 0 ${TAMANHO} ${TAMANHO}`} className="absolute inset-0 w-full h-full" aria-hidden="true">
          {ANEIS.map((v) => {
            const raio = raioParaValor(v);
            const pontos = medias.map((_, i) => pontoEixo(i, n, raio)).map((p) => `${p.x},${p.y}`).join(" ");
            return <polygon key={v} points={pontos} fill="none" stroke="#d0d5dd" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />;
          })}
          {medias.map((_, i) => {
            const p = pontoEixo(i, n, RAIO);
            return <line key={i} x1={CENTRO} y1={CENTRO} x2={p.x} y2={p.y} stroke="#e4e7ec" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />;
          })}
          <polygon points={caminhoPoligono} fill="var(--color-accent)" fillOpacity={0.15} stroke="var(--color-accent)" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {pontosPoligono.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--color-accent)" />
          ))}
        </svg>

        {ANEIS.map((v) => {
          const p = pontoEixo(0, n, raioParaValor(v));
          return (
            <span
              key={v}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] leading-none text-muted bg-surface/90 px-1 rounded"
              style={{ left: pct(p.x), top: pct(p.y) }}
            >
              {v}
            </span>
          );
        })}

        {medias.map((m, i) => {
          const p = pontoEixo(i, n, RAIO_ROTULO);
          return (
            <span
              key={m.dimensao}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px] leading-tight font-semibold text-ink text-center max-w-[92px]"
              style={{ left: pct(p.x), top: pct(p.y) }}
            >
              {m.dimensao}
            </span>
          );
        })}
      </div>

      <DataTable<LeituraDimensao>
        colunas={[
          { chave: "dimensao", titulo: "Dimensão", render: (l) => l.dimensao },
          { chave: "leitura", titulo: "Leitura", render: (l) => l.leitura },
        ]}
        linhas={leituraPorDimensao}
      />
    </div>
  );
}

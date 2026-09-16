"use client";
// Radar de maturidade: SVG só com as formas geométricas (eixos, anéis, polígono), com
// preserveAspectRatio padrão e um quadrado exato para o SVG — os rótulos (nomes das dimensões e os
// números dos anéis) são HTML posicionado por porcentagem por cima, então o tamanho da fonte nunca
// escala com o container (mesma técnica já usada em radar-sinais/components/Grafo.tsx).
// A moldura é mais larga que alta (LARGURA x ALTURA) para os rótulos das laterais terem espaço e não
// quebrarem em três linhas (US-029): o quadrado do SVG fica centralizado dentro dela.
// A tabela abaixo do gráfico é a ÚNICA lista de médias do diagnóstico (média colorida por faixa +
// leitura), para as seis médias não aparecerem três vezes na tela.
import { faixaDaMedia } from "@/lib/analise-bussola";
import { numero } from "@/lib/formato";
import { ESCALA_MODELO } from "@/lib/modelo";
import type { LeituraDimensao, MediaDimensao } from "@/lib/types";
import { Chip, DataTable } from "./ui";

const TAMANHO = 200;
const LARGURA = 280;
const ALTURA = 224;
const DESLOCAMENTO_X = (LARGURA - TAMANHO) / 2;
const DESLOCAMENTO_Y = (ALTURA - TAMANHO) / 2;
const CENTRO = TAMANHO / 2;
const RAIO = 72;
const RAIO_ROTULO = 90;
const ANEIS = [1, 3, 5];

/** Cor do chip da média por faixa (índice de faixaDaMedia): vermelho, laranja, acento, verde, verde. */
const CHIP_POR_FAIXA = ["alta", "media", "neutral", "baixa", "baixa"];

function pontoEixo(indice: number, total: number, raio: number) {
  const angulo = -Math.PI / 2 + (2 * Math.PI * indice) / total;
  return { x: CENTRO + raio * Math.cos(angulo), y: CENTRO + raio * Math.sin(angulo) };
}

function raioParaValor(valor: number) {
  const { min, max } = ESCALA_MODELO;
  const t = Math.max(0, Math.min(1, (valor - min) / (max - min)));
  return RAIO * t;
}

/** Posição (em % da moldura) de um ponto do quadrado do SVG. */
function pctX(v: number) {
  return `${((v + DESLOCAMENTO_X) / LARGURA) * 100}%`;
}
function pctY(v: number) {
  return `${((v + DESLOCAMENTO_Y) / ALTURA) * 100}%`;
}

/** Rótulo à esquerda do centro cresce para a esquerda, à direita para a direita, no topo/base centralizado. */
function alinhamentoRotulo(x: number): string {
  if (x < CENTRO - 8) return "-translate-x-full text-right";
  if (x > CENTRO + 8) return "text-left";
  return "-translate-x-1/2 text-center";
}

export function ChipMedia({ media }: { media: number }) {
  return <Chip nivel={CHIP_POR_FAIXA[faixaDaMedia(media)]}>{numero(media, 1)}</Chip>;
}

type LinhaDimensao = { dimensao: string; media: number; leitura: string };

export function GraficoMaturidade({ medias, leituraPorDimensao }: { medias: MediaDimensao[]; leituraPorDimensao: LeituraDimensao[] }) {
  const n = medias.length;
  if (n < 3) return null;

  const pontosPoligono = medias.map((m, i) => pontoEixo(i, n, raioParaValor(m.media)));
  const caminhoPoligono = pontosPoligono.map((p) => `${p.x},${p.y}`).join(" ");
  const linhas: LinhaDimensao[] = medias.map((m) => ({ dimensao: m.dimensao, media: m.media, leitura: leituraPorDimensao.find((l) => l.dimensao === m.dimensao)?.leitura ?? "" }));

  return (
    <div>
      <div className="relative w-full max-w-[420px] mx-auto mb-5" style={{ aspectRatio: `${LARGURA} / ${ALTURA}` }}>
        <svg
          viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}
          className="absolute"
          style={{ left: pctX(0), top: pctY(0), width: `${(TAMANHO / LARGURA) * 100}%`, height: `${(TAMANHO / ALTURA) * 100}%` }}
          aria-hidden="true"
        >
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
              style={{ left: pctX(p.x), top: pctY(p.y) }}
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
              className={`absolute -translate-y-1/2 text-[11px] max-md:text-[10px] leading-tight font-semibold text-ink max-w-[112px] max-md:max-w-[84px] ${alinhamentoRotulo(p.x)}`}
              style={{ left: pctX(p.x), top: pctY(p.y) }}
            >
              {m.dimensao}
            </span>
          );
        })}
      </div>

      <DataTable<LinhaDimensao>
        colunas={[
          { chave: "dimensao", titulo: "Dimensão", papel: "titulo", largura: "30%", render: (l) => <strong>{l.dimensao}</strong> },
          { chave: "media", titulo: "Média (1 a 5)", papel: "chip", largura: "120px", render: (l) => <ChipMedia media={l.media} /> },
          { chave: "leitura", titulo: "Leitura", render: (l) => l.leitura },
        ]}
        linhas={linhas}
      />
    </div>
  );
}

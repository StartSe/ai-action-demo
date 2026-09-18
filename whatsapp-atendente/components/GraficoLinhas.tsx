"use client";
// O gráfico de "Conversas ao longo do tempo" da tela de Relatórios: duas linhas por dia, desenhadas à
// mão em SVG. Sem biblioteca de gráficos — a suíte não ganha dependência nova por uma tela (PADRAO.md).
//
// Como ele é desenhado, para quem for mexer depois:
//
// - A GEOMETRIA é fixa e escrita à mão (margens, altura, raio dos pontos), mas o `viewBox` acompanha a
//   largura medida do cartão, de modo que **uma unidade do desenho é um pixel da tela**. É o que faz o
//   texto do eixo ter o mesmo tamanho em qualquer largura: com um `viewBox` de largura constante, o
//   desenho inteiro encolheria junto com o cartão e os rótulos dos dias ficariam com 5 px no celular.
//   Nada é esticado numa direção só — a proporção do desenho é a da caixa, e o único que acompanha a
//   largura é o fundo (as linhas de grade), que não tem forma para distorcer.
// - Escala LINEAR começando no zero, com o topo arredondado para um múltiplo de quatro: as cinco
//   marcas do eixo da esquerda são sempre números inteiros.
// - A área sob a linha principal é um degradê do acento que some para baixo — é o "suave" do desenho;
//   nenhuma animação além do `reveal` da tela.
// - Nada é calculado aqui além da geometria: os números chegam prontos de `GET /api/metricas`
//   (lib/metricas.ts é a fonte única, ver as definições no topo daquele arquivo).
//
// Acessibilidade: o SVG é uma imagem com `<title>`, e os mesmos números aparecem numa tabela que só o
// leitor de tela vê. Quem não enxerga o desenho lê a tabela, dia a dia.
import { useEffect, useRef, useState } from "react";
import { numero } from "@/lib/formato";
import { diaAbreviado, diaLongo } from "@/lib/rotulos";
import type { DiaMetricas } from "@/lib/types";

/** Largura usada antes da primeira medida do cartão (e no pré-render, que não tem tela nenhuma). */
const LARGURA_PADRAO = 760;

/** Abaixo desta largura o desenho é tratado como celular: mais baixo e com menos dias nomeados. */
const ESTREITO = 520;

/** As margens de dentro do desenho: espaço dos números à esquerda e dos dias embaixo. */
const ESQUERDA = 34;
const DIREITA = 10;
const TOPO = 14;
const RODAPE = 28;

const ID_DEGRADE = "grafico-conversas-degrade";

/**
 * O topo da escala e as cinco marcas do eixo da esquerda, sempre inteiras: o passo é o maior valor
 * dividido por quatro, arredondado para cima. Com todos os dias zerados, a escala vai de 0 a 4 e as
 * duas linhas ficam deitadas na base — em vez de o gráfico sumir.
 */
function escala(maximo: number): { topo: number; marcas: number[] } {
  const passo = Math.max(1, Math.ceil(Math.max(maximo, 1) / 4));
  return { topo: passo * 4, marcas: [0, passo, passo * 2, passo * 3, passo * 4] };
}

export function GraficoLinhas({ dias }: { dias: DiaMetricas[] }) {
  const caixa = useRef<HTMLElement>(null);
  const [medida, setMedida] = useState(0);

  // A medida vem do `ResizeObserver`, que dispara sozinho logo depois de observar (e de novo a cada
  // giro de tela). Como ele chama de volta FORA do corpo do efeito, não há `setEstado` síncrono aqui:
  // a regra `react-hooks/set-state-in-effect`, que é erro nesta suíte, continua satisfeita.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const observador = new ResizeObserver(([entrada]) => setMedida(Math.round(entrada.contentRect.width)));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const largura = medida || LARGURA_PADRAO;
  const estreito = largura < ESTREITO;
  const altura = estreito ? 200 : 250;

  const areaLargura = largura - ESQUERDA - DIREITA;
  const areaAltura = altura - TOPO - RODAPE;
  const base = TOPO + areaAltura;

  const { topo, marcas } = escala(Math.max(...dias.map((d) => Math.max(d.conversas, d.resolvidasIA)), 0));

  // Com um dia só (o período "Hoje") não há linha para traçar: o ponto fica no meio da área e o
  // desenho vira um ponto por série, que é a leitura honesta de uma medida única.
  const x = (i: number) => (dias.length === 1 ? ESQUERDA + areaLargura / 2 : ESQUERDA + (i * areaLargura) / (dias.length - 1));
  const y = (valor: number) => base - (valor / topo) * areaAltura;

  const linha = (pegar: (d: DiaMetricas) => number) => dias.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(pegar(d)).toFixed(1)}`).join(" ");
  const areaSobALinha = `${linha((d) => d.conversas)} L ${x(dias.length - 1).toFixed(1)} ${base} L ${x(0).toFixed(1)} ${base} Z`;

  // Os rótulos do eixo são contados a partir do ÚLTIMO dia: o dia mais recente é o que a pessoa
  // procura primeiro e nunca pode ficar sem nome, mesmo nos trinta dias.
  const passoRotulo = Math.max(1, Math.ceil(dias.length / (estreito ? 4 : 7)));
  const nomeado = (i: number) => (dias.length - 1 - i) % passoRotulo === 0;
  const ancoragem = (i: number) => (dias.length > 1 && i === dias.length - 1 ? "end" : "middle");

  // Trinta pontos na largura do cartão viram um colar de contas: nos períodos longos eles encolhem,
  // o suficiente para marcar cada dia sem competir com a linha.
  const raio = dias.length > 12 ? 2.5 : 3.5;

  const primeiro = diaLongo(dias[0]?.dia ?? "");
  const ultimo = diaLongo(dias[dias.length - 1]?.dia ?? "");
  const descricao = dias.length === 1 ? `Conversas de ${ultimo}.` : `Conversas por dia, de ${primeiro} a ${ultimo}.`;

  if (dias.length === 0) {
    return <p className="text-[13px] text-muted">Ainda não há dias para mostrar neste período.</p>;
  }

  return (
    <figure className="m-0" ref={caixa}>
      <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" height={altura} role="img" aria-label={descricao}>
        <title>{descricao}</title>
        <defs>
          <linearGradient id={ID_DEGRADE} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Fundo: as cinco linhas de grade e os números do eixo da esquerda. */}
        {marcas.map((valor) => (
          <g key={valor}>
            <line x1={ESQUERDA} y1={y(valor)} x2={largura - DIREITA} y2={y(valor)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={ESQUERDA - 8} y={y(valor) + 4} textAnchor="end" fontSize="12" fill="var(--color-muted)">
              {numero(valor)}
            </text>
          </g>
        ))}

        {dias.length > 1 && (
          <>
            <path d={areaSobALinha} fill={`url(#${ID_DEGRADE})`} />
            <path d={linha((d) => d.resolvidasIA)} fill="none" stroke="var(--color-accent)" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={linha((d) => d.conversas)} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {dias.map((d, i) => (
          <g key={d.dia}>
            <circle cx={x(i)} cy={y(d.resolvidasIA)} r={raio} fill="var(--color-surface)" stroke="var(--color-accent)" strokeOpacity="0.5" strokeWidth="2" />
            <circle cx={x(i)} cy={y(d.conversas)} r={raio} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2" />
            {dias.length === 1 && (
              // Um ponto solto não diz de qual série ele é: com um dia só, o número vai escrito ao
              // lado, e a legenda embaixo faz a ligação com a cor.
              <>
                <text x={x(i) + 10} y={y(d.conversas) + 4} fontSize="13" fontWeight="700" fill="var(--color-accent)">
                  {numero(d.conversas)}
                </text>
                <text
                  x={x(i) + 10}
                  // Com os dois números iguais os pontos se sobrepõem: o segundo desce uma linha para
                  // os dois continuarem legíveis.
                  y={y(d.resolvidasIA) + (d.resolvidasIA === d.conversas ? 20 : 4)}
                  fontSize="13"
                  fontWeight="700"
                  fill="var(--color-accent)"
                  fillOpacity="0.5"
                >
                  {numero(d.resolvidasIA)}
                </text>
              </>
            )}
            {nomeado(i) && (
              // O rótulo do último dia encosta na borda direita do desenho: centrado, metade dele
              // ficaria fora do `viewBox` e o navegador cortaria o texto ("17 se" no lugar de "17 set").
              <text x={x(i)} y={altura - 8} textAnchor={ancoragem(i)} fontSize="12" fill="var(--color-muted)">
                {diaAbreviado(d.dia)}
              </text>
            )}
          </g>
        ))}
      </svg>

      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-[13px] text-ink-2">
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-accent" aria-hidden="true" />
          Total de conversas
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-accent opacity-50" aria-hidden="true" />
          Resolvidas pela IA
        </span>
      </figcaption>

      {/* A tabela vai dentro de um `div.sr-only`, nunca com a classe nela mesma: uma `<table>` trata
          `width: 1px` como largura MÍNIMA e cresce até caber o conteúdo, empurrando a rolagem
          horizontal da página no celular (412 px de conteúdo numa tela de 390). No `div` o recorte
          funciona, e o leitor de tela continua lendo a tabela inteira. */}
      <div className="sr-only">
        <table>
          <caption>{descricao}</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Total de conversas</th>
              <th scope="col">Resolvidas pela IA</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.dia}>
                <th scope="row">{diaLongo(d.dia)}</th>
                <td>{numero(d.conversas)}</td>
                <td>{numero(d.resolvidasIA)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

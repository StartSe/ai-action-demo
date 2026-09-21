"use client";
// A régua do corredor: quatro marcadores e um marcador arrastável. É a peça que define o produto.
//
// Três decisões que valem registro:
//  1. **Marcador só aparece quando existe.** Sem concorrente cadastrado, a faixa de mercado some da
//     régua em vez de aparecer vazia; o mesmo vale para o teto de valor.
//  2. **Teclado de verdade.** Setas andam um passo, Shift anda dez, Home e End vão às pontas — a
//     régua é um `slider` com `aria-valuetext` em reais, não um enfeite só para mouse.
//  3. **Nenhuma requisição.** O componente só emite `onPreco`; quem grava é a tela, com atraso.
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { moeda } from "@/lib/formato";
import { EXPLICACAO_ESTADO } from "@/lib/rotulos";
import { estadoDoPreco, type Corredor as DadosCorredor } from "@/lib/precificacao";

type Marcador = { chave: string; rotulo: string; valor: number; cor: string };

type Legenda = { chave: string; rotulo: string; valor: number; pos: number; linha: number };

/** Abaixo desta distância (em % da régua) dois marcadores são o mesmo ponto e viram um rótulo só. */
const JUNTOS = 6;
/** Abaixo desta, cabem lado a lado só se um descer uma linha. */
const APERTADOS = 26;

/**
 * Resolve a colisão entre rótulos de marcadores próximos.
 *
 * Sem isto, um item sem custo informado põe "Lucro zero" e "Margem-alvo" exatamente no mesmo ponto
 * da régua e os dois textos, centrados na mesma posição, imprimem um por cima do outro. Marcadores
 * praticamente no mesmo lugar viram um rótulo só; os que estão apenas apertados descem uma linha.
 */
function agruparLegendas(marcadores: Marcador[], posicao: (valor: number) => number): Legenda[] {
  const legendas: Legenda[] = [];
  for (const m of [...marcadores].sort((a, b) => a.valor - b.valor)) {
    const pos = posicao(m.valor);
    const anterior = legendas[legendas.length - 1];
    if (anterior && pos - anterior.pos < JUNTOS) {
      // Mesmo ponto: junta os nomes e mantém um valor só (eles são o mesmo número, arredondado).
      anterior.rotulo = `${anterior.rotulo} e ${m.rotulo.toLowerCase()}`;
      anterior.chave = `${anterior.chave}-${m.chave}`;
      continue;
    }
    legendas.push({ chave: m.chave, rotulo: m.rotulo, valor: m.valor, pos, linha: 0 });
  }

  for (let i = 1; i < legendas.length; i++) {
    const cabeNaMesmaLinha = legendas[i].pos - legendas[i - 1].pos >= APERTADOS || legendas[i - 1].linha === 1;
    legendas[i].linha = cabeNaMesmaLinha ? 0 : 1;
  }
  return legendas;
}

export function Corredor({ corredor, preco, onPreco }: { corredor: DadosCorredor; preco: number; onPreco: (p: number) => void }) {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);

  const { min, max } = corredor.escala;
  const faixa = Math.max(0.01, max - min);
  const posicao = (v: number) => Math.min(100, Math.max(0, ((v - min) / faixa) * 100));

  const marcadores: Marcador[] = [
    { chave: "prejuizo", rotulo: "Lucro zero", valor: corredor.pisoPrejuizo, cor: "var(--estado-prejuizo)" },
    ...(corredor.pisoMargemAlvo !== null ? [{ chave: "alvo", rotulo: "Margem-alvo", valor: corredor.pisoMargemAlvo, cor: "var(--estado-saudavel)" }] : []),
    ...(corredor.tetoValor !== null ? [{ chave: "teto", rotulo: "Teto de valor", valor: corredor.tetoValor, cor: "var(--estado-teto)" }] : []),
  ];

  const legendas = agruparLegendas(marcadores, posicao);
  const linhasDeLegenda = legendas.some((l) => l.linha > 0) ? 2 : 1;

  const estado = estadoDoPreco(corredor, preco);
  const passo = Math.max(0.01, Math.round((faixa / 100) * 100) / 100);

  function precoDoEvento(clienteX: number): number {
    const trilho = trilhoRef.current;
    if (!trilho) return preco;
    const caixa = trilho.getBoundingClientRect();
    const fracao = Math.min(1, Math.max(0, (clienteX - caixa.left) / caixa.width));
    return Math.round((min + fracao * faixa) * 100) / 100;
  }

  function aoApontar(e: ReactPointerEvent<HTMLDivElement>) {
    arrastando.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onPreco(precoDoEvento(e.clientX));
  }

  return (
    <section aria-label="Corredor de preço">
      {/* Faixa de mercado desenhada atrás dos marcadores: é referência, não linha de corte. */}
      <div className="relative pt-7 pb-2">
        <div
          ref={trilhoRef}
          role="slider"
          tabIndex={0}
          aria-label="Preço escolhido"
          aria-valuemin={Math.round(min * 100) / 100}
          aria-valuemax={Math.round(max * 100) / 100}
          aria-valuenow={Math.round(preco * 100) / 100}
          aria-valuetext={`${moeda(preco)}, ${EXPLICACAO_ESTADO[estado]}`}
          className="relative h-9 cursor-pointer touch-none select-none rounded-full focus-visible:outline-[3px] focus-visible:outline-accent-soft"
          onPointerDown={aoApontar}
          onPointerMove={(e) => arrastando.current && onPreco(precoDoEvento(e.clientX))}
          onPointerUp={(e) => {
            arrastando.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            arrastando.current = false;
          }}
          onKeyDown={(e) => {
            const salto = e.shiftKey ? passo * 10 : passo;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") onPreco(Math.round((preco + salto) * 100) / 100);
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onPreco(Math.max(0, Math.round((preco - salto) * 100) / 100));
            else if (e.key === "Home") onPreco(Math.round(min * 100) / 100);
            else if (e.key === "End") onPreco(Math.round(max * 100) / 100);
            else return;
            e.preventDefault();
          }}
        >
          {/* Trilho, com os quatro degraus pintados na ordem do corredor. */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2.5 rounded-full overflow-hidden bg-[var(--estado-prejuizo-suave)]">
            {corredor.pisoMargemAlvo !== null && (
              <div className="absolute inset-y-0 bg-[var(--estado-abaixo-suave)]" style={{ left: `${posicao(corredor.pisoPrejuizo)}%`, right: `${100 - posicao(corredor.pisoMargemAlvo)}%` }} />
            )}
            <div
              className="absolute inset-y-0 bg-[var(--estado-saudavel-suave)]"
              style={{ left: `${posicao(corredor.pisoMargemAlvo ?? corredor.pisoPrejuizo)}%`, right: `${100 - posicao(corredor.tetoValor ?? max)}%` }}
            />
            {corredor.tetoValor !== null && <div className="absolute inset-y-0 bg-[var(--estado-teto-suave)]" style={{ left: `${posicao(corredor.tetoValor)}%`, right: 0 }} />}
            {corredor.mercado && (
              <div
                className="absolute inset-y-0 border-y-2 border-dashed border-ink-2/40"
                style={{ left: `${posicao(corredor.mercado.min)}%`, right: `${100 - posicao(corredor.mercado.max)}%` }}
                aria-hidden="true"
              />
            )}
          </div>

          {marcadores.map((m) => (
            <div key={m.chave} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none" style={{ left: `${posicao(m.valor)}%` }} aria-hidden="true">
              <div className="w-[3px] h-5 rounded-full" style={{ background: m.cor }} />
            </div>
          ))}

          {/* O marcador arrastável. */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
            style={{ left: `${posicao(preco)}%` }}
            data-estado={estado}
          >
            <div className="w-6 h-6 rounded-full bg-surface border-[3px] shadow-card" style={{ borderColor: "var(--cor-estado)" }} />
          </div>
        </div>

        {/* Legenda dos marcadores, alinhada por posição e sem encavalar (ver agruparLegendas). */}
        <div className="relative mt-1" style={{ height: linhasDeLegenda * 40 }}>
          {legendas.map((l) => (
            <div
              key={l.chave}
              className="absolute -translate-x-1/2 text-center w-[96px]"
              style={{ left: `${Math.min(92, Math.max(8, l.pos))}%`, top: l.linha * 38 }}
            >
              <div className="text-[11px] font-semibold text-ink-2 leading-tight">{l.rotulo}</div>
              <div className="cifra text-[12px] text-muted">{moeda(l.valor)}</div>
            </div>
          ))}
        </div>
      </div>

      {corredor.mercado && (
        <p className="apoio -mt-1">
          O mercado cobra de {moeda(corredor.mercado.min)} a {moeda(corredor.mercado.max)}
          {corredor.mercado.quantidade === 1 ? " (um preço cadastrado, com 5% para cada lado)" : ` (${corredor.mercado.quantidade} preços cadastrados)`}.
        </p>
      )}
    </section>
  );
}

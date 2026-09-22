"use client";
// Modo "Reorganizar": os mesmos cartões do `Painel`, agora arrastáveis e redimensionáveis.
//
// O arrasto usa a API nativa de drag-and-drop do HTML, que não funciona em toque. Por isso todo
// cartão também tem botões de mover e de largura, e responde ao teclado (setas movem, Shift+setas
// mudam a largura). Quem está no celular ou no teclado não fica de fora do recurso.
//
// As contas de layout moram em `lib/layout.ts`, testadas à parte: aqui só há interação.
import { useId, useState, type DragEvent, type KeyboardEvent } from "react";
import { Corpo } from "./Painel";
import { mover, podeRedimensionar, redimensionar } from "@/lib/layout";
import { LARGURA_CLASSE } from "@/lib/validar-painel";
import type { ComponentePainel, EspecPainel } from "@/lib/types";
import "@/app/painel.css";

function Icone({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const SETA_ESQUERDA = "M15 18l-6-6 6-6";
const SETA_DIREITA = "M9 18l6-6-6-6";
const MENOS = "M5 12h14";
const MAIS = "M12 5v14M5 12h14";
const ARRASTAR = "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01";

const BOTAO = "w-7 h-7 grid place-items-center rounded-[7px] border border-line bg-surface text-muted hover:bg-bg disabled:opacity-35 disabled:cursor-not-allowed";

export function PainelEditavel({
  painel,
  onMudar,
}: {
  painel: EspecPainel;
  onMudar: (componentes: ComponentePainel[]) => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const instrucoesId = useId();

  const componentes = painel.componentes;
  const indiceDe = (id: string) => componentes.findIndex((c) => c.id === id);

  function aplicar(novos: ComponentePainel[] | null) {
    if (novos) onMudar(novos);
  }

  function soltarEm(idAlvo: string) {
    if (!arrastando || arrastando === idAlvo) return;
    aplicar(mover(componentes, arrastando, indiceDe(idAlvo)));
    setArrastando(null);
    setAlvo(null);
  }

  function aoArrastarSobre(e: DragEvent, id: string) {
    if (!arrastando || arrastando === id) return;
    e.preventDefault(); // sem isto o navegador recusa a solta
    setAlvo(id);
  }

  function aoTeclar(e: KeyboardEvent, c: ComponentePainel) {
    const i = indiceDe(c.id);
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const passo = e.key === "ArrowLeft" ? -1 : 1;
      if (e.shiftKey) aplicar(redimensionar(componentes, c.id, c.posicao.largura + passo));
      else aplicar(mover(componentes, c.id, i + passo));
    }
  }

  return (
    <div>
      <p id={instrucoesId} className="text-[12.5px] text-muted mb-3">
        Arraste um cartão sobre outro para trocar a ordem, ou use os botões. Com o cartão em foco: as setas movem e
        Shift + setas mudam a largura.
      </p>
      <div className="painel-grade" role="list" aria-describedby={instrucoesId}>
        {componentes.map((c, i) => {
          const ehAlvo = alvo === c.id && arrastando !== c.id;
          const saindo = arrastando === c.id;
          return (
            <article
              key={c.id}
              role="listitem"
              tabIndex={0}
              draggable
              aria-label={`${c.titulo}, posição ${i + 1} de ${componentes.length}, largura ${c.posicao.largura} de 4`}
              onDragStart={(e) => {
                setArrastando(c.id);
                e.dataTransfer.effectAllowed = "move";
                // Firefox só inicia o arrasto com algum dado definido.
                e.dataTransfer.setData("text/plain", c.id);
              }}
              onDragEnd={() => {
                setArrastando(null);
                setAlvo(null);
              }}
              onDragOver={(e) => aoArrastarSobre(e, c.id)}
              onDragLeave={() => setAlvo((a) => (a === c.id ? null : a))}
              onDrop={(e) => {
                e.preventDefault();
                soltarEm(c.id);
              }}
              onKeyDown={(e) => aoTeclar(e, c)}
              className={`card painel-cartao p-5 max-md:p-4 cursor-grab active:cursor-grabbing transition-[opacity,box-shadow] focus-visible:outline-[3px] focus-visible:outline-accent-soft ${LARGURA_CLASSE[c.posicao.largura]} ${c.tipo === "tabela" ? "painel-tabela" : ""} ${saindo ? "opacity-40" : ""} ${ehAlvo ? "ring-2 ring-accent" : ""}`}
            >
              {/* Controles em linha própria: no cartão de largura 1 eles disputariam espaço com o
                  título e o cortariam em "Valor da ve...". */}
              <div className="mb-3">
                <h3 className="text-[13px] font-bold text-muted leading-snug mb-2 flex items-center gap-1.5" title={c.titulo}>
                  <span className="text-line shrink-0"><Icone d={ARRASTAR} /></span>
                  <span className="truncate">{c.titulo}</span>
                </h3>
                <div className="flex items-center gap-1 no-print">
                  <button type="button" className={BOTAO} title="Mover para trás" aria-label={`Mover "${c.titulo}" para trás`} disabled={i === 0} onClick={() => aplicar(mover(componentes, c.id, i - 1))}>
                    <Icone d={SETA_ESQUERDA} />
                  </button>
                  <button type="button" className={BOTAO} title="Mover para frente" aria-label={`Mover "${c.titulo}" para frente`} disabled={i === componentes.length - 1} onClick={() => aplicar(mover(componentes, c.id, i + 1))}>
                    <Icone d={SETA_DIREITA} />
                  </button>
                  <button type="button" className={BOTAO} title="Estreitar" aria-label={`Estreitar "${c.titulo}"`} disabled={!podeRedimensionar(componentes, c.id, c.posicao.largura - 1)} onClick={() => aplicar(redimensionar(componentes, c.id, c.posicao.largura - 1))}>
                    <Icone d={MENOS} />
                  </button>
                  <button type="button" className={BOTAO} title="Alargar" aria-label={`Alargar "${c.titulo}"`} disabled={!podeRedimensionar(componentes, c.id, c.posicao.largura + 1)} onClick={() => aplicar(redimensionar(componentes, c.id, c.posicao.largura + 1))}>
                    <Icone d={MAIS} />
                  </button>
                </div>
              </div>
              {/* `pointer-events-none` no corpo: sem isto, arrastar por cima de um gráfico ou de uma
                  tabela seleciona o conteúdo em vez de mover o cartão. */}
              <div className="painel-corpo pointer-events-none select-none">
                <Corpo componente={c} modo="tela" />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

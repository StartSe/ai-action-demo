"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

export type NomeIcone = "mais" | "editar" | "apagar" | "copiar" | "pausar" | "iniciar" | "encerrar" | "grafico" | "pessoa" | "adicionar" | "externo" | "check" | "aviso" | "fechar";
const caminhos: Record<NomeIcone, string> = {
  externo: "M14 3h7v7M21 3 10 14M10 3H3v18h18v-7",
  check: "m5 12 4 4L19 6",
  aviso: "m12 3 10 18H2L12 3ZM12 9v5M12 17h.01",
  fechar: "m6 6 12 12M6 18 18 6",
  mais: "M5 12h.01M12 12h.01M19 12h.01",
  editar: "m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5",
  apagar: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  copiar: "M9 9h12v12H9zM5 15H3V3h12v2",
  pausar: "M8 4v16M16 4v16",
  iniciar: "m7 4 14 8-14 8V4Z",
  encerrar: "M5 5h14v14H5z",
  grafico: "M4 20h17M7 16v-5M12 16V4M17 16V8",
  pessoa: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 11h5M19.5 8.5v5",
  adicionar: "M12 5v14M5 12h14",
};
export function Icone({ nome }: { nome: NomeIcone }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={nome === "mais" ? 4 : 1.7} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d={caminhos[nome]} /></svg>;
}

type Acao = { rotulo: string; icone: NomeIcone; href?: string; onClick?: () => void; perigo?: boolean; disabled?: boolean };

/** Popover na camada superior: não é cortado pelas listas e fecha com Esc ou clique fora. */
export function MenuAcoes({ rotulo, itens, disabled = false }: { rotulo: string; itens: Acao[]; disabled?: boolean }) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<CSSProperties>({});

  useEffect(() => {
    if (!aberto) return;
    const fecharAoMover = () => menu.current?.hidePopover();
    window.addEventListener("resize", fecharAoMover);
    window.addEventListener("scroll", fecharAoMover);
    return () => { window.removeEventListener("resize", fecharAoMover); window.removeEventListener("scroll", fecharAoMover); };
  }, [aberto]);

  function posicionar() {
    const alvo = botao.current?.getBoundingClientRect();
    if (!alvo) return;
    const altura = Math.min(itens.length * 44 + 16, window.innerHeight - 24);
    setPosicao({ left: Math.max(12, Math.min(alvo.right - 232, window.innerWidth - 244)), top: alvo.bottom + altura + 8 <= window.innerHeight ? alvo.bottom + 6 : Math.max(12, alvo.top - altura - 6) });
  }
  function fechar() { menu.current?.hidePopover(); botao.current?.focus(); }

  return <>
    <button ref={botao} type="button" className="action-trigger" aria-label={rotulo} title={rotulo} aria-haspopup="menu" aria-expanded={aberto} aria-controls={id} popoverTarget={id} disabled={disabled} onClick={posicionar} onKeyDown={e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); posicionar(); menu.current?.showPopover(); }
    }}><Icone nome="mais" /></button>
    <div ref={menu} id={id} popover="auto" role="menu" aria-label={rotulo} className="action-popover" style={posicao} onToggle={e => {
      const abriu = e.newState === "open";
      setAberto(abriu);
      if (abriu) menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    }} onKeyDown={e => {
      const opcoes = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
      const atual = opcoes.indexOf(document.activeElement as HTMLElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const indice = e.key === "Home" ? 0 : e.key === "End" ? opcoes.length - 1 : (atual + (e.key === "ArrowDown" ? 1 : -1) + opcoes.length) % opcoes.length;
        opcoes[indice]?.focus();
      }
      if (e.key === "Tab") menu.current?.hidePopover();
    }}>
      {itens.map(item => {
        const classe = `action-item ${item.perigo ? "text-danger" : "text-ink"}`;
        const conteudo = <><Icone nome={item.icone} />{item.rotulo}</>;
        return item.href && !item.disabled
          ? <Link key={item.rotulo} role="menuitem" tabIndex={-1} className={classe} href={item.href} onClick={fechar}>{conteudo}</Link>
          : <button key={item.rotulo} role="menuitem" tabIndex={-1} type="button" className={classe} disabled={item.disabled} onClick={() => { fechar(); item.onClick?.(); }}>{conteudo}</button>;
      })}
    </div>
  </>;
}

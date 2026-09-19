"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function Ampliar({ rotulo, titulo, children, miniatura }: { rotulo: string; titulo: string; children: ReactNode; miniatura?: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  function fechar() {
    setAberto(false);
    requestAnimationFrame(() => botao.current?.focus());
  }
  return <>
    <button ref={botao} type="button" className={miniatura ? "ampliar-miniatura" : "btn-ghost"} aria-label={rotulo} onClick={() => setAberto(true)}>{miniatura || rotulo}</button>
    {aberto && <Dialogo titulo={titulo} fechar={fechar}>{children}</Dialogo>}
  </>;
}

function Dialogo({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialogo = ref.current!;
    const anterior = document.body.style.overflow;
    dialogo.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialogo.close(); document.body.style.overflow = anterior; };
  }, []);
  return <dialog ref={ref} className="clone-dialogo" aria-labelledby={id} onCancel={fechar} onClick={(e) => { if (e.target === e.currentTarget) fechar(); }}>
    <div className="clone-dialogo-conteudo">
      <header className="flex items-center justify-between gap-3 p-3 border-b border-line bg-surface">
        <h2 id={id} className="font-bold text-sm min-w-0 truncate">{titulo}</h2>
        <button type="button" className="btn-ghost shrink-0" onClick={fechar} autoFocus>Fechar</button>
      </header>
      <div className="clone-dialogo-corpo">{children}</div>
    </div>
  </dialog>;
}

export function AmpliarImagem({ src }: { src: string }) {
  return <Ampliar rotulo="Ampliar a captura de referência" titulo="Captura de referência" miniatura={<span className="block w-[88px] h-[58px] rounded-lg bg-white bg-top bg-cover" style={{ backgroundImage: `url("${src}")` }} />}>
    {/* Capturas são dados locais ou recebidos do serviço; não passam pelo otimizador. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt="Captura da página de referência" className="block max-w-full h-auto mx-auto" />
  </Ampliar>;
}

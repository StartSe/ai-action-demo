"use client";
// Diálogo do painel: gera o link público de autoavaliação (app/f/[código]) para o colaborador
// preencher sozinho. Os objetivos da empresa vêm daqui (não são pedidos ao colaborador).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CopyButton, lerErro } from "./ui";

type Props = { onFechar: () => void; objetivosIniciais: string };

type Fase = "form" | "gerando" | "pronto" | "erro";

/** Só é montado enquanto o diálogo está aberto (ver app/page.tsx); assim o estado nasce limpo a cada abertura, sem precisar de um efeito de reset. */
export function DialogoAutoavaliacao({ onFechar, objetivosIniciais }: Props) {
  const [objetivos, setObjetivos] = useState(objetivosIniciais);
  const [expiraEmDias, setExpiraEmDias] = useState(30);
  const [fase, setFase] = useState<Fase>("form");
  const [link, setLink] = useState("");
  const [mensagemErro, setMensagemErro] = useState("");
  const caixaRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = caixaRef.current;
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialogo?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialogo?.close();
      document.body.style.overflow = overflow;
      anterior?.focus();
    };
  }, []);

  useEffect(() => {
    if (fase === "pronto") caixaRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [fase]);

  async function gerar(e: FormEvent) {
    e.preventDefault();
    setFase("gerando");
    try {
      const r = await fetch("/api/pdi/autoavaliacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objetivos, expiraEmDias }),
      });
      if (!r.ok) {
        setMensagemErro((await lerErro(r)).mensagem);
        setFase("erro");
        return;
      }
      const resposta = await r.json();
      setLink(`${location.origin}/f/${resposta.codigo}`);
      setFase("pronto");
    } catch (err) {
      setMensagemErro((await lerErro(err)).mensagem);
      setFase("erro");
    }
  }

  return (
    <dialog ref={caixaRef} aria-labelledby="titulo-autoavaliacao" onCancel={(e) => { e.preventDefault(); onFechar(); }} className="card m-auto w-[calc(100%-32px)] max-w-[480px] max-h-[calc(100dvh-32px)] overflow-y-auto p-7 max-md:p-5 backdrop:bg-black/40">
        <h2 id="titulo-autoavaliacao" className="text-xl font-extrabold mb-1.5">Pedir autoavaliação por link</h2>
        <p className="text-muted text-sm mb-5">A pessoa preenche nome, cargo, tempo na função, entregas recentes e aspirações; assim que ela responder, o PDI é gerado com os objetivos abaixo.</p>

        {fase === "pronto" ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{link}</code>
              <CopyButton texto={() => link} rotulo="Copiar link" />
            </div>
            <button type="button" className="btn-ghost !w-auto self-start" onClick={onFechar}>Fechar</button>
          </div>
        ) : (
          <form onSubmit={gerar}>
            <div className="flex flex-col gap-1.5 mb-4">
              <label htmlFor="objetivosAutoavaliacao" className="text-[13px] font-semibold">Objetivos da empresa para o período</label>
              <textarea id="objetivosAutoavaliacao" autoFocus disabled={fase === "gerando"} className="input min-h-24 resize-y" required value={objetivos} onChange={(e) => setObjetivos(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 mb-5">
              <label htmlFor="expiraEmDiasAutoavaliacao" className="text-[13px] font-semibold">O link expira em</label>
              <select id="expiraEmDiasAutoavaliacao" disabled={fase === "gerando"} className="input" value={expiraEmDias} onChange={(e) => setExpiraEmDias(Number(e.target.value))}>
                <option value={7}>7 dias</option>
                <option value={30}>30 dias</option>
                <option value={90}>90 dias</option>
              </select>
            </div>
            {fase === "erro" && <p role="alert" className="text-danger text-sm mb-4">{mensagemErro}</p>}
            <div className="flex gap-2.5">
              <button type="submit" className="btn-primary !w-auto flex-1" disabled={fase === "gerando"}>{fase === "gerando" ? "Gerando" : "Gerar link"}</button>
              <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            </div>
          </form>
        )}
    </dialog>
  );
}

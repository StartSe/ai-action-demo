"use client";
// Diálogo do painel (US-012): cria o link público de coleta de respostas a partir do questionário
// em edição, com prazo e limite de respostas configuráveis, e mostra o link pronto para copiar.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CopyButton } from "./ui";
import type { Questionario } from "@/lib/types";

type Props = { onFechar: () => void; aoCriar: () => void; questionario: Questionario; titulo: string; empresa: string };

type Fase = "form" | "gerando" | "pronto" | "erro";

/** Só é montado enquanto o diálogo está aberto (ver app/page.tsx), para o estado nascer limpo a cada abertura. */
export function DialogoLinkAvaliacao({ onFechar, aoCriar, questionario, titulo, empresa }: Props) {
  const [expiraEmDias, setExpiraEmDias] = useState("30");
  const [limite, setLimite] = useState("50");
  const [fase, setFase] = useState<Fase>("form");
  const [link, setLink] = useState("");
  const [mensagemErro, setMensagemErro] = useState("");
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    function onClickFora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) onFechar();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickFora);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickFora);
    };
  }, [onFechar]);

  async function gerar(e: FormEvent) {
    e.preventDefault();
    setFase("gerando");
    try {
      const corpo = { questionario, titulo, empresa, expiraEmDias: Number(expiraEmDias), limite: limite === "sem-limite" ? null : Number(limite) };
      const r = await fetch("/api/bussola/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível criar o link.");
      setLink(`${location.origin}/f/${resposta.codigo}`);
      setFase("pronto");
      aoCriar();
    } catch (err) {
      setMensagemErro(err instanceof Error ? err.message : "Erro inesperado.");
      setFase("erro");
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4" role="presentation">
      <div ref={caixaRef} role="dialog" aria-modal="true" aria-labelledby="titulo-link-avaliacao" className="card w-full max-w-[480px] p-7 max-md:p-5">
        <h2 id="titulo-link-avaliacao" className="text-xl font-extrabold mb-1.5">Criar link de avaliação</h2>
        <p className="text-muted text-sm mb-5">Qualquer pessoa que abrir o link responde ao questionário sem precisar de login; as respostas chegam direto para você.</p>

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
              <label htmlFor="expiraEmDiasLinkAvaliacao" className="text-[13px] font-semibold">O link expira em</label>
              <select id="expiraEmDiasLinkAvaliacao" className="input" value={expiraEmDias} onChange={(e) => setExpiraEmDias(e.target.value)}>
                <option value="7">7 dias</option>
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5 mb-5">
              <label htmlFor="limiteLinkAvaliacao" className="text-[13px] font-semibold">Limite de respostas</label>
              <select id="limiteLinkAvaliacao" className="input" value={limite} onChange={(e) => setLimite(e.target.value)}>
                <option value="10">10 respostas</option>
                <option value="50">50 respostas</option>
                <option value="200">200 respostas</option>
                <option value="sem-limite">Sem limite</option>
              </select>
            </div>
            {fase === "erro" && <p className="text-danger text-sm mb-4">{mensagemErro}</p>}
            <div className="flex gap-2.5">
              <button type="submit" className="btn-primary !w-auto flex-1" disabled={fase === "gerando"}>{fase === "gerando" ? "Gerando" : "Gerar link"}</button>
              <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

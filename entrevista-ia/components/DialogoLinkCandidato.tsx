"use client";
// Diálogo do painel: gera o link público (app/entrevista/[código]) para o candidato conversar sozinho
// com a entrevistadora de IA. Reaproveita a vaga já preenchida no formulário principal como ponto de
// partida, mas permite ajustar antes de gerar (o link pode ser para um candidato diferente do exemplo).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CopyButton } from "./ui";
import type { Tom, Vaga } from "@/lib/types";

type Props = { onFechar: () => void; vagaInicial: Vaga };

type Fase = "form" | "gerando" | "pronto" | "erro";

/** Só é montado enquanto o diálogo está aberto (ver app/page.tsx); assim o estado nasce limpo a cada abertura. */
export function DialogoLinkCandidato({ onFechar, vagaInicial }: Props) {
  const [vaga, setVaga] = useState<Vaga>(vagaInicial);
  const [expiraEmDias, setExpiraEmDias] = useState(15);
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

  const set = (campo: "titulo" | "requisitos" | "candidato") => (e: { target: { value: string } }) =>
    setVaga((v) => ({ ...v, [campo]: e.target.value }));

  async function gerar(e: FormEvent) {
    e.preventDefault();
    setFase("gerando");
    try {
      const r = await fetch("/api/entrevista/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaga, expiraEmDias }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível gerar o link.");
      setLink(`${location.origin}/entrevista/${resposta.codigo}`);
      setFase("pronto");
    } catch (err) {
      setMensagemErro(err instanceof Error ? err.message : "Erro inesperado.");
      setFase("erro");
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4" role="presentation">
      <div ref={caixaRef} role="dialog" aria-modal="true" aria-labelledby="titulo-link-candidato" className="card w-full max-w-[480px] p-7 max-md:p-5">
        <h2 id="titulo-link-candidato" className="text-xl font-extrabold mb-1.5">Criar link para candidatos</h2>
        <p className="text-muted text-sm mb-5">O candidato abre o link e conversa sozinho com a entrevistadora, por voz ou texto. O scorecard fica pronto para você assim que ele concluir.</p>

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
              <label htmlFor="tituloLinkCandidato" className="text-[13px] font-semibold">Título da vaga</label>
              <input id="tituloLinkCandidato" className="input" required value={vaga.titulo} onChange={set("titulo")} />
            </div>
            <div className="flex flex-col gap-1.5 mb-4">
              <label htmlFor="requisitosLinkCandidato" className="text-[13px] font-semibold">Principais requisitos</label>
              <textarea id="requisitosLinkCandidato" className="input min-h-24 resize-y" required value={vaga.requisitos} onChange={set("requisitos")} />
            </div>
            <div className="flex flex-col gap-1.5 mb-4">
              <label htmlFor="candidatoLinkCandidato" className="text-[13px] font-semibold">Nome do candidato</label>
              <input id="candidatoLinkCandidato" className="input" required value={vaga.candidato} onChange={set("candidato")} />
            </div>
            <div className="flex flex-col gap-1.5 mb-5">
              <label htmlFor="tomLinkCandidato" className="text-[13px] font-semibold">Tom da entrevista</label>
              <select id="tomLinkCandidato" className="input" value={vaga.tom} onChange={(e) => setVaga((v) => ({ ...v, tom: e.target.value as Tom }))}>
                <option value="acolhedor">Acolhedor</option>
                <option value="objetivo">Objetivo</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5 mb-5">
              <label htmlFor="expiraEmDiasLinkCandidato" className="text-[13px] font-semibold">O link expira em</label>
              <select id="expiraEmDiasLinkCandidato" className="input" value={expiraEmDias} onChange={(e) => setExpiraEmDias(Number(e.target.value))}>
                <option value={7}>7 dias</option>
                <option value={15}>15 dias</option>
                <option value={30}>30 dias</option>
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

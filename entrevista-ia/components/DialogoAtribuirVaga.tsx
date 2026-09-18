"use client";
// "Atribuir a uma vaga", da tela do candidato (US-013): o mesmo passo que a página da vaga oferece do
// outro lado (`DialogoAdicionarCandidato`), visto por quem começou pela pessoa.
//
// Só vagas abertas entram na lista: convidar alguém para uma vaga encerrada é o pedido que a rota
// recusa, e oferecer na tela o que vai ser recusado é desperdiçar o clique de quem está trabalhando.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ErrorBox, lerErro, type ErroLido } from "./ui";

export type VagaParaAtribuir = { id: string; cargo: string; area?: string; local?: string };

export function DialogoAtribuirVaga({
  candidatoId,
  candidatoNome,
  jaEm,
  onFechar,
  onAtribuido,
}: {
  candidatoId: string;
  candidatoNome: string;
  /** Vagas em que ele já tem entrevista viva: aparecem na lista, mas não podem ser escolhidas. */
  jaEm: string[];
  onFechar: () => void;
  onAtribuido: (cargo: string) => void;
}) {
  const [itens, setItens] = useState<VagaParaAtribuir[] | null>(null);
  const [atribuindo, setAtribuindo] = useState("");
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
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

  useEffect(() => {
    fetch("/api/vagas?status=aberta")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setItens(corpo.itens))
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setItens([]);
      });
  }, []);

  async function atribuir(vaga: VagaParaAtribuir) {
    setAtribuindo(vaga.id);
    setErroTela(null);
    try {
      const r = await fetch("/api/entrevistas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vagaId: vaga.id, candidatoId }) });
      if (!r.ok) throw r;
      onAtribuido(vaga.cargo);
    } catch (e) {
      setErroTela(await lerErro(e));
      setAtribuindo("");
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4" role="presentation">
      <div ref={caixaRef} role="dialog" aria-modal="true" aria-labelledby="titulo-atribuir-vaga" className="card w-full max-w-[480px] p-7 max-md:p-5">
        <h2 id="titulo-atribuir-vaga" className="text-xl font-extrabold mb-1.5">Atribuir a uma vaga</h2>
        <p className="text-muted text-sm mb-5">{candidatoNome} vai conversar com a entrevistadora sobre a vaga que você escolher aqui.</p>

        {erroTela && <div className="mb-4"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        <div className="border border-line rounded-card divide-y divide-line max-h-[280px] overflow-y-auto mb-5">
          {itens === null ? (
            <p className="text-muted text-sm px-3.5 py-4">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="text-muted text-sm px-3.5 py-4">Nenhuma vaga aberta no momento.</p>
          ) : (
            itens.map((v) => {
              const jaEsta = jaEm.includes(v.id);
              return (
                <div key={v.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{v.cargo}</p>
                    <p className="text-muted text-[12.5px]">{[v.area, v.local].filter(Boolean).join(" · ") || "Sem outros dados"}</p>
                  </div>
                  {jaEsta ? (
                    <span className="text-muted text-[12.5px] shrink-0">Já está nesta vaga</span>
                  ) : (
                    <button type="button" className="btn-ghost !w-auto shrink-0" disabled={Boolean(atribuindo)} onClick={() => void atribuir(v)}>
                      {atribuindo === v.id ? "Atribuindo" : "Atribuir"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/vagas/nova" className="btn-link text-[13px]">Abrir uma vaga nova</Link>
          <button type="button" className="btn-ghost !w-auto" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

"use client";
// "Adicionar candidato" da página da vaga (US-007): escolhe alguém que já está cadastrado ou leva ao
// cadastro novo, já com a vaga no endereço.
//
// A busca é por nome e acontece no servidor (`GET /api/candidatos?busca=`), não em memória: a lista
// de candidatos cresce com o tempo e filtrar no navegador exigiria baixá-la inteira toda vez.
import Link from "next/link";
import { useDialogo } from "./useDialogo";
import { useEffect, useRef, useState } from "react";
import { ErrorBox, lerErro, type ErroLido } from "./ui";

export type CandidatoDaBusca = {
  id: string;
  nome: string;
  cidade?: string;
  temCvTexto: boolean;
};

export function DialogoAdicionarCandidato({
  vagaId,
  cargo,
  jaNaVaga,
  onFechar,
  onAtribuido,
}: {
  vagaId: string;
  cargo: string;
  /** Quem já tem entrevista viva nesta vaga: aparece na lista, mas não pode ser escolhido de novo. */
  jaNaVaga: string[];
  onFechar: () => void;
  /** O candidato entrou na vaga: o convite já existe e a tela de trás abre o diálogo dele. */
  onAtribuido: (atribuicao: { candidatoNome: string; entrevistaId: string }) => void;
}) {
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<CandidatoDaBusca[] | null>(null);
  const [atribuindo, setAtribuindo] = useState("");
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  useDialogo(caixaRef, onFechar);



  // Uma busca por digitação, com meio segundo de espera: quem digita "Bruno" não precisa de cinco
  // consultas para ver um nome.
  useEffect(() => {
    const termo = busca.trim();
    let ativo = true;
    const tempo = setTimeout(() => {
      fetch(`/api/candidatos?busca=${encodeURIComponent(termo)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((corpo) => { if (ativo) { setItens(corpo.itens); setErroTela(null); } })
        .catch(async (e) => {
          const erro = await lerErro(e);
          if (ativo) { setErroTela(erro); setItens([]); }
        });
    }, termo ? 400 : 0);
    return () => { ativo = false; clearTimeout(tempo); };
  }, [busca]);

  async function atribuir(candidato: CandidatoDaBusca) {
    setAtribuindo(candidato.id);
    setErroTela(null);
    try {
      const r = await fetch("/api/entrevistas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vagaId, candidatoId: candidato.id }),
      });
      if (!r.ok) throw r;
      const { entrevista } = await r.json();
      onAtribuido({ candidatoNome: candidato.nome, entrevistaId: entrevista.id });
    } catch (e) {
      setErroTela(await lerErro(e));
      setAtribuindo("");
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4" role="presentation">
      <div ref={caixaRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="titulo-adicionar-candidato" className="card w-full max-w-[480px] p-7 max-md:p-5 max-h-[calc(100dvh-3rem)] overflow-y-auto">
        <h2 id="titulo-adicionar-candidato" className="text-xl font-extrabold mb-1.5">Para quem é a entrevista?</h2>
        <p className="text-muted text-sm mb-5">Selecione ou cadastre um candidato para gerar o link da entrevista de {cargo}.</p>

        <div className="flex flex-col gap-1.5 mb-4">
          <label htmlFor="busca-candidato" className="text-[13px] font-semibold">Procurar pelo nome</label>
          <input
            id="busca-candidato"
            className="input"
            autoFocus
            placeholder="Comece a digitar o nome"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setItens(null); }}
          />
        </div>

        {erroTela && <div className="mb-4"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        <div className="border border-line rounded-card divide-y divide-line max-h-[280px] overflow-y-auto mb-5">
          {itens === null ? (
            <p className="text-muted text-sm px-3.5 py-4">Procurando...</p>
          ) : itens.length === 0 ? (
            <p className="text-muted text-sm px-3.5 py-4">
              {busca.trim() ? "Ninguém com esse nome ainda." : "Nenhum candidato cadastrado ainda."}
            </p>
          ) : (
            itens.map((c) => {
              const jaEsta = jaNaVaga.includes(c.id);
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{c.nome}</p>
                    <p className="text-muted text-[12.5px]">{[c.cidade, c.temCvTexto ? "Currículo lido" : ""].filter(Boolean).join(" · ") || "Sem outros dados"}</p>
                  </div>
                  {jaEsta ? (
                    <span className="text-muted text-[12.5px] shrink-0">Já está nesta vaga</span>
                  ) : (
                    <button type="button" className="btn-ghost !w-auto shrink-0" disabled={Boolean(atribuindo)} onClick={() => void atribuir(c)}>
                      {atribuindo === c.id ? "Preparando roteiro..." : "Gerar link"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href={`/candidatos/novo?vaga=${vagaId}`} className="btn-link text-[13px]">Cadastrar um candidato novo</Link>
          <button type="button" className="btn-ghost !w-auto" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

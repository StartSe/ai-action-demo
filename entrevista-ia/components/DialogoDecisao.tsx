"use client";
// "Sua decisão" sobre um candidato (US-015): as três saídas de um parecer lido.
//
// A decisão não muda o estado da entrevista — ela continua avaliada — e pode ser trocada quantas
// vezes for preciso, por isso o diálogo mostra a que já está registrada em vez de esconder o assunto
// depois do primeiro clique. A tela do parecer (US-023) grava pela MESMA rota, para as duas telas não
// escreverem a mesma coisa de dois jeitos.
import { useEffect, useRef, useState } from "react";
import { DECISOES, ROTULO_DECISAO, type Decisao } from "./RotulosEntrevista";
import { ErrorBox, lerErro, type ErroLido } from "./ui";

export function DialogoDecisao({
  entrevistaId,
  candidatoNome,
  vagaCargo,
  decisaoAtual,
  onFechar,
  onDecidido,
}: {
  entrevistaId: string;
  candidatoNome: string;
  vagaCargo: string;
  decisaoAtual?: Decisao;
  onFechar: () => void;
  onDecidido: (decisao: Decisao) => void;
}) {
  const [gravando, setGravando] = useState<Decisao | "">("");
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

  async function decidir(decisao: Decisao) {
    setGravando(decisao);
    setErroTela(null);
    try {
      const r = await fetch(`/api/entrevistas/${entrevistaId}/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao }),
      });
      if (!r.ok) throw r;
      onDecidido(decisao);
    } catch (e) {
      setErroTela(await lerErro(e));
      setGravando("");
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4" role="presentation">
      <div ref={caixaRef} role="dialog" aria-modal="true" aria-labelledby="titulo-decisao" className="card w-full max-w-[460px] p-7 max-md:p-5">
        <h2 id="titulo-decisao" className="text-xl font-extrabold mb-1.5">Sua decisão</h2>
        <p className="text-muted text-sm mb-5">
          {candidatoNome} · {vagaCargo}
          {decisaoAtual && <span className="block mt-1">Hoje está como &quot;{ROTULO_DECISAO[decisaoAtual]}&quot;; escolher outra troca o registro.</span>}
        </p>

        {erroTela && <div className="mb-4"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        <div className="flex flex-col gap-2 mb-5">
          {DECISOES.map((d) => (
            <button
              key={d.valor}
              type="button"
              className={`text-left border rounded-card px-4 py-3 ${d.valor === decisaoAtual ? "border-accent" : "border-line"} disabled:opacity-60`}
              disabled={Boolean(gravando)}
              onClick={() => void decidir(d.valor)}
            >
              <span className="font-bold">{d.rotulo}</span>
              <span className="block text-muted text-[12.5px]">{gravando === d.valor ? "Gravando..." : d.apoio}</span>
            </button>
          ))}
        </div>

        <button type="button" className="btn-ghost" onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

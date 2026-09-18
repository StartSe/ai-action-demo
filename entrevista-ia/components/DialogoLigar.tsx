"use client";
// "Ligar para o candidato agora" (US-020): a entrevistadora disca para quem ainda não respondeu ao
// convite, em vez de esperar o link ser aberto.
//
// A conversa é a MESMA do link — mesmo agente, mesmo roteiro daquela vaga — e a transcrição volta
// pelo aviso de pós-conversa, como a do navegador. Por isso o diálogo manda só a entrevista e o
// telefone: quem monta o que o agente vai saber é o servidor.
//
// Só é montado enquanto está aberto, então o estado nasce limpo a cada abertura.
import { useEffect, useRef, useState } from "react";
import { Aviso, ErrorBox, lerErro, type ErroLido } from "./ui";

export function DialogoLigar({
  entrevistaId,
  candidatoId,
  candidatoNome,
  vagaCargo,
  onFechar,
  onLigou,
}: {
  entrevistaId: string;
  candidatoId: string;
  candidatoNome: string;
  vagaCargo: string;
  onFechar: () => void;
  /** A entrevista mudou de mão: a tela de trás relê a linha. */
  onLigou?: () => void;
}) {
  const [telefone, setTelefone] = useState("");
  const [ligando, setLigando] = useState(false);
  const [recado, setRecado] = useState("");
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  const aoLigar = useRef(onLigou);
  useEffect(() => {
    aoLigar.current = onLigou;
  }, [onLigou]);

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

  // O telefone do cadastro vem preenchido, e continua editável: quem está ligando pode ter acabado de
  // receber um número novo, e mandá-lo editar a ficha antes seria um desvio no meio da ação. A leitura
  // só escreve no campo VAZIO: ela chega depois da tela, e quem já começou a digitar um número novo
  // não pode vê-lo ser trocado pelo do cadastro no meio da digitação.
  useEffect(() => {
    fetch(`/api/candidatos/${candidatoId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setTelefone((atual) => atual || corpo.candidato?.telefone || ""))
      .catch(() => {});
  }, [candidatoId]);

  async function ligar() {
    const numero = telefone.trim();
    setRecado("");
    if (!numero) {
      setErroTela({ mensagem: "Informe o telefone do candidato, com o código do país." });
      return;
    }
    setLigando(true);
    setErroTela(null);
    try {
      const r = await fetch("/api/ligar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrevistaId, telefone: numero }),
      });
      if (!r.ok) throw r;
      setRecado(`A entrevistadora está ligando para ${candidatoNome} em instantes. Quando a conversa terminar, ela aparece aqui sozinha.`);
      aoLigar.current?.();
    } catch (e) {
      setErroTela(await lerErro(e));
    } finally {
      setLigando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4 py-6 overflow-y-auto" role="presentation">
      <div ref={caixaRef} role="dialog" aria-modal="true" aria-labelledby="titulo-ligar" className="card w-full max-w-[480px] p-7 max-md:p-5">
        <h2 id="titulo-ligar" className="text-xl font-extrabold mb-1.5">Ligar para {candidatoNome}</h2>
        <p className="text-muted text-sm mb-5">
          A entrevistadora liga agora e conversa sobre a vaga de {vagaCargo}, com as mesmas perguntas do link. Avise o candidato
          antes: uma ligação que ninguém espera costuma não ser atendida.
        </p>

        {erroTela && <div className="mb-4"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        <div className="flex flex-col gap-1.5 mb-4">
          <label htmlFor="ligar-telefone" className="text-[13px] font-semibold">Telefone do candidato</label>
          <input
            id="ligar-telefone"
            className="input"
            placeholder="+55 11 99999-0000"
            value={telefone}
            disabled={ligando}
            onChange={(e) => setTelefone(e.target.value)}
          />
          <span className="text-[12.5px] text-muted">Com o código do país, como no exemplo.</span>
        </div>

        {recado && <div className="mb-4"><Aviso tom="ok">{recado}</Aviso></div>}

        <div className="flex items-center gap-2.5 flex-wrap">
          <button type="button" className="btn-primary !w-auto" disabled={ligando} onClick={() => void ligar()}>
            {ligando ? "Ligando..." : "Ligar agora"}
          </button>
          <button type="button" className="btn-ghost !w-auto" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

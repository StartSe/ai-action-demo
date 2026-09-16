"use client";
// Diálogo de aprovação do envio pelo Prospect Halo (US-027): mostra o plano (quantos leads, as três
// mensagens e o aviso) e só cria a campanha remota depois de "Confirmar". Montado só enquanto
// aberto (ver app/page.tsx), para o estado nascer limpo a cada abertura.
import { useEffect, useRef, useState } from "react";
import { lerErro } from "@/components/ui";
import type { PlanoEnvio } from "@/lib/envio";
import type { Campanha } from "@/lib/types";

type Props = { campanhaId: string; onFechar: () => void; aoEnviar: (campanha: Campanha, mensagem: string) => void };

type Acao = { rotulo: string; url: string };
type Fase = { nome: "carregando" } | { nome: "plano"; plano: PlanoEnvio } | { nome: "enviando"; plano: PlanoEnvio } | { nome: "erro"; mensagem: string; acao?: Acao; plano?: PlanoEnvio };

export function DialogoEnvio({ campanhaId, onFechar, aoEnviar }: Props) {
  const [fase, setFase] = useState<Fase>({ nome: "carregando" });
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ativo = true;
    fetch("/api/envio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanhaId, confirmar: false }) })
      .then(async (r) => {
        if (!r.ok) {
          const info = await lerErro(r);
          if (ativo) setFase({ nome: "erro", mensagem: info.mensagem, acao: info.acao });
          return;
        }
        const resposta = await r.json();
        if (ativo) setFase({ nome: "plano", plano: resposta.plano });
      })
      .catch(async (e) => { if (ativo) setFase({ nome: "erro", mensagem: (await lerErro(e)).mensagem }); });
    return () => { ativo = false; };
  }, [campanhaId]);

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

  async function confirmar(plano: PlanoEnvio) {
    setFase({ nome: "enviando", plano });
    try {
      const r = await fetch("/api/envio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanhaId, confirmar: true }) });
      if (!r.ok) {
        const info = await lerErro(r);
        setFase({ nome: "erro", mensagem: info.mensagem, acao: info.acao, plano });
        return;
      }
      const resposta = await r.json();
      aoEnviar(resposta.campanha, resposta.mensagem);
    } catch (e) {
      setFase({ nome: "erro", mensagem: (await lerErro(e)).mensagem, plano });
    }
  }

  const plano = "plano" in fase ? fase.plano : undefined;
  const enviando = fase.nome === "enviando";

  return (
    <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4 overflow-y-auto py-6" role="presentation">
      <div ref={caixaRef} role="dialog" aria-modal="true" aria-labelledby="titulo-envio" className="card w-full max-w-[560px] p-7 max-md:p-5 my-auto">
        <h2 id="titulo-envio" className="text-xl font-extrabold mb-1.5">Aprovar e enviar pelo Prospect Halo</h2>
        <p className="text-muted text-sm mb-5">Revise o que vai ser enviado. Nada sai antes de você confirmar.</p>

        {fase.nome === "carregando" && <p className="text-muted text-sm">Montando o plano de envio...</p>}

        {plano && (
          <>
            <p className="text-sm mb-4">
              <strong className="text-2xl font-extrabold block leading-tight">{plano.quantidade} {plano.quantidade === 1 ? "lead" : "leads"}</strong>
              <span className="text-muted">recebem a sequência de mensagens: {plano.leads.slice(0, 3).map((l) => l.nome).join(", ")}{plano.leads.length > 3 ? ` e mais ${plano.leads.length - 3}` : ""}.</span>
            </p>
            <div className="border border-line rounded-lg px-4 py-3 mb-4 max-h-[40vh] overflow-y-auto">
              <p className="text-[12.5px] text-muted mb-2">Mensagens de {plano.mensagens.lead} (cada lead recebe a própria versão):</p>
              <MensagemPlano rotulo="Pedido de conexão" texto={plano.mensagens.conexao} />
              <MensagemPlano rotulo="Acompanhamento 1" texto={plano.mensagens.acompanhamento1} />
              <MensagemPlano rotulo="Acompanhamento 2" texto={plano.mensagens.acompanhamento2} />
            </div>
            <p className="text-sm bg-bg border border-line rounded-lg px-4 py-3 mb-5" role="note">{plano.aviso}</p>
          </>
        )}

        {fase.nome === "erro" && (
          <p className="text-danger text-sm mb-4" role="alert">
            {fase.mensagem}
            {fase.acao && <> <a className="btn-link text-[13px]" href={fase.acao.url}>{fase.acao.rotulo}</a></>}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {plano && (
            <button type="button" className="btn-primary !w-auto" disabled={enviando} onClick={() => confirmar(plano)}>
              {enviando ? "Enviando" : "Confirmar"}
            </button>
          )}
          <button type="button" className="btn-ghost" disabled={enviando} onClick={onFechar}>{plano ? "Cancelar" : "Fechar"}</button>
        </div>
      </div>
    </div>
  );
}

function MensagemPlano({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <div className="border-t border-line first-of-type:border-t-0 pt-2.5 mt-2.5 first-of-type:pt-0 first-of-type:mt-0">
      <div className="text-[12.5px] font-bold text-muted mb-0.5">{rotulo}</div>
      <p className="text-sm whitespace-pre-wrap">{texto}</p>
    </div>
  );
}

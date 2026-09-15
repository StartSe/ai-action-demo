"use client";
// Diálogo de confirmação antes de gerar o vídeo pelo Higgsfield (US-030): mostra o efeito (com a lista remota
// para trocar), o formato, o custo estimado em créditos (quando o provedor informa) e o saldo atual, e só
// cria o trabalho depois de "Confirmar e gerar". Montado só enquanto aberto, para o estado nascer limpo.
import { useEffect, useRef, useState } from "react";
import { rotuloFormato, type Conceito, type PlanoVideo, type Video } from "@/lib/types";

type Props = { campanhaId: string; conceito: Conceito; onFechar: () => void; aoIniciar: (video: Video) => void };

type Fase =
  | { nome: "carregando" }
  | { nome: "plano"; plano: PlanoVideo; atualizando: boolean }
  | { nome: "confirmando"; plano: PlanoVideo }
  | { nome: "erro"; mensagem: string; plano?: PlanoVideo };

function creditos(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${n === 1 ? "crédito" : "créditos"}`;
}

export function DialogoGerar({ campanhaId, conceito, onFechar, aoIniciar }: Props) {
  const [fase, setFase] = useState<Fase>({ nome: "carregando" });
  const caixaRef = useRef<HTMLDivElement>(null);

  async function buscarPlano(efeito?: string): Promise<PlanoVideo> {
    const r = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanhaId, conceitoId: conceito.id, efeito, confirmar: false }) });
    const resposta = await r.json();
    if (!r.ok) throw new Error(resposta.error || "Não foi possível montar o plano do vídeo.");
    return resposta.plano as PlanoVideo;
  }

  useEffect(() => {
    let ativo = true;
    fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanhaId, conceitoId: conceito.id, confirmar: false }) })
      .then(async (r) => {
        const resposta = await r.json();
        if (!r.ok) throw new Error(resposta.error || "Não foi possível montar o plano do vídeo.");
        if (ativo) setFase({ nome: "plano", plano: resposta.plano, atualizando: false });
      })
      .catch((e) => { if (ativo) setFase({ nome: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." }); });
    return () => { ativo = false; };
  }, [campanhaId, conceito.id]);

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

  async function trocarEfeito(plano: PlanoVideo, efeitoId: string) {
    const escolhido = plano.efeitos.find((e) => e.id === efeitoId) ?? plano.efeito;
    setFase({ nome: "plano", plano: { ...plano, efeito: escolhido, custoCreditos: null }, atualizando: true });
    try {
      const novo = await buscarPlano(efeitoId);
      setFase({ nome: "plano", plano: novo, atualizando: false });
    } catch (e) {
      setFase({ nome: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", plano: { ...plano, efeito: escolhido } });
    }
  }

  async function confirmar(plano: PlanoVideo) {
    setFase({ nome: "confirmando", plano });
    try {
      const r = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanhaId, conceitoId: conceito.id, efeito: plano.efeito.id, confirmar: true }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível pedir o vídeo.");
      aoIniciar(resposta.video as Video);
    } catch (e) {
      setFase({ nome: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", plano });
    }
  }

  const plano = "plano" in fase ? fase.plano : undefined;
  const ocupado = fase.nome === "confirmando" || (fase.nome === "plano" && fase.atualizando);
  const saldoBaixo = Boolean(plano && plano.saldo && plano.custoCreditos !== null && plano.saldo.creditos < plano.custoCreditos);

  return (
    <div className="fixed inset-0 z-30 bg-black/40 grid place-items-center px-4 overflow-y-auto py-6" role="presentation">
      <div ref={caixaRef} role="dialog" aria-modal="true" aria-labelledby="titulo-gerar" className="card w-full max-w-[560px] p-7 max-md:p-5 my-auto">
        <h2 id="titulo-gerar" className="text-xl font-extrabold mb-1.5">Gerar este vídeo pelo Higgsfield</h2>
        <p className="text-muted text-sm mb-5">Confira o que vai ser gerado e quanto custa. Nenhum crédito é gasto antes de você confirmar.</p>

        {fase.nome === "carregando" && <p className="text-muted text-sm" aria-live="polite">Consultando o Higgsfield: efeitos, custo e saldo...</p>}

        {plano && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm mb-4">
            <dt className="font-bold text-muted">Conceito</dt>
            <dd>{plano.conceitoTitulo}</dd>

            <dt className="font-bold text-muted self-center"><label htmlFor="efeito-video">Efeito</label></dt>
            <dd>
              <select id="efeito-video" className="input" value={plano.efeito.id} disabled={ocupado} onChange={(e) => trocarEfeito(plano, e.target.value)}>
                {plano.efeitos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              {plano.efeito.descricao && <p className="text-muted text-[12.5px] mt-1.5">{plano.efeito.descricao}</p>}
              <p className="text-muted text-[12.5px] mt-1">Sugerido pelo conceito: {conceito.efeitoSugerido}.</p>
            </dd>

            <dt className="font-bold text-muted">Formato</dt>
            <dd>{rotuloFormato(plano.formato)} · {plano.duracaoSeg} segundos</dd>

            <dt className="font-bold text-muted">Custo estimado</dt>
            <dd>
              {fase.nome === "plano" && fase.atualizando ? <span className="text-muted">Atualizando...</span> : plano.custoCreditos !== null ? <strong>{creditos(plano.custoCreditos)}</strong> : <span className="text-muted">O Higgsfield não informou o custo antes de gerar.</span>}
            </dd>

            <dt className="font-bold text-muted">Saldo atual</dt>
            <dd>
              {plano.saldo ? <>{creditos(plano.saldo.creditos)}{plano.saldo.plano ? <span className="text-muted"> · plano {plano.saldo.plano}</span> : null}</> : <span className="text-muted">não informado</span>}
              {saldoBaixo && <p className="text-danger text-[12.5px] mt-1" role="alert">O saldo é menor que o custo estimado. O Higgsfield pode recusar o pedido.</p>}
            </dd>
          </dl>
        )}

        {plano && <p className="text-sm bg-bg border border-line rounded-lg px-4 py-3 mb-5" role="note">{plano.aviso}</p>}
        {plano?.emAndamento && <p className="text-sm text-danger mb-4" role="alert">Já existe um vídeo sendo gerado. Espere ele terminar para gerar outro.</p>}
        {fase.nome === "erro" && <p className="text-danger text-sm mb-4" role="alert">{fase.mensagem}</p>}

        <div className="flex flex-wrap items-center gap-2.5">
          {plano && fase.nome !== "erro" && (
            <button type="button" className="btn-primary !w-auto" disabled={ocupado || plano.emAndamento} onClick={() => confirmar(plano)}>
              {fase.nome === "confirmando" ? "Pedindo o vídeo" : "Confirmar e gerar"}
            </button>
          )}
          <button type="button" className="btn-ghost" disabled={fase.nome === "confirmando"} onClick={onFechar}>{plano && fase.nome !== "erro" ? "Cancelar" : "Fechar"}</button>
        </div>
      </div>
    </div>
  );
}

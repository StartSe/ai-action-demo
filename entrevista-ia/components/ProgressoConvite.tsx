"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LIMITE_ACOMPANHAMENTO_CONVITE_MS, ETAPAS_CONVITE, ErroPreparacaoConvite, lerPreparacaoConvite, type EtapaConvite } from "@/lib/progresso-convite";
export type PreparacaoConvite = { etapa?: EtapaConvite; inicio: number; fim?: number; falhou?: boolean };

export function usePrepararConvite() {
  const [progresso, setProgresso] = useState<PreparacaoConvite | null>(null);
  const pedido = useRef<AbortController | null>(null);
  useEffect(() => () => pedido.current?.abort(), []);
  const preparar = useCallback(async <T,>(url: string, corpo: unknown): Promise<T> => {
    pedido.current?.abort();
    const controller = new AbortController();
    pedido.current = controller;
    setProgresso({ inicio: Date.now() });
    const limite = setTimeout(() => controller.abort(new ErroPreparacaoConvite("A confirmação demorou mais que o esperado. Tente novamente para recuperar ou concluir o convite, sem repetir o cadastro.")), LIMITE_ACOMPANHAMENTO_CONVITE_MS);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify(corpo), signal: controller.signal });
      const dados = await lerPreparacaoConvite<T>(res, etapa => setProgresso(p => p && ({ ...p, etapa })));
      if (controller.signal.aborted) throw controller.signal.reason;
      setProgresso(p => p && ({ ...p, fim: Date.now() }));
      return dados;
    } catch (err) {
      if (pedido.current === controller) setProgresso(p => p && ({ ...p, fim: Date.now(), falhou: true }));
      const motivo = controller.signal.aborted ? controller.signal.reason : err;
      throw motivo instanceof ErroPreparacaoConvite ? Response.json({ error: motivo.message, codigo: motivo.codigo, acao: motivo.acao }, { status: 503 }) : motivo;
    } finally { clearTimeout(limite); }
  }, []);
  return { progresso, preparar };
}

export function ProgressoConvite({ estado }: { estado: PreparacaoConvite | null }) {
  const [agora, setAgora] = useState(0);
  const inicio = estado?.inicio;
  const fim = estado?.fim;
  useEffect(() => {
    if (!inicio || fim) return;
    const timer = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [inicio, fim]); // a contagem não controla as etapas
  if (!estado) return null;
  const indice = ETAPAS_CONVITE.findIndex(e => e.id === estado.etapa);
  const segundos = Math.max(0, Math.floor(((estado.fim || agora) - estado.inicio) / 1000));
  const concluido = Boolean(estado.fim && !estado.falhou);
  const titulo = estado.falhou ? "Não foi possível concluir o convite" : concluido ? "Convite pronto para compartilhar" : ETAPAS_CONVITE[indice]?.titulo || "Enviando a solicitação";
  return <div className="rounded-xl border border-accent/25 bg-accent-soft p-4 mb-4" aria-busy={!estado.fim}>
    <div className="flex gap-3 items-start">
      <span aria-hidden="true" className={`mt-1 h-4 w-4 shrink-0 rounded-full ${estado.fim ? "bg-accent" : "border-2 border-accent border-t-transparent motion-safe:animate-spin"}`} />
      <div className="min-w-0 flex-1">
        <p role="status" className="font-semibold text-sm">{titulo}</p>
        <p className="text-sm text-muted mt-1">{estado.falhou ? "O cadastro foi mantido. Você pode tentar gerar o link novamente." : concluido ? "O roteiro e o link foram salvos." : ETAPAS_CONVITE[indice]?.detalhe || "Aguardando a resposta do servidor."}</p>
        <p className="text-xs text-muted mt-2">{segundos} s decorridos{!estado.fim && segundos >= 20 ? " · Ainda aguardando confirmação. Não é necessário clicar novamente." : ""}</p>
      </div>
    </div>
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-semibold">Ver todas as etapas</summary>
      <ol className="mt-2 space-y-1">
        {ETAPAS_CONVITE.map((e, i) => <li key={e.id} className="flex justify-between gap-3"><span>{e.titulo}</span><span className="text-muted shrink-0">{concluido || i < indice ? "Concluída" : i === indice ? estado.falhou ? "Interrompida" : "Em andamento" : "Aguardando"}</span></li>)}
      </ol>
    </details>
  </div>;
}

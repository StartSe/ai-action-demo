"use client";
// Botão "Lembrar dos check-ins": agenda os 3 lembretes de 30/60/90 dias de um PDI salvo
// (app/api/pdi/checkins, lib/checkins.ts). Mesmo padrão de estados de components/AcessoMCP.tsx.
import { useEffect, useState } from "react";
import { data } from "@/lib/formato";

type ItemCheckin = { id: string; marco: 30 | 60 | 90; dataUnica: string; executado: boolean };

export function LembrarCheckins({ resultadoId }: { resultadoId: string }) {
  const [itens, setItens] = useState<ItemCheckin[] | null>(null);
  const [notificacoesConfiguradas, setNotificacoesConfiguradas] = useState<boolean | null>(null);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  const [motivoErro, setMotivoErro] = useState("");

  useEffect(() => {
    fetch(`/api/pdi/checkins?resultadoId=${resultadoId}`)
      .then((r) => r.json())
      .then((d) => setItens(d.itens))
      .catch(() => setItens([]));
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setNotificacoesConfiguradas(Boolean(d.integrations?.notificacoes)))
      .catch(() => setNotificacoesConfiguradas(false));
  }, [resultadoId]);

  async function criar() {
    setErro("");
    setMotivoErro("");
    setCriando(true);
    try {
      const r = await fetch("/api/pdi/checkins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resultadoId }) });
      const d = await r.json();
      if (!r.ok) {
        setMotivoErro(d.motivo || "");
        throw new Error(d.error || "Não foi possível agendar os check-ins.");
      }
      setItens(d.itens);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setCriando(false);
    }
  }

  if (itens === null || notificacoesConfiguradas === null) return null;

  if (itens.length > 0) {
    // new Date(`${aaaa-mm-dd}T00:00:00`) fixa meia-noite local antes de formatar: passar a string
    // direto para data() a interpretaria como UTC e poderia exibir o dia anterior.
    return (
      <p className="text-[13px] text-muted mt-3">
        Check-ins agendados: {itens.map((i) => `${i.marco} dias (${data(new Date(`${i.dataUnica}T00:00:00`), { comAno: true })})`).join(" · ")}.
      </p>
    );
  }

  if (!notificacoesConfiguradas) {
    return (
      <div className="mt-3">
        <a href="/setup#notificacoes" className="btn-ghost">Lembrar dos check-ins (precisa de e-mail ou Slack configurado)</a>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button type="button" className="btn-ghost" onClick={criar} disabled={criando}>
        {criando ? "Agendando" : "Lembrar dos check-ins"}
      </button>
      {erro && (
        <p className="text-danger text-[13px] mt-1.5">
          {erro} {motivoErro === "notificacoes" && <a href="/setup#notificacoes" className="underline">Configurar notificações</a>}
        </p>
      )}
    </div>
  );
}

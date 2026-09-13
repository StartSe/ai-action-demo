"use client";
// Botão "Avisar 30 dias antes": agenda um lembrete por prazo do contrato salvo
// (app/api/analisar/prazos, lib/avisos-prazo.ts). Mesmo padrão de estados de LembrarCheckins (pdi-time).
import { useEffect, useState } from "react";
import { data } from "@/components/ui";
import type { Prazo } from "@/lib/types";

type ItemAviso = { id: string; tipo: string; dataAviso: string; executado: boolean };

export function AvisarPrazos({ resultadoId, prazos }: { resultadoId: string; prazos: Prazo[] }) {
  const [itens, setItens] = useState<ItemAviso[] | null>(null);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  const [motivoErro, setMotivoErro] = useState("");

  useEffect(() => {
    fetch(`/api/analisar/prazos?resultadoId=${resultadoId}`)
      .then((r) => r.json())
      .then((d) => setItens(d.itens))
      .catch(() => setItens([]));
  }, [resultadoId]);

  async function criar() {
    setErro("");
    setMotivoErro("");
    setCriando(true);
    try {
      const r = await fetch("/api/analisar/prazos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resultadoId }) });
      const d = await r.json();
      if (!r.ok) {
        setMotivoErro(d.motivo || "");
        throw new Error(d.error || "Não foi possível agendar os avisos.");
      }
      setItens(d.itens);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setCriando(false);
    }
  }

  if (itens === null || prazos.length === 0) return null;

  if (itens.length > 0) {
    // new Date(`${aaaa-mm-dd}T00:00:00`) fixa meia-noite local antes de formatar (ver gotcha de fuso em pdi-time/CLAUDE.md, US-070).
    return (
      <p className="text-[13px] text-muted mb-3.5">
        Avisos agendados: {itens.map((i) => `${i.tipo} (${data(new Date(`${i.dataAviso}T00:00:00`))})`).join(" · ")}.
      </p>
    );
  }

  return (
    <div className="mb-3.5">
      <button type="button" className="btn-ghost" onClick={criar} disabled={criando}>
        {criando ? "Agendando" : "Avisar 30 dias antes"}
      </button>
      {erro && (
        <p className="text-danger text-[13px] mt-1.5">
          {erro} {motivoErro === "notificacoes" && <a href="/setup#notificacoes" className="underline">Configurar notificações</a>}
        </p>
      )}
    </div>
  );
}

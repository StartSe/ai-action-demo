"use client";
// Bloco "Avisar 30 dias antes": agenda um lembrete por prazo do contrato salvo
// (app/api/analisar/prazos, lib/avisos-prazo.ts), mostra a falha de envio da rotina com o motivo e
// permite cancelar. Mesmo padrão de estados de LembrarCheckins (pdi-time).
import { useEffect, useState } from "react";
import { Aviso, data, lerErro } from "@/components/ui";
import type { Prazo } from "@/lib/types";

type ItemAviso = { id: string; tipo: string; dataAviso: string; executado: boolean; falha: string | null };
type Erro = { mensagem: string; acao?: { rotulo: string; url: string } };

/** O link vai como `href` (atributo), nunca como string solta: ver scripts/verificar-jargao.mjs. */
function LinkNotificacoes() {
  return <a className="btn-link text-[13px]" href="/setup#notificacoes">Configurar notificações</a>;
}

export function AvisarPrazos({ resultadoId, prazos }: { resultadoId: string; prazos: Prazo[] }) {
  const [itens, setItens] = useState<ItemAviso[] | null>(null);
  // Motivo pelo qual um aviso enviado hoje não chegaria: mostrado ANTES do clique, não depois do erro.
  const [motivoCanal, setMotivoCanal] = useState<string | null>(null);
  // Vira true quando a pessoa clicou mesmo com o canal pendente: o aviso de cima sobe de tom.
  const [canalRecusado, setCanalRecusado] = useState(false);
  const [criando, setCriando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [erro, setErro] = useState<Erro | null>(null);

  useEffect(() => {
    fetch(`/api/analisar/prazos?resultadoId=${resultadoId}`)
      .then((r) => r.json())
      .then((d) => { setItens(d.itens); setMotivoCanal(d.motivoCanal ?? null); })
      .catch(() => setItens([]));
  }, [resultadoId]);

  async function criar() {
    setErro(null);
    setCriando(true);
    try {
      const r = await fetch("/api/analisar/prazos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resultadoId }) });
      if (!r.ok) {
        const info = await lerErro(r);
        // O motivo do canal já está na tela desde antes do clique: repetir a mesma frase num segundo
        // aviso só duplica. Atualiza o aviso de cima (o canal pode ter mudado noutra aba) e sai.
        if (info.mensagem === motivoCanal) { setCanalRecusado(true); return; }
        setErro({ mensagem: info.mensagem, acao: info.acao });
        return;
      }
      const d = await r.json();
      setItens(d.itens);
      setMotivoCanal(null);
      setCanalRecusado(false);
    } catch (e) {
      setErro({ mensagem: (await lerErro(e)).mensagem });
    } finally {
      setCriando(false);
    }
  }

  async function cancelar() {
    setErro(null);
    setCancelando(true);
    try {
      const r = await fetch(`/api/analisar/prazos?resultadoId=${resultadoId}`, { method: "DELETE" });
      if (!r.ok) {
        setErro({ mensagem: (await lerErro(r)).mensagem });
        return;
      }
      setItens([]);
    } catch (e) {
      setErro({ mensagem: (await lerErro(e)).mensagem });
    } finally {
      setCancelando(false);
    }
  }

  if (itens === null || prazos.length === 0) return null;

  const falhas = itens.filter((i) => i.falha);

  if (itens.length > 0) {
    // new Date(`${aaaa-mm-dd}T00:00:00`) fixa meia-noite local antes de formatar (ver gotcha de fuso em pdi-time/CLAUDE.md, US-070).
    return (
      <div className="mb-3.5">
        <p className="text-[13px] text-muted">
          Avisos agendados: {itens.map((i) => `${i.tipo} (${data(new Date(`${i.dataAviso}T00:00:00`))})`).join(" · ")}.
        </p>
        {falhas.length > 0 && (
          <div className="mt-2">
            <Aviso tom="danger">
              {falhas.length === 1 ? "Um aviso não foi entregue" : `${falhas.length} avisos não foram entregues`}: {falhas[0].falha}
              <div className="mt-2.5"><LinkNotificacoes /></div>
            </Aviso>
          </div>
        )}
        <button type="button" className="btn-link text-[12.5px] mt-1.5" onClick={cancelar} disabled={cancelando}>
          {cancelando ? "Cancelando" : "Cancelar avisos"}
        </button>
        {erro && <div className="mt-2"><Aviso tom="danger" acao={erro.acao}>{erro.mensagem}</Aviso></div>}
      </div>
    );
  }

  return (
    <div className="mb-3.5">
      {motivoCanal && (
        <div className="mb-2">
          <Aviso tom={canalRecusado ? "danger" : "warn"}>
            {canalRecusado ? "Não dá para agendar ainda: " : ""}{motivoCanal}
            <div className="mt-2.5"><LinkNotificacoes /></div>
          </Aviso>
        </div>
      )}
      <button type="button" className="btn-ghost" onClick={criar} disabled={criando}>
        {criando ? "Agendando" : "Avisar 30 dias antes"}
      </button>
      {erro && <div className="mt-2"><Aviso tom="danger" acao={erro.acao}>{erro.mensagem}</Aviso></div>}
    </div>
  );
}

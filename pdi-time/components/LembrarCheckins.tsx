"use client";
// Bloco "Lembrar dos check-ins" (fim do plano, junto de Acompanhamento): agenda os 3 lembretes de
// 30/60/90 dias de um PDI salvo (app/api/pdi/checkins, lib/checkins.ts) e diz, antes do clique, o que
// vai acontecer: por onde o lembrete chega, ou que as notificações ainda precisam ser configuradas.
import { useEffect, useState } from "react";
import { data } from "@/lib/formato";
import { Aviso, lerErro, type ErroLido } from "./ui";

type ItemCheckin = { id: string; marco: 30 | 60 | 90; dataUnica: string; executado: boolean };
type Notificacoes = { prontas: boolean; canal: "email" | "slack" };

export function LembrarCheckins({ resultadoId }: { resultadoId: string }) {
  const [itens, setItens] = useState<ItemCheckin[] | null>(null);
  const [notificacoes, setNotificacoes] = useState<Notificacoes | null>(null);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<(ErroLido & { motivo?: string }) | null>(null);

  useEffect(() => {
    fetch(`/api/pdi/checkins?resultadoId=${resultadoId}`)
      .then((r) => r.json())
      .then((d) => { setItens(d.itens); setNotificacoes(d.notificacoes ?? { prontas: false, canal: "email" }); })
      .catch(() => { setItens([]); setNotificacoes({ prontas: false, canal: "email" }); });
  }, [resultadoId]);

  async function criar() {
    setErro(null);
    setCriando(true);
    try {
      const r = await fetch("/api/pdi/checkins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resultadoId }) });
      if (!r.ok) {
        const lido = await lerErro(r.clone());
        const corpo = await r.json().catch(() => ({}));
        setErro({ ...lido, motivo: typeof corpo?.motivo === "string" ? corpo.motivo : undefined });
        return;
      }
      const d = await r.json();
      setItens(d.itens);
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setCriando(false);
    }
  }

  if (itens === null || notificacoes === null) return null;

  const porOnde = notificacoes.canal === "slack" ? "no Slack" : "por e-mail";

  return (
    <div className="card shadow-none px-[22px] py-4 flex flex-col gap-2.5">
      {itens.length > 0 ? (
        // new Date(`${aaaa-mm-dd}T00:00:00`) fixa meia-noite local antes de formatar: passar a string
        // direto para data() a interpretaria como UTC e poderia exibir o dia anterior.
        <p className="text-sm">
          <strong>Check-ins agendados {porOnde}:</strong> {itens.map((i) => `${i.marco} dias (${data(new Date(`${i.dataUnica}T00:00:00`), { comAno: true })})`).join(" · ")}.
        </p>
      ) : notificacoes.prontas ? (
        <>
          <p className="text-sm text-ink-2">Você recebe um lembrete {porOnde} em 30, 60 e 90 dias, com as ações de cada marco e um link para registrar o que avançou.</p>
          <div>
            <button type="button" className="btn-ghost" onClick={criar} disabled={criando}>
              {criando ? "Agendando" : "Lembrar dos check-ins"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-2">Configure as notificações para receber os lembretes de check-in em 30, 60 e 90 dias.</p>
          <div>
            <a href="/setup#notificacoes" className="btn-ghost">Configurar notificações</a>
          </div>
        </>
      )}
      {erro && (
        // O link fica nos children (href literal), não na prop `acao`: uma URL como propriedade de objeto conta como jargão para o verificador.
        <Aviso tom="danger" acao={erro.motivo === "notificacoes" ? undefined : erro.acao}>
          {erro.mensagem} {erro.motivo === "notificacoes" && <a href="/setup#notificacoes" className="underline">Configurar notificações</a>}
        </Aviso>
      )}
    </div>
  );
}

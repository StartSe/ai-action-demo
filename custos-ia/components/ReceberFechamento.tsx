"use client";

import { useEffect, useState } from "react";
import { Item } from "@/components/ui";

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };
type RotinaResumida = { id: string; tipo: string };

const TIPO = "fechamento-mensal";

/** Depois de ver o gasto, oferece a rotina mensal (todo dia 1 às 8h) com o fechamento do mês anterior:
 * total, contra o planejado, maior variação, novas assinaturas e alertas. Não tem parâmetro nenhum (é sempre a
 * mesma empresa), então só existe uma — mesmo desenho do "Receber o resumo toda semana" do Simulador de Vendas.
 * Quem cria a rotina precisa passar o destino explícito das notificações (lido do /api/setup), senão o e-mail
 * de destino padrão não é usado na hora do envio. */
export function ReceberFechamento() {
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        const integracao = (d.integracoes || []).find((i: { id: string }) => i.id === "notificacoes");
        const campos: { chave: string; valorVisivel?: string }[] = integracao?.campos || [];
        const canal = campos.find((c) => c.chave === "NOTIFICACOES_CANAL")?.valorVisivel === "slack" ? "slack" : "email";
        const destino = campos.find((c) => c.chave === "NOTIFICACOES_DESTINO")?.valorVisivel || "";
        setNotificacoes({ configurada: Boolean(integracao?.configurada), canal, destino });
      })
      .catch(() => setNotificacoes({ configurada: false, canal: "email", destino: "" }));
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => {
        const existente = (d.itens || []).find((i: RotinaResumida) => i.tipo === TIPO);
        setRotinaId(existente?.id ?? null);
      })
      .catch(() => setRotinaId(null));
  }, []);

  async function criar() {
    if (!notificacoes?.configurada) return;
    setCriando(true);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: TIPO,
          frequencia: "mensal",
          diaMes: 1,
          hora: "08:00",
          canal: notificacoes.canal,
          destino: notificacoes.canal === "email" ? notificacoes.destino || undefined : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível criar a rotina.");
      setRotinaId(d.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível criar a rotina.");
    } finally {
      setCriando(false);
    }
  }

  if (rotinaId === undefined || notificacoes === null) return null;

  return (
    <Item className="mt-4">
      {rotinaId ? (
        <p className="text-muted text-sm">Você já recebe o fechamento do mês anterior todo dia 1 às 8h.</p>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          {notificacoes.configurada ? (
            <button type="button" className="btn-ghost !w-auto" onClick={criar} disabled={criando}>
              {criando ? "Criando..." : "Receber o fechamento todo mês"}
            </button>
          ) : (
            <a href="/setup#notificacoes" className="btn-ghost !w-auto">Receber o fechamento todo mês</a>
          )}
          <span className="text-[12.5px] text-muted">Todo dia 1 às 8h: total, contra o planejado, maior variação, novas assinaturas e alertas do mês que fechou</span>
        </div>
      )}
    </Item>
  );
}

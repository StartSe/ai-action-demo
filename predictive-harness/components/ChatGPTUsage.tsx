"use client";
import { useCallback, useEffect, useState } from "react";
import type { ChatGPTUsage as Usage, UsageWindow } from "@/lib/account-usage";
import { request } from "./ui";
function janela(w: UsageWindow, padrao: string) {
  const m = w.windowDurationMins;
  return !m ? padrao : m % 1440 === 0 ? `${m / 1440} dias` : m % 60 === 0 ? `${m / 60} horas` : `${m} minutos`;
}
export function ChatGPTUsage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const atualizar = useCallback(async () => {
    setBusy(true);
    try {
      setUsage(await request<Usage>("/api/chatgpt/usage"));
      setErro("");
    } catch {
      setErro("Não foi possível consultar os limites agora.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void atualizar(), 0);
    const timer = setInterval(() => document.visibilityState === "visible" && void atualizar(), 60000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [atualizar]);
  return (
    <div className="subcartao">
      <h4>Limites da assinatura <button className="text-button" style={{ marginLeft: "auto", padding: 0 }} disabled={busy} onClick={() => void atualizar()}>{busy ? "Consultando…" : "Atualizar"}</button></h4>
      <p>Uso da conta pelo Codex, compartilhado com outras sessões.</p>
      {erro && <p role="status">{erro}</p>}
      {usage?.buckets.map((b, i) => (
        <div key={b.limitId || i}>
          {([b.primary, b.secondary] as const).map((w, j) => w && (
            <div className="usage-window" key={j}>
              <div><span>{janela(w, j ? "Limite adicional" : "Limite principal")}</span><span>{Math.round(100 - w.usedPercent)}% disponível</span></div>
              <progress value={100 - w.usedPercent} max={100} />
              {w.resetsAt && <small>Renova em {new Date(w.resetsAt * 1000).toLocaleString("pt-BR")}</small>}
            </div>
          ))}
        </div>
      ))}
      {usage && !usage.buckets.some((b) => b.primary || b.secondary) && <p>A conta não informou limites nesta consulta.</p>}
    </div>
  );
}

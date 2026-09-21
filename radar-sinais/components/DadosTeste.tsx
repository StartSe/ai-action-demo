"use client";
import { useEffect, useState } from "react";
import { useConfirmacao } from "./ui";

export function DadosTeste({ aoRemover }: { aoRemover?: () => void }) {
  const [total, setTotal] = useState<number>();
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const { confirmar, Dialogo } = useConfirmacao();
  useEffect(() => {
    let ativo = true;
    fetch("/api/radar/exemplos").then(r => r.ok ? r.json() : null).then(d => { if (ativo && d) setTotal(d.total); }).catch(() => {});
    return () => { ativo = false; };
  }, []);
  async function remover() {
    if (!await confirmar("Remover os radares de demonstração e ocultar o mapa de exemplo? Seus radares reais, temas, integrações e monitoramentos serão mantidos.", { confirmarRotulo: "Remover exemplos" })) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/radar/exemplos", { method: "DELETE" });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setTotal(0);
      setMensagem(`${d.removidos} radar(es) de demonstração removido(s). Os exemplos estão ocultos.`);
      window.dispatchEvent(new Event("radar-dados"));
      aoRemover?.();
    } catch { setMensagem("Não foi possível remover os exemplos. Tente novamente."); }
    finally { setOcupado(false); }
  }
  return <div className="card p-4 mt-4 text-sm">
    <h3 className="font-bold">Dados de teste</h3>
    <p className="text-muted mt-1">{total === undefined ? "Remova os exemplos para começar com seus dados." : `${total} radar(es) de demonstração salvo(s).`} A limpeza mantém seus dados reais e suas configurações.</p>
    <button className="btn-ghost mt-3 !text-sm" disabled={ocupado} onClick={remover}>{ocupado ? "Removendo…" : "Remover dados de teste"}</button>
    {mensagem && <p role="status" className="mt-2">{mensagem}</p>}
    {Dialogo}
  </div>;
}

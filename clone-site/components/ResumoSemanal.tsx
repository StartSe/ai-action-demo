"use client";
// "Receber este resumo toda semana": cria (ou mostra) a rotina `resumo-site` deste site — segunda-feira às 09:00,
// por e-mail ou Slack (POST /api/rotinas com parametros { projetoId }). Aparece no rodapé do painel Métricas.
import { useEffect, useState, type FormEvent } from "react";
import { Aviso, lerErro } from "./ui";
import { ACAO_CONFIGURAR_AVISOS } from "@/lib/acoes";

type Rotina = { id: string; tipo: string; canal: "email" | "slack"; destino: string | null; ativa: boolean; parametros: { projetoId?: string } | null; ultimaExecucao: string | null };
type Lista = { itens: Rotina[]; destinoPadrao: string };

export function ResumoSemanal({ projetoId }: { projetoId: string }) {
  const [rotina, setRotina] = useState<Rotina | null | undefined>(undefined);
  const [destinoPadrao, setDestinoPadrao] = useState("");
  const [aberto, setAberto] = useState(false);
  const [canal, setCanal] = useState<"email" | "slack">("email");
  const [destino, setDestino] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<{ texto: string; configurar?: boolean } | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch("/api/rotinas")
      .then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json() as Promise<Lista>; })
      .then((d) => {
        if (!ativo) return;
        setRotina(d.itens.find((r) => r.tipo === "resumo-site" && r.parametros?.projetoId === projetoId) ?? null);
        setDestinoPadrao(d.destinoPadrao || "");
      })
      .catch(() => { if (ativo) setRotina(null); });
    return () => { ativo = false; };
  }, [projetoId]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/rotinas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "resumo-site", frequencia: "semanal", diaSemana: 1, hora: "09:00", canal, destino: destino.trim() || undefined, parametros: { projetoId } }) });
      if (!r.ok) {
        const info = await lerErro(r);
        setErro({ texto: info.mensagem, configurar: /Notificações|Gmail|Outlook|Resend|SMTP|canal/i.test(info.mensagem) });
        return;
      }
      const { id } = await r.json();
      setRotina({ id, tipo: "resumo-site", canal, destino: destino.trim() || destinoPadrao || null, ativa: true, parametros: { projetoId }, ultimaExecucao: null });
      setAberto(false);
    } catch (err) {
      setErro({ texto: (await lerErro(err)).mensagem });
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    if (!rotina || !window.confirm("Deixar de receber o resumo semanal deste site?")) return;
    setOcupado(true);
    try {
      const r = await fetch(`/api/rotinas/${rotina.id}`, { method: "DELETE" });
      if (!r.ok) { setErro({ texto: (await lerErro(r)).mensagem }); return; }
      setRotina(null);
    } finally {
      setOcupado(false);
    }
  }

  if (rotina === undefined) return null;

  return (
    <div className="border-t border-line pt-3 flex flex-col gap-2">
      {rotina ? (
        <div className="flex items-center justify-between gap-3 flex-wrap text-[13px]">
          <span className="text-ink-2">Você recebe este resumo às segundas, às 9h, por {rotina.canal === "slack" ? "Slack" : `e-mail${rotina.destino ? ` (${rotina.destino})` : ""}`}.</span>
          <button type="button" className="btn-link !text-muted text-[12.5px]" disabled={ocupado} onClick={apagar}>Parar de receber</button>
        </div>
      ) : !aberto ? (
        <button type="button" className="btn-link text-[13px] self-start" onClick={() => setAberto(true)}>Receber este resumo toda semana</button>
      ) : (
        <form onSubmit={criar} className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-2">Toda segunda, às 9h: visitas da semana, comparação e a primeira sugestão do agente.</p>
          <div className="flex gap-2 max-md:flex-col">
            <select className="input !w-auto" aria-label="Canal" value={canal} disabled={ocupado} onChange={(e) => setCanal(e.target.value as "email" | "slack")}>
              <option value="email">Por e-mail</option>
              <option value="slack">No Slack</option>
            </select>
            <input className="input flex-1 min-w-0" aria-label={canal === "email" ? "E-mail de destino" : "Canal do Slack (opcional)"} placeholder={canal === "email" ? destinoPadrao || "voce@empresa.com" : "#canal (opcional)"} value={destino} disabled={ocupado} onChange={(e) => setDestino(e.target.value)} />
            <button type="submit" className="btn-primary !w-auto !h-11 shrink-0" disabled={ocupado}>{ocupado ? "Criando..." : "Ativar"}</button>
            <button type="button" className="btn-ghost shrink-0" disabled={ocupado} onClick={() => setAberto(false)}>Cancelar</button>
          </div>
        </form>
      )}
      {erro && <Aviso tom="danger" acao={erro.configurar ? ACAO_CONFIGURAR_AVISOS : undefined}>{erro.texto}</Aviso>}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { ACERTOS_TREINO, dicaBase, type DicaTreino } from "@/lib/coaching-comum";
import { Icone } from "./MenuAcoes";

export function DicaConversa({ codigo, sessao = codigo, turno, ultimaFala, aguardando }: { codigo: string; sessao?: string; turno: number; ultimaFala: string; aguardando: boolean }) {
  const [resposta, setResposta] = useState<{ turno: number; dica: DicaTreino } | null>(null);
  const [acerto, setAcerto] = useState<{ texto: string; turno: number } | null>(null);
  const primeiroTurno = useRef(turno);
  const limite = useRef({ quantidade: 0, ultimo: 0, turno });
  useEffect(() => {
    if (!ultimaFala || aguardando) return;
    const controller = new AbortController();
    fetch(`/api/salas/${codigo}/dica`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error("Dica indisponível"); return await r.json() as DicaTreino; })
      .then(dica => {
        if (controller.signal.aborted) return;
        setResposta({ turno, dica });
        if (!dica.acerto || !Object.hasOwn(ACERTOS_TREINO, dica.acerto.tipo) || turno <= primeiroTurno.current) return;
        try { const salvo = sessionStorage.getItem(`acertos:${sessao}`); if (salvo) limite.current = JSON.parse(salvo); } catch { /* O limite em memória funciona sem armazenamento. */ }
        if (limite.current.quantidade >= 3 || limite.current.turno >= turno || Date.now() - limite.current.ultimo < 45000) return;
        limite.current = { quantidade: limite.current.quantidade + 1, ultimo: Date.now(), turno };
        try { sessionStorage.setItem(`acertos:${sessao}`, JSON.stringify(limite.current)); } catch { /* Sem persistência, não repetimos nesta montagem. */ }
        setAcerto({ texto: ACERTOS_TREINO[dica.acerto.tipo], turno });
      })
      .catch(() => { if (!controller.signal.aborted) setResposta({ turno, dica: { texto: dicaBase(ultimaFala), origem: "orientacao" } }); });
    return () => controller.abort();
  }, [codigo, sessao, turno, ultimaFala, aguardando]);
  useEffect(() => {
    if (!acerto) return;
    const timer = setTimeout(() => setAcerto(null), 6000);
    return () => clearTimeout(timer);
  }, [acerto, resposta]);
  const dica = resposta?.turno === turno ? resposta.dica : null;
  const texto = aguardando ? "Ouvindo a conversa para orientar seu próximo passo…" : !ultimaFala ? "Apresente-se brevemente e pergunte qual desafio o cliente gostaria de resolver." : dica?.texto ?? "Preparando uma dica para sua próxima fala…";
  return (
    <aside className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950" aria-label="Orientação do treino">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-bold min-h-8 flex items-center" aria-live="polite">{acerto?.turno === turno && !aguardando ? <span className="acerto-treino"><Icone nome="check" />{acerto.texto}</span> : "✦ Dica para sua próxima fala"}</span>
        {dica && !aguardando && <span className="text-[11px] text-amber-800">{dica.origem === "demo" ? "Exemplo" : dica.origem === "ia" ? "Orientador IA" : "Orientação básica"}</span>}
      </div>
      <p className="text-sm leading-relaxed" aria-live="polite">{texto}</p>
    </aside>
  );
}

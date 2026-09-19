"use client";
import { useEffect, useState } from "react";
import { dicaBase, type DicaTreino } from "@/lib/coaching-comum";

export function DicaConversa({ codigo, turno, ultimaFala, aguardando }: { codigo: string; turno: number; ultimaFala: string; aguardando: boolean }) {
  const [resposta, setResposta] = useState<{ turno: number; dica: DicaTreino } | null>(null);
  useEffect(() => {
    if (!ultimaFala || aguardando) return;
    const controller = new AbortController();
    fetch(`/api/salas/${codigo}/dica`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error("Dica indisponível"); return await r.json() as DicaTreino; })
      .then(dica => { if (!controller.signal.aborted) setResposta({ turno, dica }); })
      .catch(() => { if (!controller.signal.aborted) setResposta({ turno, dica: { texto: dicaBase(ultimaFala), origem: "orientacao" } }); });
    return () => controller.abort();
  }, [codigo, turno, ultimaFala, aguardando]);
  const dica = resposta?.turno === turno ? resposta.dica : null;
  const texto = aguardando ? "Ouvindo a conversa para orientar seu próximo passo…" : !ultimaFala ? "Apresente-se brevemente e pergunte qual desafio o cliente gostaria de resolver." : dica?.texto ?? "Preparando uma dica para sua próxima fala…";
  return (
    <aside className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950" aria-label="Orientação do treino">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-bold uppercase tracking-wide">✦ Dica para sua próxima fala</span>
        {dica && !aguardando && <span className="text-[11px] text-amber-800">{dica.origem === "demo" ? "Exemplo" : dica.origem === "ia" ? "Orientador IA" : "Orientação básica"}</span>}
      </div>
      <p className="text-sm leading-relaxed" aria-live="polite">{texto}</p>
    </aside>
  );
}

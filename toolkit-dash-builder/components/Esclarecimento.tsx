"use client";
// Cartão do gate de esclarecimento (RF-04): 1 a 3 perguntas, cada uma com chips e um campo livre, e o botão
// "Pular e gerar agora", que gera com o pedido original.
import { useState } from "react";
import { BotaoChip } from "./ChipsArea";
import type { PerguntaEsclarecimento } from "@/lib/types";

export function Esclarecimento({ perguntas, onGerar, onPular, gerando }: { perguntas: PerguntaEsclarecimento[]; onGerar: (respostas: Record<string, string>) => void; onPular: () => void; gerando: boolean }) {
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const responder = (pergunta: string, valor: string) => setRespostas((r) => ({ ...r, [pergunta]: valor }));
  const respondidas = perguntas.filter((p) => respostas[p.pergunta]?.trim()).length;

  return (
    <div className="card p-6 max-md:p-5 reveal">
      <h2 className="text-lg font-bold mb-1">Só para acertar o painel</h2>
      <p className="text-muted text-sm mb-5">{perguntas.length === 1 ? "Uma pergunta rápida" : `${perguntas.length} perguntas rápidas`}. Responda o que souber ou pule direto para a geração.</p>
      <div className="flex flex-col gap-5">
        {perguntas.map((p, i) => {
          const campoId = `esclarecimento-${i}`; // pelo índice: a IA pode repetir o mesmo id em duas perguntas
          const atual = respostas[p.pergunta] ?? "";
          return (
            <div key={campoId}>
              <label htmlFor={campoId} className="text-[13px] font-semibold block mb-2">{p.pergunta}</label>
              <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label={`Sugestões para: ${p.pergunta}`}>
                {p.sugestoes.map((s) => (
                  <BotaoChip key={s} ativo={atual === s} desabilitado={gerando} onClick={() => responder(p.pergunta, atual === s ? "" : s)}>{s}</BotaoChip>
                ))}
              </div>
              <input id={campoId} className="input" placeholder="Ou escreva com suas palavras" value={atual} disabled={gerando} onChange={(e) => responder(p.pergunta, e.target.value)} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2.5 flex-wrap mt-6">
        <button type="button" className="btn-primary !w-auto" disabled={gerando} onClick={() => onGerar(respostas)}>
          {gerando ? "Gerando…" : respondidas > 0 ? "Gerar painel com as respostas" : "Gerar painel"}
        </button>
        <button type="button" className="btn-ghost" disabled={gerando} onClick={onPular}>Pular e gerar agora</button>
      </div>
    </div>
  );
}

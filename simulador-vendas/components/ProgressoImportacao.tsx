"use client";
import { useEffect, useRef } from "react";
const PASSOS = [
  { id: "pagina", titulo: "Lendo a página", detalhe: "Buscando as informações do produto no link informado." },
  { id: "ficha", titulo: "Preparando as sugestões", detalhe: "A IA está organizando os dados e a ficha do produto." },
  { id: "salvando", titulo: "Abrindo a revisão", detalhe: "Salvando o rascunho para você conferir e editar." },
];
export function ProgressoImportacao({ etapa, comIA = true }: { etapa: string; comIA?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const passos = comIA ? PASSOS : PASSOS.filter(p => p.id !== "ficha");
  const atual = Math.max(0, passos.findIndex(p => p.id === etapa));
  return <div ref={ref} tabIndex={-1} role="status" aria-live="polite" aria-busy="true" className="card p-8 mb-5 outline-none">
    <div className="flex items-center gap-4 mb-6">
      <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-full border-[3px] border-line border-t-accent motion-safe:animate-spin" />
      <div><h2 className="font-bold text-xl">Preparando seu produto</h2><p className="text-sm text-muted mt-1">{passos[atual].detalhe}</p></div>
    </div>
    <ol className="grid grid-cols-3 max-md:grid-cols-1 gap-4">
      {passos.map((p, i) => <li key={p.id} aria-current={i === atual ? "step" : undefined} className={`rounded-xl border p-4 ${i === atual ? "border-accent bg-accent/5" : "border-line"}`}>
        <span className="text-xs font-semibold text-muted">{i < atual ? "Concluído" : `Etapa ${i + 1}`}</span>
        <p className="font-semibold text-sm mt-1">{p.titulo}</p>
      </li>)}
    </ol>
    <p className="text-sm text-muted mt-5">Isso pode levar alguns minutos. Mantenha esta página aberta. Depois, você poderá editar todas as sugestões.</p>
  </div>;
}

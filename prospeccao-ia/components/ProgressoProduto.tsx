"use client";
import { useEffect, useRef, useState } from "react";
import type { EtapaProduto } from "@/lib/produto-progresso";

const MENSAGENS: Record<EtapaProduto, string> = {
  preparacao: "Preparando a análise…",
  leitura: "Lendo o conteúdo da página…",
  analise: "Identificando o produto, a proposta de valor e o perfil ideal…",
  revisao: "Conferindo os campos para você revisar…",
  tentativa: "A resposta veio incompleta. Estamos organizando os campos novamente…",
  demonstracao: "Preparando um exemplo ilustrativo. A IA ainda não está conectada.",
};

export function ProgressoProduto({ etapa, endereco, cancelar }: { etapa: EtapaProduto; endereco: boolean; cancelar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    const elemento = dialogo.current;
    elemento?.showModal();
    const inicio = Date.now();
    const timer = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => { clearInterval(timer); elemento?.close(); };
  }, []);
  const atual = etapa === "preparacao" || etapa === "leitura" ? 0 : etapa === "revisao" ? 2 : 1;
  const passos = [endereco ? "Ler o conteúdo da página" : "Ler a descrição informada", "Identificar produto, benefícios e perfil ideal", "Preparar os campos para revisão"];
  return (
    <dialog ref={dialogo} aria-labelledby="titulo-analise" aria-describedby="status-analise" onCancel={e => { e.preventDefault(); cancelar(); }} className="m-auto w-[calc(100%-2rem)] max-w-[520px] rounded-2xl border border-line bg-surface p-6 text-ink shadow-card backdrop:bg-black/40">
      <div className="flex items-center gap-3 mb-3">
        <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border-2 border-line border-t-accent animate-spin motion-reduce:animate-none" />
        <h2 id="titulo-analise" className="text-xl font-bold">Analisando seu produto</h2>
      </div>
      <p className="text-sm text-muted mb-5">Você poderá revisar e editar tudo antes de salvar.</p>
      {etapa !== "demonstracao" && <ol className="flex flex-col gap-4 mb-5">
        {passos.map((texto, indice) => (
          <li key={texto} aria-current={indice === atual ? "step" : undefined} className={`flex items-center gap-3 text-sm ${indice === atual ? "font-semibold text-accent" : "text-muted"}`}>
            <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line">{indice < atual ? "✓" : indice + 1}</span>
            {texto}
          </li>
        ))}
      </ol>}
      <p id="status-analise" role="status" aria-live="polite" className="text-sm text-ink-2">{MENSAGENS[etapa]}</p>
      <p className="mt-2 text-xs text-muted">{segundos}s decorridos{segundos >= 20 ? " · A análise continua. Algumas páginas e modelos levam mais tempo." : ""}</p>
      <button type="button" onClick={cancelar} className="btn-ghost mt-5">Cancelar análise</button>
    </dialog>
  );
}

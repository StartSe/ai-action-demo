"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProgressoPesquisa } from "@/lib/progresso-pesquisa";
import type { Candidato } from "@/lib/candidatos";
import { useDialogo } from "./useDialogo";

export function ProgressoEnriquecimento({ id, nome, onFechar, onConcluiu }: { id: string; nome: string; onFechar: () => void; onConcluiu: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  useDialogo(caixa, onFechar);
  const callback = useRef(onConcluiu);
  useEffect(() => { callback.current = onConcluiu; }, [onConcluiu]);
  const [dados, setDados] = useState<{ candidato: Candidato; progresso: ProgressoPesquisa | null } | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [demorado, setDemorado] = useState(false);
  useEffect(() => {
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const demora = setTimeout(() => { if (ativo) setDemorado(true); }, 120000);
    async function ler() {
      try {
        const r = await fetch(`/api/candidatos/${id}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!r.ok) throw new Error();
        const corpo = await r.json();
        if (!ativo) return;
        setDados(corpo); setErro(false);
        if (["pendente", "em_andamento"].includes(corpo.candidato.pesquisaStatus)) timer = setTimeout(ler, 1500);
        else callback.current();
      } catch { if (ativo) setErro(true); }
    }
    void ler();
    return () => { ativo = false; controller.abort(); clearTimeout(timer); clearTimeout(demora); };
  }, [id, tentativa]);
  const status = dados?.candidato.pesquisaStatus;
  const terminou = Boolean(status && status !== "pendente" && status !== "em_andamento");
  const revisar = Boolean(dados?.candidato.ficha?.web);
  const titulo = erro ? "Não conseguimos atualizar o progresso" : status === "concluida" ? revisar ? "Dados encontrados para sua revisão." : "Currículo enriquecido" : status === "sem_resultado" ? "Nenhuma informação adicional encontrada" : status === "falhou" || status === "nao_pedida" ? "Não foi possível concluir a pesquisa" : "Enriquecendo o currículo";
  return (
    <div className="fixed inset-0 z-40 bg-ink/45 backdrop-blur-sm grid place-items-center p-4">
      <div ref={caixa} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="enriquecimento-titulo" className="card w-full max-w-[560px] max-h-[90dvh] overflow-y-auto p-7 max-md:p-5">
        <p className="sobretitulo mb-2">Pesquisa de informações profissionais</p>
        <h2 id="enriquecimento-titulo" className="text-2xl font-extrabold">{titulo}</h2>
        <p className="text-sm text-muted mt-2 mb-6">{nome}</p>
        <div role="status" aria-live="polite" className="sr-only">{titulo}. {dados?.progresso?.passos.find((p) => p.estado === "em_andamento")?.titulo}</div>
        <ol className="space-y-4">
          {(dados?.progresso?.passos ?? (terminou ? [] : [{ titulo: "Consultando o andamento da pesquisa", estado: "em_andamento" }])).map((p, i) => (
            <li key={i} className="flex items-start gap-3">
              <span aria-hidden="true" className={`size-8 shrink-0 rounded-full grid place-items-center font-bold ${p.estado === "concluido" ? "bg-[#e4f4ec] text-ok" : p.estado === "em_andamento" ? "bg-accent-soft text-accent" : "bg-[#fff4e0] text-[#7a4d00]"}`}>{p.estado === "concluido" ? "✓" : p.estado === "em_andamento" ? <span className="size-4 rounded-full border-2 border-accent/25 border-t-accent motion-safe:animate-spin" /> : "!"}</span>
              <div><p className="text-sm font-semibold">{p.titulo}</p><p className="text-xs text-muted mt-0.5">{p.estado === "concluido" ? "Concluído" : p.estado === "aviso" ? "Etapa não concluída; a pesquisa continuou" : p.estado === "falhou" ? "Etapa interrompida" : erro ? "Aguardando atualização" : "Em andamento"}</p></div>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted mt-6">{erro ? "Seus dados foram preservados. Tente atualizar o andamento novamente." : terminou ? revisar ? "Os dados aguardam sua confirmação. Revise as informações encontradas e escolha se deseja atualizar a ficha." : "As informações já salvas continuam disponíveis na ficha." : demorado ? "Está levando mais tempo que o esperado. Você pode fechar esta janela e acompanhar pela ficha." : "As etapas são atualizadas conforme a pesquisa acontece. Você pode continuar trabalhando enquanto ela termina."}</p>
        <div className="flex gap-3 flex-wrap mt-6">
          {erro && <button className="btn-primary !w-auto" onClick={() => { setErro(false); setTentativa((n) => n + 1); }}>Atualizar andamento</button>}
          {terminou && revisar && <Link className="btn-primary !w-auto" href={`/candidatos/${id}#dados-encontrados`} onClick={onFechar}>Revisar dados encontrados →</Link>}
          <button type="button" className={terminou && !revisar ? "btn-primary !w-auto" : "btn-ghost"} onClick={onFechar}>{terminou ? "Voltar ao currículo" : "Continuar em segundo plano"}</button>
        </div>
      </div>
    </div>
  );
}

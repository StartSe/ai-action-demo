"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { referenciaEtapa, segundosEtapa, formatarTempo } from "@/lib/tempo-pesquisa";
import type { ProgressoPesquisa } from "@/lib/progresso-pesquisa";
import type { Candidato, ResumoFonte } from "@/lib/candidatos";
import { useDialogo } from "./useDialogo";

export function ProgressoEnriquecimento({ id, nome, onFechar, onConcluiu }: { id: string; nome: string; onFechar: () => void; onConcluiu: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  useDialogo(caixa, onFechar);
  const callback = useRef(onConcluiu);
  useEffect(() => { callback.current = onConcluiu; }, [onConcluiu]);
  const [dados, setDados] = useState<{ candidato: Candidato; progresso: ProgressoPesquisa | null; fontes: ResumoFonte[] } | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
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
      } catch { if (ativo) { setErro(true); timer = setTimeout(ler, 5000); } }
    }
    void ler();
    return () => { ativo = false; controller.abort(); clearTimeout(timer); clearTimeout(demora); };
  }, [id, tentativa]);
  const [retomando, setRetomando] = useState(false);
  const [erroRetomada, setErroRetomada] = useState("");
  async function retomar() {
    setRetomando(true); setErroRetomada("");
    try {
      const r = await fetch(`/api/candidatos/${id}/pesquisar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retomar: true }) });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo.error || "Não foi possível retomar. Tente novamente.");
      setDados((atual) => atual ? { ...atual, candidato: corpo.candidato } : atual);
      setDemorado(false); setTentativa((n) => n + 1);
    } catch (e) { setErroRetomada(e instanceof Error ? e.message : "Não foi possível retomar. Tente novamente."); }
    finally { setRetomando(false); }
  }
  const status = dados?.candidato.pesquisaStatus;
  const terminou = Boolean(status && status !== "pendente" && status !== "em_andamento");
  const passos = dados?.progresso?.passos ?? [];
  const fase = passos.length ? Math.max(...passos.map((p) => referenciaEtapa(p.titulo).fase)) : 0;
  const concluida = status === "concluida" || status === "sem_resultado";
  const percentual = concluida ? 100 : [0, 25, 60, 90][fase];
  const temColeta = dados?.fontes?.some((f) => f.tipo !== "cv" && f.url && f.resumo);
  const revisar = Boolean(dados?.candidato.ficha?.web);
  const titulo = erro ? "Não conseguimos atualizar o progresso" : status === "concluida" ? revisar ? "Dados encontrados para sua revisão." : "Currículo enriquecido" : status === "sem_resultado" ? "Nenhuma informação adicional encontrada" : status === "falhou" && temColeta ? "Dados coletados. Falta organizar." : status === "falhou" || status === "nao_pedida" ? "Não foi possível concluir a pesquisa" : "Enriquecendo o currículo";
  return (
    <div className="fixed inset-0 z-40 bg-ink/45 backdrop-blur-sm grid place-items-center p-4">
      <div ref={caixa} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="enriquecimento-titulo" className="card w-full max-w-[560px] max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden !p-0">
        <header className="shrink-0 flex items-start gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0 flex-1">
        <p className="sobretitulo mb-2">Pesquisa de informações profissionais</p>
        <h2 id="enriquecimento-titulo" className="text-xl font-extrabold">{titulo}</h2>
        <p className="text-sm text-muted mt-2">{nome}</p>
        </div>
        <button type="button" className="size-10 shrink-0 rounded-full hover:bg-accent-soft text-2xl" aria-label="Fechar pesquisa" onClick={onFechar}>×</button>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-3">
        <div role="status" aria-live="polite" className="sr-only">{titulo}. {dados?.progresso?.passos.find((p) => p.estado === "em_andamento")?.titulo}</div>
        <div className="mb-6">
          <div className="flex justify-between gap-3 text-sm mb-2"><span className="font-semibold">{concluida ? "Pesquisa finalizada" : terminou ? "Pesquisa interrompida" : ["Preparação", "Consulta das fontes", "Organização dos dados", "Preparação para revisão"][fase]}</span><span className="text-muted">{concluida ? "Encerrado" : `Fase ${fase + 1} de 4`}</span></div>
          <div role="progressbar" aria-label="Etapas do enriquecimento" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentual} aria-valuetext={concluida ? "Pesquisa finalizada" : `${terminou ? "Interrompida na fase" : "Fase"} ${fase + 1} de 4`} className="h-2 rounded-full bg-accent-soft overflow-hidden">
            <div className={`h-full rounded-full motion-safe:transition-all ${terminou && !concluida ? "bg-amber-600" : "bg-accent"}`} style={{ width: `${percentual}%` }} />
          </div>
          <p className="text-xs text-muted mt-2">A barra avança pelas fases concluídas. Estimativas de tempo são aproximadas e variam conforme as fontes e a IA.</p>
        </div>
        <ol aria-label="Etapa atual" className="space-y-4">
          {(passos.length ? [passos[passos.length - 1]] : terminou ? [] : [{ titulo: "Consultando o andamento da pesquisa", estado: "em_andamento" as const, iniciadoEm: undefined }]).map((p) => (
            <li key={`${p.titulo}-${p.iniciadoEm}`} className="flex items-start gap-3">
              <span aria-hidden="true" className={`size-8 shrink-0 rounded-full grid place-items-center font-bold ${p.estado === "concluido" ? "bg-[#e4f4ec] text-ok" : p.estado === "em_andamento" ? "bg-accent-soft text-accent" : "bg-[#fff4e0] text-[#7a4d00]"}`}>{p.estado === "concluido" ? "✓" : p.estado === "em_andamento" ? <span className="size-4 rounded-full border-2 border-accent/25 border-t-accent motion-safe:animate-spin" /> : "!"}</span>
              <div><p className="text-sm font-semibold">{p.titulo}</p><p className="text-xs text-muted mt-0.5">{p.estado === "concluido" ? "Concluído" : p.estado === "aviso" ? "Etapa não concluída; a pesquisa continuou" : p.estado === "falhou" ? "Etapa interrompida" : erro ? "Aguardando atualização" : "Em andamento"}</p>
                {p.iniciadoEm && <p className="text-xs text-muted mt-1">{segundosEtapa(p, agora) !== null && `${formatarTempo(segundosEtapa(p, agora)!)} ${p.estado === "em_andamento" ? "decorridos" : "nesta etapa"} · `}Estimativa: {referenciaEtapa(p.titulo).estimativa}{p.estado === "em_andamento" && (segundosEtapa(p, agora) ?? 0) > referenciaEtapa(p.titulo).segundos ? " · Está levando mais tempo que o estimado" : ""}</p>}
              </div>
            </li>
          ))}
        </ol>
        {passos.length > 1 && <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-accent py-2">Ver etapas anteriores ({passos.length - 1})</summary>
          <ol className="space-y-4 mt-3" aria-label="Etapas anteriores">
            {passos.slice(0, -1).map((p) => (
            <li key={`${p.titulo}-${p.iniciadoEm}`} className="flex items-start gap-3">
              <span aria-hidden="true" className={`size-8 shrink-0 rounded-full grid place-items-center font-bold ${p.estado === "concluido" ? "bg-[#e4f4ec] text-ok" : p.estado === "em_andamento" ? "bg-accent-soft text-accent" : "bg-[#fff4e0] text-[#7a4d00]"}`}>{p.estado === "concluido" ? "✓" : p.estado === "em_andamento" ? <span className="size-4 rounded-full border-2 border-accent/25 border-t-accent motion-safe:animate-spin" /> : "!"}</span>
              <div><p className="text-sm font-semibold">{p.titulo}</p><p className="text-xs text-muted mt-0.5">{p.estado === "concluido" ? "Concluído" : p.estado === "aviso" ? "Etapa não concluída; a pesquisa continuou" : p.estado === "falhou" ? "Etapa interrompida" : erro ? "Aguardando atualização" : "Em andamento"}</p>
                {p.iniciadoEm && <p className="text-xs text-muted mt-1">{segundosEtapa(p, agora) !== null && `${formatarTempo(segundosEtapa(p, agora)!)} ${p.estado === "em_andamento" ? "decorridos" : "nesta etapa"} · `}Estimativa: {referenciaEtapa(p.titulo).estimativa}{p.estado === "em_andamento" && (segundosEtapa(p, agora) ?? 0) > referenciaEtapa(p.titulo).segundos ? " · Está levando mais tempo que o estimado" : ""}</p>}
              </div>
            </li>
            ))}
          </ol>
        </details>}
        <p className="text-sm text-muted mt-6">{erro ? "Seus dados foram preservados. Tentaremos atualizar o andamento automaticamente em alguns segundos." : terminou ? status === "falhou" && temColeta ? "As fontes estão salvas. Retome a organização com IA e revise os dados antes de atualizar a ficha." : revisar ? "Os dados aguardam sua confirmação. Revise as informações encontradas e escolha se deseja atualizar a ficha." : "As informações já salvas continuam disponíveis na ficha." : demorado ? "Está levando mais tempo que o esperado. Você pode fechar esta janela e acompanhar pela ficha." : "As etapas são atualizadas conforme a pesquisa acontece. Você pode continuar trabalhando enquanto ela termina."}</p>
        {erroRetomada && <p role="alert" className="text-sm mt-3">{erroRetomada}</p>}
        {status === "falhou" && temColeta && <div className="flex gap-3 flex-wrap mt-4">
          <button type="button" className="btn-primary !w-auto" disabled={retomando} onClick={() => void retomar()}>{retomando ? "Retomando..." : "Retomar organização"}</button>
          <Link className="btn-ghost" href={`/candidatos/${id}#fontes-pesquisa`} onClick={onFechar}>Ver material salvo</Link>
        </div>}
        </div>
        <footer className="shrink-0 border-t border-line p-4 flex gap-3 flex-wrap">
          {erro && <button className="btn-primary !w-auto" onClick={() => { setErro(false); setTentativa((n) => n + 1); }}>Atualizar andamento</button>}
          {terminou && revisar && <Link className="btn-primary !w-auto" href={`/candidatos/${id}#dados-encontrados`} onClick={onFechar}>Revisar dados encontrados →</Link>}
          <button type="button" className={terminou && !revisar ? "btn-primary !w-auto" : "btn-ghost"} onClick={onFechar}>{terminou ? "Voltar ao currículo" : "Continuar em segundo plano"}</button>
        </footer>
      </div>
    </div>
  );
}

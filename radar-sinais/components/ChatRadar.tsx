"use client";
import { useEffect, useRef, useState } from "react";
import type { MensagemRadar } from "@/lib/chat-radar";
import type { Fonte, No } from "@/lib/types";
type Mensagem = MensagemRadar & { fontes?: Fonte[]; nos?: No[] };
export function ChatRadar({ resultadoId, foco, aoFocar }: { resultadoId: string; foco?: string; aoFocar?: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const controle = useRef<AbortController | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => () => controle.current?.abort(), []);
  useEffect(() => { fim.current?.scrollIntoView({ block: "nearest" }); }, [mensagens, ocupado, aberto]);
  function fechar() { setAberto(false); botao.current?.focus(); }
  async function perguntar(pergunta = texto) {
    if (!pergunta.trim() || controle.current) return;
    const historico: Mensagem[] = [...mensagens, { papel: "usuario", texto: pergunta.trim() }];
    const ac = new AbortController(); controle.current = ac;
    setOcupado(true); setErro(""); setTexto(""); setMensagens(historico);
    try {
      const r = await fetch("/api/radar/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ac.signal, body: JSON.stringify({ resultadoId, foco, mensagens: historico.slice(-11).map(({ papel, texto }) => ({ papel, texto })) }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível conversar agora.");
      setMensagens([...historico, { papel: "agente", texto: d.resposta, fontes: d.fontes, nos: d.nos }]);
    } catch (e) { if (!ac.signal.aborted) { setMensagens(mensagens); setTexto(pergunta); setErro((e as Error).message); } }
    finally { controle.current = null; if (!ac.signal.aborted) setOcupado(false); }
  }
  return <div className="chat-radar no-print" onKeyDown={e => { if (aberto && e.key === "Escape") { e.stopPropagation(); fechar(); } }}>
    {aberto && <section className="chat-radar-painel" role="region" aria-label="Conversa com a Analista do Radar">
      <header className="flex justify-between items-center p-4 border-b border-line"><div><h2 className="font-bold">Analista do Radar</h2><p className="text-xs text-muted">Contexto: a análise aberta e o ponto selecionado</p></div><button className="btn-ghost !px-3" aria-label="Fechar conversa" onClick={fechar}>×</button></header>
      <div className="chat-radar-mensagens" role="log" aria-live="polite">
        {!mensagens.length && <><p className="text-sm text-muted">Explore conexões, questione os sinais e encontre próximos passos com base nas fontes desta análise.</p><div className="flex flex-col gap-2 mt-4">{["Quais sinais merecem atenção primeiro?", "Que conexões do grafo explicam uma oportunidade?", "Que evidências ainda precisamos validar?"].map(p => <button className="text-left text-sm p-3 rounded-lg border border-line hover:bg-accent-soft" key={p} onClick={() => perguntar(p)}>{p}</button>)}</div></>}
        {mensagens.map((m, i) => <article key={i} className={`chat-mensagem ${m.papel}`}><p className="text-xs font-semibold mb-1">{m.papel === "usuario" ? "Você" : "Analista"}</p><p className="whitespace-pre-wrap text-sm">{m.texto}</p>{!!m.nos?.length && aoFocar && <div className="flex flex-wrap gap-2 mt-2">{m.nos.map(n => <button className="btn-link text-xs text-left" key={n.id} onClick={() => aoFocar(n.id)}>Ver no mapa: {n.rotulo}</button>)}</div>}{!!m.fontes?.length && <ul className="text-xs mt-3 space-y-2">{m.fontes.map(f => <li key={f.url}><a className="btn-link" href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo}</a></li>)}</ul>}</article>)}
        {ocupado && <p className="text-sm text-muted" role="status">Analisando as conexões…</p>}
        <div ref={fim} />
      </div>
      {erro && <p role="alert" className="text-sm px-4 pb-2">{erro}</p>}
      <form className="flex gap-2 border-t border-line p-3" onSubmit={e => { e.preventDefault(); void perguntar(); }}><label className="sr-only" htmlFor="pergunta-radar">Pergunta sobre o radar</label><textarea id="pergunta-radar" autoFocus className="input !text-sm !min-h-16 resize-none" rows={2} maxLength={4000} required value={texto} onChange={e => setTexto(e.target.value)} placeholder="Pergunte sobre esta análise…" /><button className="btn-primary !w-auto !px-3 self-end" disabled={ocupado || !texto.trim()}>Enviar</button></form>
    </section>}
    <button ref={botao} type="button" className="chat-radar-botao" aria-expanded={aberto} onClick={() => aberto ? fechar() : setAberto(true)}>{aberto ? "Fechar conversa" : "✦ Conversar com a analista"}</button>
  </div>;
}

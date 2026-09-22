"use client";
import { useEffect, useRef, useState } from "react";
import type { MensagemSalva } from "@/lib/chat-memoria";
import type { Fonte, No } from "@/lib/types";
import { pedidoJSON } from "@/lib/pedido-json";
import { RadarMarca, VozIcone } from "./RadarMarca";
import { VozRadar } from "./VozRadar";
type Conversa = { nome: string; radarId: string; mensagens: MensagemSalva[]; analises: number };
type Resposta = { resposta: string; fontes: Fonte[]; nos: No[]; mensagens: MensagemSalva[] };
export function ChatRadar({ resultadoId, foco, aoFocar }: { resultadoId: string; foco?: string; aoFocar?: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [modoVoz, setModoVoz] = useState(false);
  const [conversa, setConversa] = useState<Conversa>();
  const [texto, setTexto] = useState("");
  const [pendente, setPendente] = useState("");
  const [erro, setErro] = useState("");
  const [revisao, setRevisao] = useState(0);
  const controle = useRef<AbortController | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => () => controle.current?.abort(), []);
  useEffect(() => {
    if (!aberto) return;
    const ac = new AbortController();
    pedidoJSON<Conversa>(`/api/radar/chat?resultadoId=${resultadoId}`, { signal: ac.signal }).then(c => { setConversa(c); setErro(""); }).catch(e => { if (!ac.signal.aborted) setErro(e.message); });
    return () => ac.abort();
  }, [aberto, resultadoId, revisao]);
  useEffect(() => { fim.current?.scrollIntoView({ block: "nearest" }); }, [conversa, pendente, aberto, modoVoz]);
  const pronta = Boolean(conversa);
  useEffect(() => { if (aberto && pronta && !modoVoz) campo.current?.focus({ preventScroll: true }); }, [aberto, pronta, modoVoz]);
  useEffect(() => {
    if (!aberto) return;
    const escapar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      e.preventDefault(); e.stopImmediatePropagation(); setModoVoz(false); setAberto(false); botao.current?.focus();
    };
    document.addEventListener("keydown", escapar, true);
    return () => document.removeEventListener("keydown", escapar, true);
  }, [aberto]);
  function fechar() { setModoVoz(false); setAberto(false); botao.current?.focus(); }
  async function perguntar(pergunta = texto, signal?: AbortSignal) {
    if (!pergunta.trim() || controle.current) throw new Error("Aguarde a resposta anterior.");
    const ac = new AbortController(); controle.current = ac;
    setErro(""); setTexto(""); setPendente(pergunta);
    try {
      const d = await pedidoJSON<Resposta>("/api/radar/chat", { method: "POST", signal: signal ? AbortSignal.any([signal, ac.signal]) : ac.signal, body: JSON.stringify({ resultadoId, foco, pergunta, canal: signal ? "voz" : "texto" }) });
      setConversa(c => c ? { ...c, mensagens: [...c.mensagens, ...d.mensagens] } : c);
      return JSON.stringify({ resposta: d.resposta, fontes: d.fontes, nos: d.nos });
    } catch (e) {
      if (!ac.signal.aborted && !signal?.aborted) { setTexto(pergunta); setErro((e as Error).message); }
      throw e;
    } finally { controle.current = null; setPendente(""); }
  }
  const enviar = (p = texto) => { void perguntar(p).catch(() => {}); };
  return <div className="chat-radar no-print" onKeyDown={e => { if (aberto && e.key === "Escape") { e.stopPropagation(); fechar(); } }}>
    {aberto && <section id="conversa-radar" className="chat-radar-painel" role="region" aria-label="Conversa com a Analista do Radar">
      <header className="chat-radar-header"><div className="flex items-center gap-2"><RadarMarca /><div><h2>Analista do Radar</h2><p title={conversa?.nome}>{conversa ? `Você está no radar ${conversa.nome}` : "Carregando a memória…"}</p></div></div><button className="radar-icon-button" aria-label="Minimizar conversa" onClick={fechar}>−</button></header>
      {modoVoz ? <VozRadar resultadoId={resultadoId} aoPerguntar={perguntar} aoFechar={() => { setModoVoz(false); setRevisao(v => v + 1); }} /> : <>
        <div className="chat-radar-mensagens" role="log" aria-live="polite" aria-busy={!!pendente}>
          {conversa && !conversa.mensagens.length && !pendente && <div className="chat-radar-welcome"><div className="radar-wordmark"><RadarMarca tamanho={44} /><span>radar</span></div><h3>Olá!</h3><p>Explore conexões, questione os sinais e descubra seus próximos passos.</p><div className="chat-suggestions">{["Quais sinais merecem atenção primeiro?", "O que é oportunidade e o que pode ser hype?"].map(p => <button key={p} onClick={() => enviar(p)}>{p}<span aria-hidden="true">↗</span></button>)}</div><small>Leituras, fontes e análises deste radar entram na conversa.</small></div>}
          {conversa?.mensagens.map(m => <article key={m.id} className={`chat-mensagem ${m.papel}`}><p className="sr-only">{m.papel === "usuario" ? "Você" : "Analista"}</p>{m.papel === "agente" && <span className="chat-agent-mark"><RadarMarca tamanho={19} /></span>}<div><p className="whitespace-pre-wrap">{m.texto}</p>{!!m.nos?.length && <div className="chat-references">{m.nos.map(n => m.resultadoId === resultadoId && aoFocar ? <button className="btn-link" key={n.id} onClick={() => aoFocar(n.id)}>Ver no mapa: {n.rotulo}</button> : <a className="btn-link" key={n.id} href={`/r/${m.resultadoId}?foco=${encodeURIComponent(n.id)}`}>{n.rotulo} ↗</a>)}</div>}{!!m.fontes?.length && <details className="chat-sources"><summary>{m.fontes.length} {m.fontes.length === 1 ? "fonte" : "fontes"}</summary>{m.fontes.map(f => <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo} ↗</a>)}</details>}{m.canal === "voz" && <small className="text-muted">Conversa por voz</small>}</div></article>)}
          {pendente && <><article className="chat-mensagem usuario"><p>{pendente}</p></article><p className="chat-thinking" role="status"><span /> Consultando sinais e leituras…</p></>}
          {!conversa && !erro && <p className="text-sm text-muted" role="status">Recuperando sua conversa…</p>}
          <div ref={fim} />
        </div>
        {erro && <p role="alert" className="chat-error">{erro} {!conversa && <button className="btn-link" onClick={() => setRevisao(v => v + 1)}>Tentar novamente</button>}</p>}
        <div className="chat-composer-wrap"><form className="chat-composer" onSubmit={e => { e.preventDefault(); enviar(); }}><label className="sr-only" htmlFor="pergunta-radar">Pergunta sobre o radar</label><textarea ref={campo} id="pergunta-radar" autoFocus rows={1} maxLength={4000} disabled={!conversa} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Pergunte ao seu radar…" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (texto.trim() && !pendente) enviar(); } }} /><div className="chat-composer-actions"><button type="button" className="chat-voice-button" title="Conversar por voz" aria-label="Iniciar conversa por voz" disabled={!!pendente || !conversa} onClick={() => setModoVoz(true)}><VozIcone /></button>{texto.trim() && <button className="chat-send-button" disabled={!!pendente || !conversa} aria-label="Enviar pergunta"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v15"/></svg></button>}</div></form><p className="chat-memory-note">Memória deste radar · {conversa?.analises || 0} análises em contexto</p></div>
      </>}
    </section>}
    <button ref={botao} type="button" className={`chat-radar-botao ${aberto ? "aberto" : ""}`} aria-label={aberto ? "Fechar conversa" : "Conversar com a analista"} aria-expanded={aberto} aria-controls={aberto ? "conversa-radar" : undefined} onClick={() => aberto ? fechar() : setAberto(true)}>{aberto ? <span aria-hidden="true">×</span> : <><RadarMarca tamanho={26} /><span>Conversar com o radar</span></>}</button>
  </div>;
}
